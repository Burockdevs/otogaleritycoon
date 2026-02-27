const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { getPlayer } = require('./auth');

// Mevcut aktif lotoyu veya en son lotoyu getir
router.get('/', async (req, res) => {
    try {
        let [lotteries] = await pool.query('SELECT * FROM lottery WHERE status = "active" ORDER BY id DESC LIMIT 1');

        // Eğer aktif loto yoksa yeni bir tane oluştur
        if (lotteries.length === 0) {
            // Bugün gece yarısına ayarla
            const now = new Date();
            const drawDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            // Eğer şu an saat 23:59'u geçtiyse yarına ayarla
            if (now > drawDate) drawDate.setDate(drawDate.getDate() + 1);

            await pool.query('INSERT INTO lottery (status, ticket_price, total_pool, draw_date) VALUES ("active", 100000, 0, ?)', [drawDate]);
            [lotteries] = await pool.query('SELECT * FROM lottery WHERE status = "active" ORDER BY id DESC LIMIT 1');
        }

        const activeLoto = lotteries[0];

        // Toplam katılımcı sayısı
        const [participants] = await pool.query('SELECT COUNT(DISTINCT player_id) as count FROM lottery_tickets WHERE lottery_id = ?', [activeLoto.id]);

        // Benim bilet sayım
        const [myTickets] = await pool.query('SELECT COUNT(*) as count FROM lottery_tickets WHERE lottery_id = ? AND player_id = ?', [activeLoto.id, req.playerId]);

        // Geçmiş çekilişler
        const [history] = await pool.query(`
            SELECT l.id, l.total_pool, l.draw_date, l.status, p.username as winner_name 
            FROM lottery l 
            LEFT JOIN player p ON l.winner_id = p.id 
            WHERE l.status != 'active' 
            ORDER BY l.id DESC LIMIT 5
        `);

        res.json({
            success: true,
            data: {
                active: activeLoto,
                participantCount: participants[0].count,
                myTickets: myTickets[0].count,
                history
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Bilet satın al
router.post('/buy', async (req, res) => {
    try {
        const pid = req.playerId;
        const [lotteries] = await pool.query('SELECT * FROM lottery WHERE status = "active" ORDER BY id DESC LIMIT 1');
        if (lotteries.length === 0) return res.json({ success: false, error: 'Şu an aktif bir çekiliş yok.' });

        const loto = lotteries[0];
        const p = await getPlayer(pid);

        if (p.is_seized) return res.json({ success: false, error: 'Hesabınız hacizli!' });
        if (p.balance < loto.ticket_price) return res.json({ success: false, error: 'Yetersiz bakiye!' });

        // Maksimum bilet sınırı (Örn: 10 bilet)
        const [myTickets] = await pool.query('SELECT COUNT(*) as count FROM lottery_tickets WHERE lottery_id = ? AND player_id = ?', [loto.id, pid]);
        if (myTickets[0].count >= 10) return res.json({ success: false, error: 'Bir çekiliş için maksimum 10 bilet alabilirsiniz.' });

        // Ödeme al
        await pool.query('UPDATE player SET balance = balance - ? WHERE id = ?', [loto.ticket_price, pid]);
        await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "expense", ?, "Loto Bileti")', [pid, loto.ticket_price]);
        await pool.query('INSERT INTO profit_history (player_id, type, amount, description) VALUES (?, "expense", ?, "Loto Bileti")', [pid, loto.ticket_price]);

        // Havuza ekle ve bilet kes
        await pool.query('UPDATE lottery SET total_pool = total_pool + ? WHERE id = ?', [loto.ticket_price, loto.id]);
        await pool.query('INSERT INTO lottery_tickets (lottery_id, player_id) VALUES (?, ?)', [loto.id, pid]);

        res.json({ success: true, message: 'Bilet başarıyla satın alındı! Bol şans.', player: await getPlayer(pid) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
