const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

// =================== GERİ BİLDİRİM GÖNDER ===================
router.post('/', async (req, res) => {
    try {
        const { type, subject, message } = req.body;
        if (!message || message.trim().length < 5) {
            return res.json({ success: false, error: 'Mesaj en az 5 karakter olmalı.' });
        }
        if (subject && subject.length > 200) {
            return res.json({ success: false, error: 'Konu başlığı çok uzun.' });
        }

        await pool.query(
            'INSERT INTO feedbacks (player_id, type, subject, message) VALUES (?, ?, ?, ?)',
            [req.playerId, type || 'other', subject || 'Genel', message.trim()]
        );

        res.json({ success: true, message: 'Geri bildiriminiz alındı. Teşekkürler!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== KENDİ GERİ BİLDİRİMLERİMİ LİSTELE ===================
router.get('/', async (req, res) => {
    try {
        const [feedbacks] = await pool.query(
            'SELECT * FROM feedbacks WHERE player_id = ? ORDER BY created_at DESC LIMIT 50',
            [req.playerId]
        );
        res.json({ success: true, data: feedbacks });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== BİLDİRİMLERİ AL ===================
router.get('/notifications', async (req, res) => {
    try {
        const [notifications] = await pool.query(
            'SELECT * FROM notifications WHERE player_id = ? ORDER BY created_at DESC LIMIT 50',
            [req.playerId]
        );
        res.json({ success: true, data: notifications });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== OKUNMAMIŞ BİLDİRİM SAYISI ===================
router.get('/notifications/unread-count', async (req, res) => {
    try {
        const [result] = await pool.query(
            'SELECT COUNT(*) as count FROM notifications WHERE player_id = ? AND is_read = 0',
            [req.playerId]
        );
        res.json({ success: true, count: result[0].count });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== BİLDİRİMİ OKUNDU İŞARETLE ===================
router.put('/notifications/:id/read', async (req, res) => {
    try {
        await pool.query(
            'UPDATE notifications SET is_read = 1 WHERE id = ? AND player_id = ?',
            [req.params.id, req.playerId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== TÜM BİLDİRİMLERİ OKUNDU YAP ===================
router.put('/notifications/read-all', async (req, res) => {
    try {
        await pool.query(
            'UPDATE notifications SET is_read = 1 WHERE player_id = ?',
            [req.playerId]
        );
        res.json({ success: true, message: 'Tüm bildirimler okundu.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
