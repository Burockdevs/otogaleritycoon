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
            LIMIT 10
        `);

        // Kâr sıralaması
        const [profit] = await pool.query(`
            SELECT id, username, level, prestige_score, total_profit
            FROM player 
            ORDER BY total_profit DESC 
            LIMIT 25
        `);

        // Seviye sıralaması
        const [level] = await pool.query(`
            SELECT id, username, level, prestige_score, xp
            FROM player 
            ORDER BY level DESC, xp DESC 
            LIMIT 25
        `);

        // Satış sıralaması
        const [sales] = await pool.query(`
            SELECT id, username, level, prestige_score, total_sales
            FROM player 
            ORDER BY total_sales DESC 
            LIMIT 25
        `);

        // Oyuncunun her kategorideki sıralaması
        let myRank = null;
        if (playerId) {
            const [rankResult] = await pool.query(`
                SELECT id, username, level, prestige_score, total_profit, total_sales,
                    (SELECT COUNT(*) + 1 FROM player p2 WHERE p2.prestige_score > p.prestige_score) as prestige_rank,
                    (SELECT COUNT(*) + 1 FROM player p2 WHERE p2.total_profit > p.total_profit) as profit_rank,
                    (SELECT COUNT(*) + 1 FROM player p2 WHERE p2.level > p.level OR (p2.level = p.level AND p2.xp > p.xp)) as level_rank,
                    (SELECT COUNT(*) + 1 FROM player p2 WHERE p2.total_sales > p.total_sales) as sales_rank
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
