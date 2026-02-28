const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { getPlayer, checkLevelUp } = require('./auth');
const { randomFrom, randomBetween, getEngineForModel, getHorsepowerForEngine, generateParts, calculatePrice, generateDynamicDescription } = require('../services/carService');

// Konteyner Fiyatları
const CONTAINER_PRICES = {
    basic: 2000000,     // 2 Milyon
    premium: 10000000,  // 10 Milyon
    legendary: 50000000 // 50 Milyon
};

// Aktif görevi getir veya oluştur
async function getOrGenerateExportMission() {
    let [missions] = await pool.query('SELECT * FROM export_missions WHERE expires_at > NOW() ORDER BY id DESC LIMIT 1');
    if (missions.length === 0) {
        // Yeni görev oluştur (Genellikle nadir veya orta segment bir araç)
        const [models] = await pool.query('SELECT m.id, m.base_price FROM models m JOIN brands b ON m.brand_id=b.id WHERE b.prestige BETWEEN 3 AND 7 ORDER BY RAND() LIMIT 1');
        if (models.length > 0) {
            const m = models[0];
            const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 saat
            // Çarpan 1.5x ile 3.0x arası
            const multiplier = parseFloat((Math.random() * 1.5 + 1.5).toFixed(1));

            await pool.query('INSERT INTO export_missions (model_id, multiplier, expires_at) VALUES (?, ?, ?)', [m.id, multiplier, expires]);
            [missions] = await pool.query('SELECT * FROM export_missions WHERE expires_at > NOW() ORDER BY id DESC LIMIT 1');
        }
    }

    if (missions.length > 0) {
        // Model detaylarını çek
        const [mDetails] = await pool.query('SELECT m.name, b.name as brand_name, m.base_price, b.logo_emoji FROM models m JOIN brands b ON m.brand_id=b.id WHERE m.id=?', [missions[0].model_id]);
        return {
            ...missions[0],
            model_details: mDetails[0]
        };
    }
    return null;
}

// Liman verilerini yükle
router.get('/', async (req, res) => {
    try {
        const pid = req.playerId;
        const p = await getPlayer(pid);

        // Seviye sınırı
        if (p.level < 15) {
            return res.json({ success: true, isLocked: true, requiredLevel: 15, playerLevel: p.level });
        }

        const mission = await getOrGenerateExportMission();

        // Görevi yapabilecek araçları bul
        let exportableCars = [];
        if (mission) {
            const [cars] = await pool.query(`
                SELECT pc.id, pc.car_id, pc.buy_price, pc.damage_status, pc.motor_health
                FROM player_cars pc 
                JOIN cars c ON pc.car_id = c.id
                WHERE pc.player_id = ? AND c.model_id = ? AND pc.id NOT IN (SELECT player_car_id FROM listings)
            `, [pid, mission.model_id]);
            exportableCars = cars;
        }

        res.json({
            success: true,
            isLocked: false,
            prices: CONTAINER_PRICES,
            mission: mission,
            exportableCars: exportableCars
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// İhracat (Export) Yap
router.post('/export', async (req, res) => {
    try {
        const pid = req.playerId;
        const { playerCarId } = req.body;

        const mission = await getOrGenerateExportMission();
        if (!mission) return res.json({ success: false, error: 'Aktif bir ihracat görevi yok!' });

        const [cars] = await pool.query(`
            SELECT pc.id, pc.car_id, c.model_id, m.base_price, m.name, b.name as brand_name
            FROM player_cars pc
            JOIN cars c ON pc.car_id = c.id
            JOIN models m ON c.model_id = m.id
            JOIN brands b ON m.brand_id = b.id
            WHERE pc.id = ? AND pc.player_id = ?
        `, [playerCarId, pid]);

        if (cars.length === 0) return res.json({ success: false, error: 'Araç bulunamadı veya size ait değil.' });

        const car = cars[0];
        if (car.model_id !== mission.model_id) return res.json({ success: false, error: 'Bu araç istenen model değil!' });

        // İlana konulmuş mu?
        const [listing] = await pool.query('SELECT id FROM listings WHERE player_car_id = ?', [playerCarId]);
        if (listing.length > 0) return res.json({ success: false, error: 'İlandaki aracı ihraç edemezsiniz!' });

        // Ödül = Aracın sıfır üretim değeri * Çarpan (Çünkü ihraç yapılıyor)
        const payout = Math.round(car.base_price * mission.multiplier);
        const xpGain = Math.round(payout / 5000); // 50000 -> 5000 (10x daha fazla XP)

        // Aracı sil ve parsı ver
        await pool.query('DELETE FROM player_cars WHERE id = ?', [playerCarId]);
        await pool.query('UPDATE cars SET owner_type="system", is_available=0 WHERE id=?', [car.car_id]);

        await pool.query('UPDATE player SET balance = balance + ?, xp = xp + ?, total_sales = total_sales + 1 WHERE id = ?', [payout, xpGain, pid]);
        await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "income", ?, ?)', [pid, payout, `İhracat: ${car.brand_name} ${car.name}`]);
        await pool.query('INSERT INTO profit_history (player_id, type, amount, description) VALUES (?, "income", ?, ?)', [pid, payout, `İhracat Kazancı`]);

        await checkLevelUp(pid);

        res.json({ success: true, message: `Araç başarıyla yurt dışına ihraç edildi! Kazanç: ${payout.toLocaleString('tr-TR')}₺`, player: await getPlayer(pid) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Konteyner Satın Al (Gacha)
router.post('/import/:type', async (req, res) => {
    try {
        const pid = req.playerId;
        const type = req.params.type;

        if (!CONTAINER_PRICES[type]) return res.json({ success: false, error: 'Geçersiz konteyner türü.' });

        const price = CONTAINER_PRICES[type];
        const p = await getPlayer(pid);

        if (p.balance < price) return res.json({ success: false, error: `Bakiye yetersiz! (${price.toLocaleString('tr-TR')}₺)` });
        if (p.car_count >= p.max_car_slots) return res.json({ success: false, error: 'Garaj kapasiteniz dolu!' });

        // Konteynere göre araba seçimi
        let minTier = 1, maxTier = 3;
        if (type === 'premium') { minTier = 3; maxTier = 5; }
        else if (type === 'legendary') { minTier = 5; maxTier = 9; } // Tier 9 a kadar (hyper/ultra)

        const [models] = await pool.query('SELECT m.id, m.brand_id FROM models m JOIN brands b ON m.brand_id = b.id WHERE m.tier >= ? AND m.tier <= ? ORDER BY RAND() LIMIT 1', [minTier, maxTier]);

        if (models.length === 0) return res.json({ success: false, error: 'Konteyner boş çıktı (Sistem hatası)!' });

        const model = models[0];

        // Random özellikleri oluştur
        const year = randomBetween(2010, 2024);
        const km = randomBetween(0, 50000); // İthal araçlar genellikle daha düşük km veya 0

        const engine = await getEngineForModel(pool, model.id);
        const engineId = engine ? engine.id : null;
        const hp = engine ? await getHorsepowerForEngine(pool, engine.id) : 100;

        const priceCalc = await calculatePrice(pool, model.id, year, km, 0, 100);

        const [carRes] = await pool.query(`
            INSERT INTO cars (brand_id, model_id, year, km, engine_id, horsepower, price, owner_type, is_available)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'player', 0)
        `, [model.brand_id, model.id, year, km, engineId, hp, priceCalc.marketValue]);

        const newCarId = carRes.insertId;
        const parts = generateParts();
        const damageStatus = parts.some(p => p.damage !== 'Sağlam') ? 'Orta Hasarlı' : 'Kusursuz';

        await pool.query(`
            INSERT INTO player_cars (player_id, car_id, buy_price, parts_status, damage_status, motor_health, buy_date)
            VALUES (?, ?, ?, ?, ?, 100, NOW())
        `, [pid, price, JSON.stringify(parts), damageStatus]);

        await pool.query('UPDATE player SET balance = balance - ?, total_buys = total_buys + 1, xp = xp + 500 WHERE id = ?', [price, pid]);
        await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "expense", ?, "Gümrük İthalat Konteyneri")', [pid, price]);

        const [carDetails] = await pool.query(`
            SELECT m.name, b.name as brand_name FROM models m JOIN brands b ON m.brand_id = b.id WHERE m.id = ?
        `, [model.id]);

        await checkLevelUp(pid);

        res.json({
            success: true,
            message: `Konteyner açıldı! İçinden ${carDetails[0].brand_name} ${carDetails[0].name} çıktı!`,
            player: await getPlayer(pid)
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
