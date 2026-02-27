const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { getPlayer } = require('./auth');
const { getIO } = require('../services/gameLoop');

const MIN_BID_INCREMENT = 2000000; // Minimum 2M₺ artırım

router.get('/', async (req, res) => {
    try {
        const pid = req.playerId;

        let [auctions] = await pool.query(`
            SELECT a.*, c.year, c.km, m.name, b.name as brand_name, m.base_price, b.logo_emoji 
            FROM auctions a
            JOIN cars c ON a.car_id = c.id
            JOIN models m ON c.model_id = m.id
            JOIN brands b ON m.brand_id = b.id
            WHERE a.status = 'active' AND a.end_time > NOW()
            ORDER BY a.id DESC LIMIT 1
        `);

        if (auctions.length === 0) {
            return res.json({ success: true, active: false });
        }

        const auction = auctions[0];

        // Eğer kendisi en yüksek teklifi verdiyse belirteç yolla
        const isHighestBidder = auction.highest_bidder_id === pid;

        // Kalan süreyi hesapla
        const timeRemaining = Math.max(0, Math.floor((new Date(auction.end_time).getTime() - Date.now()) / 1000));

        let highestBidderName = "Henüz teklif yok";
        if (auction.highest_bidder_id) {
            const [pRes] = await pool.query('SELECT username FROM player WHERE id = ?', [auction.highest_bidder_id]);
            if (pRes.length > 0) highestBidderName = pRes[0].username;
        }

        res.json({
            success: true,
            active: true,
            auction: {
                id: auction.id,
                car_name: `${auction.brand_name} ${auction.name}`,
                logo_emoji: auction.logo_emoji,
                year: auction.year,
                km: auction.km,
                base_price: auction.base_price,
                starter_price: auction.starter_price,
                current_bid: auction.current_bid,
                highest_bidder_name: highestBidderName,
                is_highest_bidder: isHighestBidder,
                time_remaining: timeRemaining,
                min_next_bid: auction.current_bid === 0 ? auction.starter_price : auction.current_bid + MIN_BID_INCREMENT
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/bid', async (req, res) => {
    try {
        const pid = req.playerId;
        const { auctionId, bidAmount } = req.body;

        const [auctions] = await pool.query('SELECT * FROM auctions WHERE id = ? AND status = "active"', [auctionId]);
        if (auctions.length === 0) return res.json({ success: false, error: 'Müzayede bulunamadı veya sona erdi.' });

        const auction = auctions[0];
        const now = new Date();
        const endTime = new Date(auction.end_time);

        if (now > endTime) return res.json({ success: false, error: 'Müzayede süresi dolmuş!' });

        const minValidBid = auction.current_bid === 0 ? auction.starter_price : auction.current_bid + MIN_BID_INCREMENT;

        if (bidAmount < minValidBid) return res.json({ success: false, error: `Teklifiniz en az ${minValidBid.toLocaleString('tr-TR')}₺ olmalıdır!` });

        if (auction.highest_bidder_id === pid) return res.json({ success: false, error: 'Zaten en yüksek teklifi veren sizsiniz!' });

        const p = await getPlayer(pid);
        if (p.balance < bidAmount) return res.json({ success: false, error: 'Bakiyeniz bu teklifi vermek için yetersiz!' });

        // Önceki teklif sahibine parasını iade et
        if (auction.highest_bidder_id && auction.highest_bidder_id !== pid) {
            await pool.query('UPDATE player SET balance = balance + ? WHERE id = ?', [auction.current_bid, auction.highest_bidder_id]);
            await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "income", ?, "Müzayede Teklifi Aşıldı (İade)")', [auction.highest_bidder_id, auction.current_bid]);
            await pool.query('INSERT INTO notifications (player_id, type, title, message) VALUES (?, "system", "Müzayede Uyarı!", "Müzayedede teklifiniz aşıldı! Paranız hesabınıza iade edildi.")', [auction.highest_bidder_id]);
        }

        // Yeni teklif sahibinden parayı kes ve güncelle
        await pool.query('UPDATE player SET balance = balance - ? WHERE id = ?', [bidAmount, pid]);
        await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "expense", ?, "Müzayede Teklifi (Emanet)")', [pid, bidAmount]);

        // Müzayedeye süresi bitmeye 1 dakikadan az kaldıysa +1 dakika uzat (Sniping koruması)
        let newEndTime = endTime;
        const timeRemaining = Math.floor((endTime.getTime() - Date.now()) / 1000);
        let extraQuery = '';
        let queryParams = [bidAmount, pid, auctionId];

        if (timeRemaining < 60) {
            const extendedTime = new Date(Date.now() + 60000);
            extraQuery = ', end_time = ?';
            queryParams = [bidAmount, pid, extendedTime, auctionId];
            newEndTime = extendedTime;
        }

        await pool.query(`UPDATE auctions SET current_bid = ?, highest_bidder_id = ? ${extraQuery} WHERE id = ?`, queryParams);

        // Global Bildirim Gönder (opsiyonel io)
        const io = getIO();
        if (io) {
            io.emit('auction_update', { message: 'Müzayede durumu güncellendi!' });
        }

        res.json({ success: true, message: 'Teklif başarıyla verildi!', player: await getPlayer(pid) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
