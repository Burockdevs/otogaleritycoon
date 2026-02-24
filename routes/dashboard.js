const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { getNextResetTime } = require('../services/gameLoop');

// =================== DASHBOARD VERİSİ ===================
router.get('/', async (req, res) => {
    try {
        const pid = req.playerId;

        // 1. Oyuncu İstatistikleri
        const [pRows] = await pool.query(
            `SELECT username, balance, level, xp, xp_needed, prestige_score, total_sales, total_profit,
                    reputation, review_count, max_car_slots, has_gallery, has_factory_deal,
                    (SELECT COUNT(*) FROM player_cars WHERE player_id = ?) as car_count
             FROM player WHERE id = ?`,
            [pid, pid]
        );
        const player = pRows[0];

        // 2. Liderlik Tablosu (Top 3 Prestij)
        const [top3] = await pool.query(
            `SELECT id, username, prestige_score, level 
             FROM player 
             ORDER BY prestige_score DESC 
             LIMIT 3`
        );

        // 3. Mevcut Trend
        const [trendRows] = await pool.query(
            `SELECT name, event_name, type, effect, description, multiplier, expires_at 
             FROM market_trends 
             WHERE is_active = 1 AND (expires_at > NOW() OR expires_at IS NULL)
             LIMIT 1`
        );
        const trend = trendRows[0] || null;

        // 4. Son İşlemler (Son 3)
        const [transactions] = await pool.query(
            `SELECT type, amount, description, created_at 
             FROM transactions 
             WHERE player_id = ? 
             ORDER BY created_at DESC 
             LIMIT 3`,
            [pid]
        );

        // 5. Bir sonraki gün sıfırlaması için kalan süre
        const nextResetTimestamp = getNextResetTime();

        res.json({
            success: true,
            data: {
                player,
                top3,
                trend,
                transactions,
                nextResetTimestamp
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
