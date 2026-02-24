const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { calculateMarketValue } = require('../services/pricing');

// Tüm markaları getir
router.get('/brands', async (req, res) => {
    try {
        const [brands] = await pool.query(
            'SELECT b.*, COUNT(m.id) as model_count FROM brands b LEFT JOIN models m ON b.id = m.brand_id GROUP BY b.id ORDER BY b.prestige, b.name'
        );
        res.json({ success: true, data: brands });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Marka modelleri
router.get('/brands/:id/models', async (req, res) => {
    try {
        const [models] = await pool.query(
            `SELECT m.*, b.name as brand_name, b.prestige, b.logo_emoji,
             (SELECT COUNT(*) FROM cars c WHERE c.model_id = m.id AND c.is_available = 1 AND c.owner_type = 'market') as car_count
             FROM models m 
             JOIN brands b ON m.brand_id = b.id 
             WHERE m.brand_id = ? ORDER BY m.tier, m.name`,
            [req.params.id]
        );
        res.json({ success: true, data: models });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Modelleri getir (query param ile)
router.get('/models', async (req, res) => {
    try {
        const { brand_id } = req.query;
        let query = `SELECT m.*, b.name as brand_name, b.prestige, b.logo_emoji,
             (SELECT COUNT(*) FROM cars c WHERE c.model_id = m.id AND c.is_available = 1 AND c.owner_type = 'market') as car_count
             FROM models m 
             JOIN brands b ON m.brand_id = b.id`;
        const params = [];
        if (brand_id) {
            query += ' WHERE m.brand_id = ?';
            params.push(brand_id);
        }
        query += ' ORDER BY b.name, m.tier, m.name';
        const [models] = await pool.query(query, params);
        res.json({ success: true, data: models });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Araçları listele (keşfet veya filtrelenmiş)
router.get('/cars', async (req, res) => {
    try {
        const { brand_id, model_id, year_min, year_max, price_min, price_max,
            km_min, km_max, damage_status, seller_type, fuel_type, transmission,
            sort, order, page = 1, limit = 20 } = req.query;

        // Filtre koşullarını oluştur (hem data hem count query'de kullanılacak)
        let where = ' WHERE c.is_available = 1 AND c.owner_type = "market"';
        const filterParams = [];

        if (brand_id) { where += ' AND c.brand_id = ?'; filterParams.push(brand_id); }
        if (model_id) { where += ' AND c.model_id = ?'; filterParams.push(model_id); }
        if (year_min) { where += ' AND c.year >= ?'; filterParams.push(year_min); }
        if (year_max) { where += ' AND c.year <= ?'; filterParams.push(year_max); }
        if (price_min) { where += ' AND c.price >= ?'; filterParams.push(price_min); }
        if (price_max) { where += ' AND c.price <= ?'; filterParams.push(price_max); }
        if (km_min) { where += ' AND c.km >= ?'; filterParams.push(km_min); }
        if (km_max) { where += ' AND c.km <= ?'; filterParams.push(km_max); }
        if (damage_status) { where += ' AND c.damage_status = ?'; filterParams.push(damage_status); }
        if (seller_type) { where += ' AND c.seller_type = ?'; filterParams.push(seller_type); }
        if (fuel_type) { where += ' AND c.fuel_type = ?'; filterParams.push(fuel_type); }
        if (transmission) { where += ' AND c.transmission = ?'; filterParams.push(transmission); }

        // Toplam sayı (ayrı count query)
        const countQuery = `SELECT COUNT(*) as total FROM cars c JOIN brands b ON c.brand_id = b.id JOIN models m ON c.model_id = m.id ` + where;
        const [countResult] = await pool.query(countQuery, filterParams);
        const total = countResult[0].total;

        // Ana veri query'si
        let query = `
            SELECT c.*, b.name as brand_name, b.prestige, b.logo_emoji,
                   m.name as model_name, m.tier, m.body_type, m.lansoman_color,
                   (SELECT COUNT(*) FROM favorites f WHERE f.car_id = c.id AND f.player_id = ?) as is_favorited
            FROM cars c
            JOIN brands b ON c.brand_id = b.id
            JOIN models m ON c.model_id = m.id ` + where;
        const params = [req.playerId, ...filterParams];

        // Sıralama
        const sortField = sort || 'price';
        const sortOrder = (order === 'desc') ? 'DESC' : 'ASC';

        const sortMapping = {
            'price': 'c.price',
            'year': 'c.year',
            'km': 'c.km',
            'created_at': 'c.created_at',
            'prestige': 'b.prestige'
        };

        const actualSortField = sortMapping[sortField] || 'c.price';
        query += ` ORDER BY ${actualSortField} ${sortOrder}`;

        // Pagination
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [cars] = await pool.query(query, params);

        res.json({
            success: true,
            data: cars,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Araç detayı
router.get('/cars/:id', async (req, res) => {
    try {
        const [cars] = await pool.query(
            `SELECT c.*, b.name as brand_name, b.prestige, b.logo_emoji,
                    m.name as model_name, m.tier, m.body_type, m.base_price, m.lansoman_color,
                    (SELECT COUNT(*) FROM favorites f WHERE f.car_id = c.id AND f.player_id = ?) as is_favorited,
                    (SELECT COUNT(*) FROM cars WHERE model_id = c.model_id AND is_available = 1) as scarcity_count
             FROM cars c
             JOIN brands b ON c.brand_id = b.id
             JOIN models m ON c.model_id = m.id
             WHERE c.id = ?`,
            [req.playerId, req.params.id]
        );

        if (cars.length === 0) {
            return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        }

        // Parçaları getir
        const [parts] = await pool.query(
            'SELECT * FROM car_parts WHERE car_id = ?',
            [req.params.id]
        );

        // Piyasa değeri
        const marketValue = await calculateMarketValue(req.params.id);

        // Expertiz yapılmış mı
        const [inspections] = await pool.query(
            'SELECT * FROM inspections WHERE car_id = ? AND player_id = ? ORDER BY created_at DESC LIMIT 1',
            [req.params.id, req.playerId]
        );

        res.json({
            success: true,
            data: {
                ...cars[0],
                parts,
                marketValue,
                inspection: inspections.length > 0 ? inspections[0] : null
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Piyasa değeri
router.get('/cars/:id/market-value', async (req, res) => {
    try {
        const value = await calculateMarketValue(req.params.id);
        if (!value) {
            return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        }
        res.json({ success: true, data: value });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== FAVORİLER ===================

// Favorilere ekle
router.post('/favorites/:carId', async (req, res) => {
    try {
        const carId = req.params.carId;
        const pid = req.playerId;

        // Araç var mı kontrol et
        const [cars] = await pool.query('SELECT id FROM cars WHERE id = ?', [carId]);
        if (cars.length === 0) {
            return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        }

        // Zaten favoride mi?
        const [existing] = await pool.query('SELECT * FROM favorites WHERE player_id = ? AND car_id = ?', [pid, carId]);

        if (existing.length > 0) {
            // Varsa sil
            await pool.query('DELETE FROM favorites WHERE player_id = ? AND car_id = ?', [pid, carId]);
            res.json({ success: true, message: 'Favorilerden çıkarıldı 💔' });
        } else {
            // Yoksa ekle
            await pool.query('INSERT INTO favorites (player_id, car_id) VALUES (?, ?)', [pid, carId]);
            res.json({ success: true, message: 'Favorilere eklendi! <i class="fa-solid fa-heart"></i>' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Favoriden çıkar
router.delete('/favorites/:carId', async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM favorites WHERE player_id = ? AND car_id = ?',
            [req.playerId, req.params.carId]
        );
        res.json({ success: true, message: 'Favorilerden çıkarıldı' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Favori araçlar
router.get('/favorites', async (req, res) => {
    try {
        const [cars] = await pool.query(
            `SELECT c.*, b.name as brand_name, b.prestige, b.logo_emoji,
                    m.name as model_name, m.tier, m.body_type,
                    1 as is_favorited
             FROM favorites f
             JOIN cars c ON f.car_id = c.id
             JOIN brands b ON c.brand_id = b.id
             JOIN models m ON c.model_id = m.id
             WHERE f.player_id = ? AND c.is_available = 1 AND c.owner_type = 'market'
             ORDER BY f.created_at DESC`,
            [req.playerId]
        );
        res.json({ success: true, data: cars });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
