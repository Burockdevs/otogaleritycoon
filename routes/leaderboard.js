const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

// =================== LİDERLİK TABLOSU ===================
router.get('/', async (req, res) => {
    try {
        const playerId = req.playerId;

        // Prestij sıralaması
        const [prestige] = await pool.query(`
            SELECT id, username, level, prestige_score, total_profit, total_sales
            FROM player 
            ORDER BY prestige_score DESC 
            LIMIT 50
        `);

        // Kâr sıralaması
        const [profit] = await pool.query(`
            SELECT id, username, level, prestige_score, total_profit
            FROM player 
            ORDER BY total_profit DESC 
            LIMIT 50
        `);

        // Seviye sıralaması
        const [level] = await pool.query(`
            SELECT id, username, level, prestige_score, xp
            FROM player 
            ORDER BY level DESC, xp DESC 
            LIMIT 50
        `);

        // Satış sıralaması
        const [sales] = await pool.query(`
            SELECT id, username, level, prestige_score, total_sales
            FROM player 
            ORDER BY total_sales DESC 
            LIMIT 50
        `);

        // Oyuncunun kendi sıralaması
        let myRank = null;
        if (playerId) {
            const [rankResult] = await pool.query(`
                SELECT id, username, level, prestige_score, total_profit, total_sales,
                    (SELECT COUNT(*) + 1 FROM player p2 WHERE p2.prestige_score > p.prestige_score) as \`rank\`
                FROM player p
                WHERE id = ?
            `, [playerId]);

            if (rankResult.length > 0) {
                myRank = rankResult[0];
            }
        }

        res.json({
            success: true,
            data: {
                prestige,
                profit,
                level,
                sales
            },
            myRank
        });
    } catch (err) {
        console.error('Leaderboard Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
