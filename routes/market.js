const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { calculateMarketValue, evaluateBargain, calculateAppraisalValue } = require('../services/pricing');
const { checkLevelUp } = require('../services/levelUp');

// Achievement kontrolü için lazy load (circular dependency önlemek için)
let checkAndUnlockAchievements = null;
function getAchievementChecker() {
    if (!checkAndUnlockAchievements) {
        checkAndUnlockAchievements = require('./player').checkAndUnlockAchievements;
    }
    return checkAndUnlockAchievements;
}

// Kademeli vergi oranı (oyuncu seviyesine göre)
async function getTaxRate(playerId) {
    try {
        const [rows] = await pool.query('SELECT level FROM player WHERE id = ?', [playerId]);
        if (rows.length === 0) return 0.15;
        const level = rows[0].level || 1;
        if (level <= 5) return 0.05;
        if (level <= 10) return 0.12;
        if (level <= 30) return 0.20;
        return 0.30;
    } catch (err) {
        return 0.15; // fallback
    }
}

// =================== PİYASA EKOSİSTEM DÜZENLEYİCİ ===================
async function recycleCarToMarket(connection, carId) {
    try {
        const [marketCountRes] = await connection.query("SELECT COUNT(*) as c FROM cars WHERE owner_type='market' AND is_available=1");
        const totalMarketCars = marketCountRes[0].c;

        let recycleChance = 0.65;
        if (totalMarketCars < 80) recycleChance = 0.85; // Araba azsa piyasayı canlandır
        else if (totalMarketCars > 250) recycleChance = 0.25; // Araba çoksa piyasayı tüket

        if (Math.random() < recycleChance) {
            const addedKm = Math.floor(Math.random() * 45000) + 5000;
            const newCleanliness = Math.max(10, Math.floor(Math.random() * 90) + 10);

            const { calculatePrice } = require('../services/carService');
            const [modelRes] = await connection.query("SELECT m.base_price, m.tier, c.year, c.km, c.damage_status, c.engine_status, c.price FROM models m JOIN cars c ON c.model_id = m.id WHERE c.id = ?", [carId]);

            let newPrice = 0;
            if (modelRes.length > 0) {
                const md = modelRes[0];
                const newKm = (md.km || 0) + addedKm;
                newPrice = calculatePrice(md.base_price, md.year || 2020, newKm, md.damage_status || 'Hasarsız', md.engine_status || 'İyi', md.tier || 'C');
            }

            // Hasar durumuna göre kademeli minimum fiyat
            const dmgStatus = modelRes.length > 0 ? (modelRes[0].damage_status || 'Hasarsız') : 'Hasarsız';
            const minPrices = { 'Hasarsız': 60000, 'Çizik': 45000, 'Boyalı': 40000, 'Değişen': 35000, 'Hasarlı': 25000, 'Pert': 15000 };
            const fallbackPrice = minPrices[dmgStatus] || 25000;

            await connection.query(
                "UPDATE cars SET owner_type='market', is_available=1, km = km + ?, cleanliness = ?, price = ? WHERE id=?",
                [addedKm, newCleanliness, Math.max(newPrice, fallbackPrice), carId]
            );
        } else {
            // Hurdaya çıkar
            await connection.query('DELETE FROM car_parts WHERE car_id = ?', [carId]);
            await connection.query('DELETE FROM cars WHERE id = ?', [carId]);
        }
    } catch (e) {
        console.error("recycleCarToMarket Hatası:", e);
    }
}

// =================== ARAÇ SATIN ALMA ===================
router.post('/buy/:carId', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const carId = req.params.carId;

        // SELECT ... FOR UPDATE ile yarışı önle
        const [cars] = await connection.query(
            `SELECT c.*, b.name as brand_name, m.name as model_name 
             FROM cars c JOIN brands b ON c.brand_id = b.id JOIN models m ON c.model_id = m.id 
             WHERE c.id = ? AND c.is_available = 1 AND c.owner_type = 'market' FOR UPDATE`, [carId]
        );

        if (cars.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, error: 'Araç bulunamadı veya az önce satıldı' });
        }
        const car = cars[0];

        const [players] = await connection.query('SELECT * FROM player WHERE id = ? FOR UPDATE', [req.playerId]);
        const player = players[0];

        if (player.is_seized) {
            await connection.rollback();
            return res.json({ success: false, error: 'Hesabınız hacizli! Önce borcunuzu ödeyin.' });
        }
        if (player.balance < car.price) {
            await connection.rollback();
            return res.json({ success: false, error: 'Yetersiz bakiye!' });
        }

        const [carCount] = await connection.query('SELECT COUNT(*) as count FROM player_cars WHERE player_id = ?', [req.playerId]);
        if (carCount[0].count >= player.max_car_slots) {
            await connection.rollback();
            return res.json({ success: false, error: 'Araç slotunuz dolu!' });
        }

        // İşlemler
        await connection.query('UPDATE cars SET is_available = 0, owner_type = "player" WHERE id = ?', [carId]);
        await connection.query('INSERT INTO player_cars (player_id, car_id, buy_price) VALUES (?, ?, ?)', [req.playerId, carId, car.price]);
        await connection.query('DELETE FROM favorites WHERE car_id = ?', [carId]);
        await connection.query('UPDATE player SET balance = balance - ?, total_buys = total_buys + 1, xp = xp + ? WHERE id = ?', [car.price, Math.round(car.price / 2000), req.playerId]);
        await connection.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "buy", ?, ?)', [req.playerId, car.price, `${car.brand_name} ${car.model_name} satın alındı`]);
        await connection.query('INSERT INTO profit_history (player_id, type, amount, description) VALUES (?, "expense", ?, ?)', [req.playerId, car.price, `${car.brand_name} ${car.model_name} alış`]);

        await connection.commit();

        // Level up ve başarım kontrollerini COMMIT sonrası yap (lock tutmamak için)
        await checkLevelUp(req.playerId);
        const [updatedPlayer] = await pool.query('SELECT *, (SELECT COUNT(*) FROM player_cars WHERE player_id = ?) as car_count FROM player WHERE id = ?', [req.playerId, req.playerId]);

        const achChecker = getAchievementChecker();
        if (achChecker) achChecker(req.playerId).catch(() => { });

        res.json({ success: true, message: `${car.brand_name} ${car.model_name} satın alındı! <i class="fa-solid fa-car"></i>`, player: updatedPlayer[0] });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ success: false, error: err.message });
    } finally {
        connection.release();
    }
});

// =================== PAZARLIK İLE SATIN ALMA ===================
router.post('/bargain/:carId', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const carId = req.params.carId;
        const { offer_price } = req.body;

        if (!offer_price || offer_price <= 0) {
            await connection.rollback();
            return res.json({ success: false, error: 'Geçerli bir teklif girin!' });
        }

        const [cars] = await connection.query(
            `SELECT c.*, b.name as brand_name, m.name as model_name 
             FROM cars c JOIN brands b ON c.brand_id = b.id JOIN models m ON c.model_id = m.id 
             WHERE c.id = ? AND c.is_available = 1 AND c.owner_type = 'market' FOR UPDATE`, [carId]
        );
        if (cars.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        }
        const car = cars[0];

        const [players] = await connection.query('SELECT * FROM player WHERE id = ? FOR UPDATE', [req.playerId]);
        const player = players[0];

        if (player.is_seized) {
            await connection.rollback();
            return res.json({ success: false, error: 'Hesabınız hacizli!' });
        }
        if (player.balance < offer_price) {
            await connection.rollback();
            return res.json({ success: false, error: 'Yetersiz bakiye!' });
        }

        const [carCount] = await connection.query('SELECT COUNT(*) as count FROM player_cars WHERE player_id = ?', [req.playerId]);
        if (carCount[0].count >= player.max_car_slots) {
            await connection.rollback();
            return res.json({ success: false, error: 'Araç slotunuz dolu!' });
        }

        // Piyasa değeri al
        const mv = await calculateMarketValue(carId);
        const marketValue = mv ? mv.marketValue : car.price;

        // Pazarlıkçıyı belirle (Tip bazlı kişilik)
        let npcType = 'normal';
        if (car.seller_type === 'Sahibinden') {
            npcType = Math.random() < 0.5 ? 'comert' : 'pazarlikci';
        } else if (car.seller_type === 'Yetkili Bayi') {
            npcType = 'pazarlikci';
        }

        // Pazarlık değerlendir
        const result = evaluateBargain(offer_price, car.price, marketValue, npcType);

        if (result.accepted) {
            const finalPrice = result.finalPrice;

            await connection.query('UPDATE cars SET is_available = 0, owner_type = "player", price = ? WHERE id = ?', [finalPrice, carId]);
            await connection.query('INSERT INTO player_cars (player_id, car_id, buy_price) VALUES (?, ?, ?)', [req.playerId, carId, finalPrice]);
            await connection.query('DELETE FROM favorites WHERE car_id = ?', [carId]);
            await connection.query('UPDATE player SET balance = balance - ?, total_buys = total_buys + 1, xp = xp + ? WHERE id = ?', [finalPrice, Math.round(finalPrice / 1500), req.playerId]);
            await connection.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "buy", ?, ?)', [req.playerId, finalPrice, `${car.brand_name} ${car.model_name} pazarlıkla alındı`]);
            await connection.query('INSERT INTO profit_history (player_id, type, amount, description) VALUES (?, "expense", ?, ?)', [req.playerId, finalPrice, `${car.brand_name} ${car.model_name} pazarlık`]);

            await connection.commit();

            await checkLevelUp(req.playerId);
            const [updatedPlayer] = await pool.query('SELECT *, (SELECT COUNT(*) FROM player_cars WHERE player_id = ?) as car_count FROM player WHERE id = ?', [req.playerId, req.playerId]);

            return res.json({
                success: true,
                accepted: true,
                message: `<i class="fa-solid fa-handshake"></i> ${result.message} ${car.brand_name} ${car.model_name} ${finalPrice.toLocaleString('tr-TR')}₺'ye alındı!`,
                player: updatedPlayer[0],
                finalPrice,
                originalPrice: car.price,
                savings: car.price - finalPrice
            });
        } else {
            await connection.rollback();
            return res.json({
                success: true,
                accepted: false,
                message: `<i class="fa-solid fa-comment"></i> "${result.message}"`,
                counterOffer: result.counterOffer,
                originalPrice: car.price,
                marketValue
            });
        }
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ success: false, error: err.message });
    } finally {
        connection.release();
    }
});

// =================== SATIŞ İLANI ===================
router.post('/sell', async (req, res) => {
    try {
        const { player_car_id, listing_type, asking_price, installment_months } = req.body;

        const [pCars] = await pool.query('SELECT * FROM player_cars WHERE id = ? AND player_id = ?', [player_car_id, req.playerId]);
        if (pCars.length === 0) return res.json({ success: false, error: 'Araç bulunamadı' });

        const [existingListing] = await pool.query('SELECT id FROM listings WHERE player_car_id = ? AND status = "active"', [player_car_id]);
        if (existingListing.length > 0) return res.json({ success: false, error: 'Bu araç zaten ilanda!' });

        // Ticaret Yasağı / Şahsi Araç / Haciz Kontrolü
        const [players] = await pool.query('SELECT trade_ban_until, personal_car_id, is_seized FROM player WHERE id = ?', [req.playerId]);
        if (players.length > 0) {
            if (players[0].is_seized) {
                return res.json({ success: false, error: 'Hesabınız hacizli! Satış yapamazsınız, önce borcunuzu ödeyin.' });
            }
            if (players[0].trade_ban_until && new Date() < new Date(players[0].trade_ban_until)) {
                return res.json({ success: false, error: `Ticaret yasağınız bulunuyor! Bitiş: ${new Date(players[0].trade_ban_until).toLocaleString('tr-TR')}` });
            }
            if (players[0].personal_car_id === parseInt(player_car_id)) {
                return res.json({ success: false, error: 'Şahsi aracınızı satamazsınız. Önce yıldızını kaldırıp şahsi araçtan çıkarın.' });
            }
        }

        if (!asking_price || asking_price <= 0) return res.json({ success: false, error: 'Fiyat girin!' });

        const carId = pCars[0].car_id;
        const mv = await calculateMarketValue(carId);
        const marketValue = mv ? mv.marketValue : 0;
        const suggestedPrice = mv ? mv.suggestedPrice : 0;

        // Taksit hesaplama
        const validMonths = [0, 3, 6, 9, 12];
        const months = validMonths.includes(installment_months) ? installment_months : 0;
        const interestRates = { 0: 0, 3: 0.05, 6: 0.12, 9: 0.20, 12: 0.30 };
        const rate = interestRates[months] || 0;

        // SIKI EKONOMİ KONTROLÜ
        const buyPrice = pCars[0].buy_price || 0;

        // Arabanın kendi veritabanındaki fiyatını da al (Fabrika/Özel vergiler dahil)
        const [originalData] = await pool.query('SELECT price, engine_status FROM cars WHERE id = ?', [carId]);
        const originalCarPrice = originalData.length > 0 ? originalData[0].price : 0;
        const engineStatus = originalData.length > 0 ? originalData[0].engine_status : 'İyi';

        // Ekspertiz (Önerilen) değerini de hesaba kat
        const { calculateAppraisalValue } = require('../services/pricing');
        const appraisal = await calculateAppraisalValue(marketValue, engineStatus, req.playerId);

        // Maksimum izin verilen değer; piyasa, alış fiyatı, orijinal değer VEYA ekspertiz(önerilen) değerinin en büyüğüdür.
        const baseAllowedValue = Math.max(marketValue, buyPrice, originalCarPrice, appraisal);

        // Bu değer üzerinden esneklik payı
        const maxNormalPrice = Math.round(baseAllowedValue * 1.35); // Nakitte Max %35 kâr
        const maxInstallmentPrice = Math.round(baseAllowedValue * 1.50); // Taksitli Max %50 kâr

        if (months === 0 && asking_price > maxNormalPrice) {
            return res.json({ success: false, error: `Sıkı Piyasa Kuralları: Nakit satışta maksimum ${maxNormalPrice.toLocaleString('tr-TR')}₺ isteyebilirsiniz.` });
        }
        if (months > 0 && asking_price > maxInstallmentPrice) {
            return res.json({ success: false, error: `Sıkı Piyasa Kuralları: Taksitli satışta maksimum ${maxInstallmentPrice.toLocaleString('tr-TR')}₺ isteyebilirsiniz.` });
        }

        const totalWithInterest = months > 0 ? Math.round(asking_price * (1 + rate)) : asking_price;

        const insertData = {
            player_id: req.playerId,
            car_id: carId,
            player_car_id: player_car_id,
            listing_type: 'normal',
            asking_price: totalWithInterest,
            market_value: marketValue,
            suggested_price: suggestedPrice,
            installment_months: months,
            installment_rate: rate * 100,
            total_with_interest: totalWithInterest
        };

        await pool.query('INSERT INTO listings SET ?', [insertData]);

        const msg = months > 0
            ? `İlan oluşturuldu! <i class="fa-solid fa-money-bill-wave"></i> ${months} taksit, toplam: ${totalWithInterest.toLocaleString('tr-TR')}₺ (%${Math.round(rate * 100)} faiz)`
            : 'İlan başarıyla oluşturuldu! <i class="fa-solid fa-rocket"></i>';

        res.json({ success: true, message: msg, marketValue, suggestedPrice, totalWithInterest, installmentMonths: months });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== AKTİF İLANLAR ===================
router.get('/listings', async (req, res) => {
    try {
        const [listings] = await pool.query(
            `SELECT l.*, c.year, c.km, c.damage_status, c.color, c.price as car_price,
                    b.name as brand_name, b.logo_emoji, m.name as model_name,
                    pc.buy_price
             FROM listings l
             JOIN cars c ON l.car_id = c.id
             JOIN brands b ON c.brand_id = b.id
             JOIN models m ON c.model_id = m.id
             JOIN player_cars pc ON l.player_car_id = pc.id
             WHERE l.player_id = ? AND l.status = 'active'
             ORDER BY l.created_at DESC`,
            [req.playerId]
        );

        for (let l of listings) {
            const [offers] = await pool.query(
                `SELECT o.*, n.name as npc_name, n.type as npc_type 
                 FROM offers o JOIN npc_buyers n ON o.npc_id = n.id 
                 WHERE o.listing_id = ? ORDER BY o.offer_price DESC`,
                [l.id]
            );
            l.offers = offers;
        }

        res.json({ success: true, data: listings });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== TEKLİF KABUL ===================
router.post('/listings/:id/accept/:offerId', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id, offerId } = req.params;

        // kilitli seçim
        const [listings] = await connection.query(`
            SELECT l.*, b.name as brand_name, m.name as model_name, 
                   c.motor_health, c.damage_status, c.km, c.cleanliness
            FROM listings l 
            JOIN cars c ON l.car_id = c.id 
            JOIN brands b ON c.brand_id = b.id 
            JOIN models m ON c.model_id = m.id 
            WHERE l.id = ? AND l.status = "active" FOR UPDATE
        `, [id]);
        if (listings.length === 0) {
            await connection.rollback();
            return res.json({ success: false, error: 'İlan bulunamadı veya zaten sonuçlandı' });
        }

        const [offers] = await connection.query('SELECT * FROM offers WHERE id = ? AND listing_id = ? AND status = "pending" FOR UPDATE', [offerId, id]);
        if (offers.length === 0) {
            await connection.rollback();
            return res.json({ success: false, error: 'Teklif bulunamadı' });
        }

        const offer = offers[0];
        const listing = listings[0];

        const [buyPriceResult] = await connection.query('SELECT buy_price FROM player_cars WHERE id = ?', [listing.player_car_id]);
        const buyPrice = buyPriceResult.length > 0 ? parseFloat(buyPriceResult[0].buy_price) : parseFloat(listing.asking_price);

        // Kişisel araç ise temizle
        await connection.query('UPDATE player SET personal_car_id = NULL WHERE id = ? AND personal_car_id = ?', [req.playerId, listing.player_car_id]);

        const sellPrice = offer.offer_price;
        const installmentMonths = listing.installment_months || 0;
        const profit = sellPrice - buyPrice;
        const repGain = Math.max(1, Math.min(3, Math.floor(profit / 5000)));

        let perInstallment = 0;
        let firstPayment = 0;
        const taxRate = await getTaxRate(req.playerId);
        const tax = profit > 0 ? Math.round(profit * taxRate) : 0;
        const netProfit = profit - tax;

        if (installmentMonths > 0) {
            // TAKSİTLİ SATIŞ
            perInstallment = Math.round(sellPrice / installmentMonths);
            firstPayment = sellPrice - (perInstallment * (installmentMonths - 1));
            const netFirstPayment = firstPayment - tax;

            await connection.query(
                `UPDATE player SET balance = balance + ?, total_sales = total_sales + 1, xp = xp + ? WHERE id = ?`,
                [netFirstPayment, Math.round(sellPrice / 1250), req.playerId]
            );

            // Kalan taksitleri tabloya ekle (FK için listing hala var olmalı)
            for (let i = 2; i <= installmentMonths; i++) {
                await connection.query(
                    `INSERT INTO installment_payments (listing_id, seller_id, buyer_npc_id, installment_number, total_installments, amount, status, due_day, car_name) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
                    [listing.id, req.playerId, offer.npc_id, i, installmentMonths, perInstallment, i, `${listing.brand_name} ${listing.model_name}`]
                );
            }

            if (profit > 0) {
                await connection.query('UPDATE player SET total_profit = total_profit + ? WHERE id = ?', [netProfit, req.playerId]);
            } else if (profit < 0) {
                await connection.query('UPDATE player SET total_loss = total_loss + ? WHERE id = ?', [Math.abs(profit), req.playerId]);
            }
            await connection.query('UPDATE player SET reputation = LEAST(100, reputation + ?) WHERE id = ?', [repGain, req.playerId]);

            await connection.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "sell_installment", ?, ?)',
                [req.playerId, sellPrice, `Taksitli satış (${installmentMonths} taksit, ilk ödeme: ${firstPayment.toLocaleString('tr-TR')}₺)`]);
            await connection.query('INSERT INTO profit_history (player_id, type, amount, description) VALUES (?, "income", ?, ?)',
                [req.playerId, firstPayment - tax, `Taksitli satış 1. taksit (Net)`]);

        } else {
            // PEŞİN SATIŞ
            const netSellPrice = sellPrice - tax;
            await connection.query(
                `UPDATE player SET 
                    balance = balance + ?, 
                    total_sales = total_sales + 1, 
                    total_profit = total_profit + ?, 
                    xp = xp + ?,
                    reputation = LEAST(100, reputation + ?)
                 WHERE id = ?`,
                [netSellPrice, Math.max(netProfit, 0), Math.round(sellPrice / 1250), repGain, req.playerId]
            );

            if (profit < 0) {
                await connection.query('UPDATE player SET total_loss = total_loss + ? WHERE id = ?', [Math.abs(profit), req.playerId]);
            }

            await connection.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "sell", ?, ?)', [req.playerId, netSellPrice, `Araç satıldı (Kâr: ${netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString('tr-TR')}₺, Devlet Payı: ${tax.toLocaleString('tr-TR')}₺)`]);
            await connection.query('INSERT INTO profit_history (player_id, type, amount, description) VALUES (?, "income", ?, ?)', [req.playerId, netSellPrice, `Araç satış geliri (Net)`]);
        }

        // VERGİ HAZİNEYE AKTARIMI
        if (tax > 0) {
            const { addTreasuryIncome } = require('../services/treasury');
            await addTreasuryIncome(connection, tax, `Araç Satış Vergisi (Devlet Payı: %${Math.round(taxRate * 100)})`);
        }

        // ============ İŞLETME YORUMLARI OLUŞTURMA (SQL KAYDI) ============
        // Her satıştan sonra yorum gelir. Puanlama kalite ve fiyata göre.
        const [pRec] = await connection.query('SELECT reputation, review_count FROM player WHERE id = ?', [req.playerId]);
        if (pRec.length > 0) {
            const repFrac = pRec[0].reputation / 100;

            // Kalite ve Kar Marjı Hesabı
            const profitRatio = buyPrice > 0 ? (profit / buyPrice) : 0;
            let carQuality = listing.motor_health || 50;
            if (listing.damage_status === 'Boyalı') carQuality -= 10;
            if (listing.damage_status === 'Değişen') carQuality -= 20;
            if (listing.damage_status === 'Hasarlı' || listing.damage_status === 'Pert') carQuality -= 40;

            // Temizlik bonusu
            const cleanliness = listing.cleanliness || 50;
            carQuality = (carQuality * 0.8) + (cleanliness * 0.2);

            // Temel Puan (1-10)
            let baseRating = 5;
            if (carQuality >= 85) baseRating += 3;
            else if (carQuality <= 40) baseRating -= 3;

            // Fiyat Algısı (Kar marjına göre)
            if (profitRatio < 0.10) baseRating += 2; // Çok ucuz
            else if (profitRatio < 0.20) baseRating += 1; // Normal/İyi
            else if (profitRatio > 0.40) baseRating -= 3; // Çok pahalı

            // İtibar ve Şans Faktörü
            baseRating += (Math.random() * 2 - 1) + (repFrac > 0.8 ? 1 : 0);

            let finalRating = Math.max(1, Math.min(10, Math.round(baseRating)));
            const isPositive = finalRating >= 7;

            const names = ["Ahmet", "Mehmet", "Celal", "Ayşe", "Fatma", "Ali", "Burak", "Cem", "Deniz", "Efe", "Gamze", "Hakan", "İbrahim", "Kemal", "Leyla", "Murat", "Nuri", "Osman", "Pelin", "Rıza"];
            const surnames = ["A.", "B.", "C.", "D.", "E.", "F.", "G.", "H.", "K.", "L.", "M.", "N.", "P.", "S.", "T.", "Y."];

            let cComment = "";
            if (isPositive) {
                const posComments = [
                    `Çok dürüst bir satıcı, ${listing.brand_name} söylendiği gibi harikaydı.`,
                    "Hızlı ve sorunsuz bir alışveriş oldu, ekspertizde her şey şeffaftı.",
                    `Fiyatlar çok makul, kar marjını abartmamışlar. Esnaflığı 10 numara.`,
                    "Kusursuz teslimat, çok memnun kaldım.",
                    brand_name => `Araba pırıl pırıldı, ${brand_name} motoru çok sağlıklı. Teşekkürler.`
                ];
                const commentTemplate = posComments[Math.floor(Math.random() * posComments.length)];
                cComment = typeof commentTemplate === 'function' ? commentTemplate(listing.brand_name) : commentTemplate;
            } else {
                const negComments = [
                    `Araçta söylendiğinden daha fazla sorun çıktı, %${Math.floor(profitRatio * 100)} kâr koyup üstüne bir de arızalı araba kitlemişler.`,
                    "Fiyatlar piyasaya göre çok şişirilmiş, fahiş kâr marjıyla satıyorlar.",
                    "Araç mekanik olarak sorunlu çıktı, motor sağlığı berbat. Kesinlikle tavsiye etmem.",
                    "Satış sonrası ilgi yok, sadece satana kadar ilgileniyorlar.",
                    "Araba çok kirli geldi, iç temizliği berbattı. Bu fiyata daha iyi bir hizmet beklerdim."
                ];
                cComment = negComments[Math.floor(Math.random() * negComments.length)];
            }

            const cName = names[Math.floor(Math.random() * names.length)] + ' ' + surnames[Math.floor(Math.random() * surnames.length)];
            await connection.query('INSERT INTO business_reviews (player_id, reviewer_name, rating, comment) VALUES (?, ?, ?, ?)', [req.playerId, cName, finalRating, cComment]);

            // Oyuncu istatistiklerini güncelle (reputation ve review_count)
            let repChange = 0;
            if (finalRating >= 9) repChange = 3;
            else if (finalRating >= 7) repChange = 1;
            else if (finalRating <= 3) repChange = -2;

            await connection.query(
                'UPDATE player SET review_count = review_count + 1, reputation = GREATEST(0, LEAST(100, reputation + ?)) WHERE id = ?',
                [repChange, req.playerId]
            );
        }

        // Genel Temizlik
        await connection.query('DELETE FROM offers WHERE listing_id = ?', [id]);
        await connection.query('DELETE FROM listings WHERE id = ?', [id]);

        const [otherListings] = await connection.query('SELECT id FROM listings WHERE player_car_id = ? OR car_id = ?', [listing.player_car_id, listing.car_id]);
        for (const ol of otherListings) {
            await connection.query('DELETE FROM offers WHERE listing_id = ?', [ol.id]);
        }
        await connection.query('DELETE FROM listings WHERE player_car_id = ? OR car_id = ?', [listing.player_car_id, listing.car_id]);

        await connection.query('DELETE FROM player_cars WHERE id = ?', [listing.player_car_id]);
        await recycleCarToMarket(connection, listing.car_id);

        await connection.commit();
        await checkLevelUp(req.playerId);
        const [updatedPlayer] = await pool.query('SELECT *, (SELECT COUNT(*) FROM player_cars WHERE player_id = ?) as car_count FROM player WHERE id = ?', [req.playerId, req.playerId]);
        const achChecker = getAchievementChecker();
        if (achChecker) achChecker(req.playerId).catch(() => { });

        res.json({
            success: true,
            message: installmentMonths > 0
                ? `Araç taksitli satıldı! İlk ödeme: ${firstPayment.toLocaleString('tr-TR')}₺ (Net Kâr: ${netProfit.toLocaleString('tr-TR')}₺, Vergi: ${tax.toLocaleString('tr-TR')}₺)`
                : `Araç satıldı! Net Kâr: ${netProfit.toLocaleString('tr-TR')}₺ (Vergi: ${tax.toLocaleString('tr-TR')}₺)`,
            profit: netProfit,
            player: updatedPlayer[0]
        });

    } catch (err) {
        if (connection) await connection.rollback();
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// İlan iptal
router.delete('/listings/:id', async (req, res) => {
    try {
        const [listings] = await pool.query('SELECT * FROM listings WHERE id = ? AND status = "active"', [req.params.id]);
        if (listings.length === 0) return res.json({ success: false, error: 'İlan bulunamadı' });

        // Bağlı teklifleri temizle
        await pool.query('DELETE FROM offers WHERE listing_id = ?', [req.params.id]);

        await pool.query('UPDATE listings SET status = "cancelled" WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'İlan iptal edildi' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Teklifler
router.get('/listings/:id/offers', async (req, res) => {
    try {
        const [offers] = await pool.query(
            `SELECT o.*, n.name as npc_name, n.type as npc_type 
             FROM offers o JOIN npc_buyers n ON o.npc_id = n.id 
             WHERE o.listing_id = ? ORDER BY o.offer_price DESC`,
            [req.params.id]
        );
        res.json({ success: true, data: offers });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Anında Sat Günlük Bilgi
router.get('/instant-sell-info', async (req, res) => {
    try {
        const [players] = await pool.query('SELECT daily_instant_sells, last_instant_sell_reset FROM player WHERE id = ?', [req.playerId]);
        if (players.length === 0) return res.json({ success: false, error: 'Oyuncu bulunamadı' });
        const p = players[0];
        const today = new Date().toISOString().split('T')[0];
        const lastReset = p.last_instant_sell_reset ? new Date(p.last_instant_sell_reset).toISOString().split('T')[0] : null;
        const used = (lastReset === today) ? (p.daily_instant_sells || 0) : 0;
        res.json({ success: true, data: { used, limit: 5 } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Anında Sat / Instant Sell
router.post('/instant-sell', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { player_car_id } = req.body;
        const pid = req.playerId;

        // Günlük limit kontrolü / Şahsi Araç / Haciz Kontrolü
        const [playerRows] = await connection.query('SELECT daily_instant_sells, last_instant_sell_reset, personal_car_id, is_seized FROM player WHERE id = ? FOR UPDATE', [pid]);
        const p = playerRows[0];

        if (p.is_seized) {
            await connection.rollback();
            return res.json({ success: false, error: 'Hesabınız hacizli! Hızlı satış yapılamaz.' });
        }

        if (p.personal_car_id === parseInt(player_car_id)) {
            await connection.rollback();
            return res.json({ success: false, error: 'Şahsi aracınızı doğrudan satamazsınız. Satmak için önce şahsi araçtan çıkarın.' });
        }

        const today = new Date().toISOString().split('T')[0];
        const lastReset = p.last_instant_sell_reset ? new Date(p.last_instant_sell_reset).toISOString().split('T')[0] : null;
        let dailyUsed = (lastReset === today) ? (p.daily_instant_sells || 0) : 0;

        if (dailyUsed >= 5) {
            await connection.rollback();
            return res.json({ success: false, error: 'Günlük anında satış limitiniz doldu (5/5). Yarın tekrar deneyin veya NPC\'lere ilan verin.' });
        }

        // Araç sahiplik kontrolü
        const [pCars] = await connection.query(
            'SELECT pc.*, c.price as market_price, pc.buy_price as original_buy_price, c.id as car_id_actual FROM player_cars pc JOIN cars c ON pc.car_id = c.id WHERE pc.id = ? AND pc.player_id = ? FOR UPDATE',
            [player_car_id, pid]
        );
        if (pCars.length === 0) {
            await connection.rollback();
            return res.json({ success: false, error: 'Araç bulunamadı' });
        }
        const pCar = pCars[0];

        // İlan kontrolü
        const [listings] = await connection.query('SELECT id FROM listings WHERE player_car_id = ? AND status = "active"', [player_car_id]);
        if (listings.length > 0) {
            await connection.rollback();
            return res.json({ success: false, error: 'İlandaki aracı anında satamazsınız. Önce ilanı kaldırın.' });
        }

        const profitRate = 1.08;
        const sellPrice = Math.round(pCar.original_buy_price * profitRate);
        const profit = sellPrice - pCar.original_buy_price;

        const taxRate = await getTaxRate(pid);
        const tax = profit > 0 ? Math.round(profit * taxRate) : 0;
        const netProfit = profit - tax;
        const netSellPrice = sellPrice - tax;

        await connection.query(
            'UPDATE player SET balance = balance + ?, total_profit = total_profit + ?, total_sales = total_sales + 1, daily_instant_sells = ?, last_instant_sell_reset = ? WHERE id = ?',
            [netSellPrice, netProfit, dailyUsed + 1, today, pid]
        );

        await connection.query('DELETE FROM player_cars WHERE id = ?', [player_car_id]);
        await recycleCarToMarket(connection, pCar.car_id_actual);

        await connection.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "sell", ?, ?)',
            [pid, netSellPrice, `Anında Satış - Net Kâr: ${netProfit.toLocaleString('tr-TR')}₺ (Devlet Payı: ${tax.toLocaleString('tr-TR')}₺)`]);
        await connection.query('INSERT INTO profit_history (player_id, type, amount, description) VALUES (?, "income", ?, ?)',
            [pid, netSellPrice, 'Anında araç satış geliri']);

        const { addTreasuryExpense } = require('../services/treasury');
        await addTreasuryExpense(connection, sellPrice, `NPC Araç Alımı (Instant Sell)`);

        await connection.commit();

        const [updatedPlayer] = await pool.query('SELECT *, (SELECT COUNT(*) FROM player_cars WHERE player_id = ?) as car_count FROM player WHERE id = ?', [pid, pid]);

        const { checkLevelUp } = require('../services/levelUp');
        await checkLevelUp(pid);

        res.json({ success: true, message: `Araç anında satıldı! Net Kâr: ${netProfit.toLocaleString('tr-TR')}₺ (Vergi: ${tax.toLocaleString('tr-TR')}₺, Günlük: ${dailyUsed + 1}/5)`, profit: netProfit, player: updatedPlayer[0] });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ success: false, error: err.message });
    } finally {
        connection.release();
    }
});

// Appraisal / Ekspertiz Değeri
router.get('/appraisal/:playerCarId', async (req, res) => {
    try {
        const [cars] = await pool.query(
            `SELECT pc.*, c.engine_status, c.price as current_market_val, c.id as car_actual_id
             FROM player_cars pc JOIN cars c ON pc.car_id = c.id 
             WHERE pc.id = ? AND pc.player_id = ?`,
            [req.params.playerCarId, req.playerId]
        );
        if (cars.length === 0) return res.json({ success: false, error: 'Araç bulunamadı' });
        const car = cars[0];

        const mvResult = await calculateMarketValue(car.car_actual_id);
        const marketValue = mvResult ? mvResult.marketValue : car.current_market_val;
        const appraisal = await calculateAppraisalValue(marketValue, car.engine_status, req.playerId);

        res.json({
            success: true,
            data: {
                marketValue,
                appraisalValue: appraisal,
                buyPrice: car.buy_price,
                suggestedMax: appraisal
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== TAKSİT BİLGİSİ ===================
router.get('/installments', async (req, res) => {
    try {
        const [installments] = await pool.query(
            `SELECT ip.*, 
                    (SELECT SUM(amount) FROM installment_payments WHERE seller_id = ? AND status = 'pending') as total_pending
             FROM installment_payments ip 
             WHERE ip.seller_id = ? 
             ORDER BY ip.status ASC, ip.installment_number ASC`,
            [req.playerId, req.playerId]
        );
        const totalPending = installments.length > 0 ? parseFloat(installments[0].total_pending || 0) : 0;
        const pendingCount = installments.filter(i => i.status === 'pending').length;
        res.json({ success: true, data: installments, totalPending, pendingCount });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
