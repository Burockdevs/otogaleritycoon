const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { getPlayer, checkLevelUp } = require('./auth');

// Fabrika Maliyeti
const FACTORY_BUILD_COST = 100000000; // 100M TL (Endgame)
const REQUIRED_LEVEL = 35; // Seviye şartı

// Fabrika durumunu getir
router.get('/', async (req, res) => {
    try {
        const pid = req.playerId;
        const [factories] = await pool.query('SELECT * FROM endgame_factories WHERE player_id = ?', [pid]);

        const p = await getPlayer(pid);

        if (factories.length === 0) {
            return res.json({
                success: true,
                hasFactory: false,
                buildCost: FACTORY_BUILD_COST,
                requiredLevel: REQUIRED_LEVEL,
                playerLevel: p.level
            });
        }

        const factory = factories[0];

        // Üretilebilecek araçları getir (Sadece lüks ve hiper araçlar)
        // Seviyeye göre farklı modeller açılabilir
        const prestigeLimit = 5 + Math.floor(factory.level / 2); // lvl 1: 5+, lvl 10: 10

        const [models] = await pool.query(`
            SELECT m.id, m.name, b.name as brand_name, m.base_price, m.tier, b.prestige, b.logo_emoji
            FROM models m 
            JOIN brands b ON m.brand_id = b.id 
            WHERE b.prestige <= ? AND b.prestige >= 6
            ORDER BY m.base_price DESC 
            LIMIT 20
        `, [prestigeLimit]);

        // Şu anki üretimin durumunu hesapla
        let producingCar = null;
        let timeRemaining = 0;
        let progress = 0;

        if (factory.is_producing && factory.produced_car_model_id) {
            const [prodModels] = await pool.query('SELECT m.name, b.name as brand_name, m.base_price FROM models m JOIN brands b ON m.brand_id = b.id WHERE m.id = ?', [factory.produced_car_model_id]);
            if (prodModels.length > 0) {
                producingCar = prodModels[0];
                const endTime = new Date(factory.production_end_time).getTime();
                const now = Date.now();
                timeRemaining = Math.max(0, Math.floor((endTime - now) / 1000)); // saniye

                // Toplam süreyi varsayalım (örneğin 10 dakika = 600 saniye)
                const totalTime = 600 - (factory.level * 30); // Seviye arttıkça süre kısalır
                progress = Math.min(100, Math.max(0, 100 - (timeRemaining / totalTime * 100)));
            }
        }

        res.json({
            success: true,
            hasFactory: true,
            factory: {
                level: factory.level,
                xp: factory.xp,
                isProducing: factory.is_producing === 1,
                totalProduced: factory.total_produced,
                producingCar,
                timeRemaining,
                progress
            },
            availableModels: models
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Fabrika İnşa Et
router.post('/build', async (req, res) => {
    try {
        const pid = req.playerId;
        const p = await getPlayer(pid);

        if (p.level < REQUIRED_LEVEL) return res.json({ success: false, error: `Fabrika kurmak için en az ${REQUIRED_LEVEL}. seviye olmalısınız!` });
        if (p.balance < FACTORY_BUILD_COST) return res.json({ success: false, error: 'Yetersiz bakiye!' });

        const [existing] = await pool.query('SELECT player_id FROM endgame_factories WHERE player_id = ?', [pid]);
        if (existing.length > 0) return res.json({ success: false, error: 'Zaten bir fabrikanız var!' });

        await pool.query('UPDATE player SET balance = balance - ? WHERE id = ?', [FACTORY_BUILD_COST, pid]);
        await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "expense", ?, "Dev Fabrika Arazi ve İnşaatı")', [pid, FACTORY_BUILD_COST]);
        await pool.query('INSERT INTO profit_history (player_id, type, amount, description) VALUES (?, "expense", ?, "Fabrika Kurulumu")', [pid, FACTORY_BUILD_COST]);

        await pool.query('INSERT INTO endgame_factories (player_id) VALUES (?)', [pid]);

        res.json({ success: true, message: 'Mega Fabrika başarıyla inşa edildi! Artık seri üretime başlayabilirsiniz.', player: await getPlayer(pid) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Üretimi Başlat
router.post('/produce/:modelId', async (req, res) => {
    try {
        const pid = req.playerId;
        const modelId = req.params.modelId;

        const [factories] = await pool.query('SELECT * FROM endgame_factories WHERE player_id = ?', [pid]);
        if (factories.length === 0) return res.json({ success: false, error: 'Fabrikanız yok!' });

        const factory = factories[0];
        if (factory.is_producing) return res.json({ success: false, error: 'Şu anda zaten bir üretim devam ediyor!' });

        const [models] = await pool.query('SELECT m.base_price FROM models m JOIN brands b ON m.brand_id=b.id WHERE m.id = ?', [modelId]);
        if (models.length === 0) return res.json({ success: false, error: 'Model bulunamadı.' });

        const model = models[0];

        // Üretim maliyeti (Örn: Satış fiyatının %40'ı)
        const productionCost = Math.round(model.base_price * 0.4);

        const p = await getPlayer(pid);
        if (p.balance < productionCost) return res.json({ success: false, error: `Üretim maliyeti için bakiye yetersiz! (${productionCost.toLocaleString('tr-TR')}₺)` });

        // Süre hesapla (Seviye başına 30sn kısalma, baz süre 10dk = 600sn)
        const totalSeconds = Math.max(60, 600 - (factory.level * 30));
        const endTime = new Date(Date.now() + totalSeconds * 1000);

        await pool.query('UPDATE player SET balance = balance - ? WHERE id = ?', [productionCost, pid]);
        await pool.query('UPDATE endgame_factories SET is_producing = 1, produced_car_model_id = ?, production_end_time = ? WHERE player_id = ?', [modelId, endTime, pid]);
        await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "expense", ?, "Fabrika Üretim Bandı Maliyeti")', [pid, productionCost]);

        res.json({ success: true, message: 'Üretim bantları çalışmaya başladı!', player: await getPlayer(pid) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Üretimi Tamamla ve Zengin NPC'ye Sat
router.post('/claim', async (req, res) => {
    try {
        const pid = req.playerId;
        const [factories] = await pool.query('SELECT * FROM endgame_factories WHERE player_id = ?', [pid]);
        if (factories.length === 0) return res.json({ success: false, error: 'Fabrikanız yok!' });

        const factory = factories[0];
        if (!factory.is_producing) return res.json({ success: false, error: 'Devam eden bir üretim yok!' });

        const now = new Date();
        const endTime = new Date(factory.production_end_time);

        if (now < endTime) return res.json({ success: false, error: 'Üretim henüz tamamlanmadı!' });

        const [models] = await pool.query('SELECT m.base_price, m.name, b.name as brand_name FROM models m JOIN brands b ON m.brand_id=b.id WHERE m.id = ?', [factory.produced_car_model_id]);
        if (models.length === 0) return res.json({ success: false, error: 'Araç bulunamadı!' });

        const model = models[0];

        // NPC'ye Satış Gelişimi (Maliyetin ~2.2x katı veya satış fiyatı kadar net gelir)
        // Sabit olarak aracın base_price'ı üzerinden kazanç sağlarsın (çünkü maliyet %40'tı, %60 net kâr)
        const revenue = Math.round(model.base_price);
        const xpGain = Math.round(revenue / 50000);

        await pool.query('UPDATE player SET balance = balance + ?, total_sales = total_sales + 1, xp = xp + ? WHERE id = ?', [revenue, xpGain, pid]);
        await pool.query('UPDATE endgame_factories SET is_producing = 0, produced_car_model_id = NULL, production_end_time = NULL, total_produced = total_produced + 1 WHERE player_id = ?', [pid]);

        await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "income", ?, ?)', [pid, revenue, `Özel Toptan Satış: ${model.brand_name} ${model.name}`]);
        await pool.query('INSERT INTO profit_history (player_id, type, amount, description) VALUES (?, "income", ?, ?)', [pid, revenue, `Fabrika Üretim Satışı`]);

        await checkLevelUp(pid);

        res.json({ success: true, message: `Üretim tamamlandı! Araç yurt dışındaki bir milyadere ${revenue.toLocaleString('tr-TR')}₺ karşılığında satıldı.`, player: await getPlayer(pid) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Fabrika Geliştir (Upgrade)
router.post('/upgrade', async (req, res) => {
    try {
        const pid = req.playerId;
        const [factories] = await pool.query('SELECT * FROM endgame_factories WHERE player_id = ?', [pid]);
        if (factories.length === 0) return res.json({ success: false, error: 'Fabrikanız yok!' });

        const factory = factories[0];
        if (factory.level >= 10) return res.json({ success: false, error: 'Fabrika maksimum seviyeye (10) ulaştı!' });

        const upgradeCost = Math.round(FACTORY_BUILD_COST * Math.pow(1.5, factory.level));

        const p = await getPlayer(pid);
        if (p.balance < upgradeCost) return res.json({ success: false, error: `Geliştirme için ${upgradeCost.toLocaleString('tr-TR')}₺ gerekiyor!` });

        await pool.query('UPDATE player SET balance = balance - ?, xp = xp + 500 WHERE id = ?', [upgradeCost, pid]);
        await pool.query('UPDATE endgame_factories SET level = level + 1 WHERE player_id = ?', [pid]);
        await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "expense", ?, ?)', [pid, upgradeCost, `Fabrika Ar-Ge Seviye ${factory.level + 1} Geliştirmesi`]);

        res.json({ success: true, message: `Fabrika Seviye ${factory.level + 1}'e yükseltildi! Üretim hızlandı ve yeni modeller açıldı.`, player: await getPlayer(pid) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
