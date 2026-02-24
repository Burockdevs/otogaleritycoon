const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { getStaff, hireStaff, fireStaff, STAFF_ROLES } = require('../services/staffService');

// Personel listesi ve rolleri
router.get('/staff', async (req, res) => {
    try {
        const staff = await getStaff(req.playerId);
        res.json({ success: true, data: { staff, roles: STAFF_ROLES } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Personel işe al
router.post('/staff/hire', async (req, res) => {
    try {
        const { role, name } = req.body;
        const result = await hireStaff(req.playerId, role, name);
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Personel kov
router.post('/staff/fire/:id', async (req, res) => {
    try {
        const result = await fireStaff(req.playerId, req.params.id);
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Galeri Açma ve Geliştirme (Artık Sadece Araç Slotu)
router.get('/upgrades', async (req, res) => {
    try {
        const [player] = await pool.query(
            'SELECT balance, max_car_slots FROM player WHERE id = ?',
            [req.playerId]
        );
        const p = player[0];

        // Formül: Mevcut slot sayısının 25.000 katı
        const upgradeCost = p.max_car_slots * 25000;

        res.json({ success: true, data: { currentSlots: p.max_car_slots, upgradeCost, balance: p.balance } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/upgrades/buy', async (req, res) => {
    try {
        const [player] = await pool.query('SELECT balance, max_car_slots FROM player WHERE id = ?', [req.playerId]);
        const p = player[0];

        const cost = p.max_car_slots * 25000;

        if (p.balance < cost) return res.json({ success: false, error: 'Yetersiz bakiye!' });

        await pool.query(
            'UPDATE player SET balance = balance - ?, max_car_slots = max_car_slots + 1 WHERE id = ?',
            [cost, req.playerId]
        );

        await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "expense", ?, "Garaj Slotu Yükseltmesi")', [req.playerId, cost]);
        await pool.query('INSERT INTO profit_history (player_id, type, amount, description) VALUES (?, "expense", ?, "Garaj Slotu Yükseltmesi")', [req.playerId, cost]);

        res.json({ success: true, message: `Garaj kapasitesi artırıldı! Yeni Kapasite: ${p.max_car_slots + 1}` });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

module.exports = router;
