const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { getIO } = require('../services/gameLoop');

// Admin şifresi (env'den al veya hardcoded fallback)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'v2e@yh3PGrp7NhN';

// =================== ADMİN GİRİŞ ===================
router.post('/login', async (req, res) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.json({ success: false, error: 'Yanlış şifre!' });
    }
    req.session.isAdmin = true;
    res.json({ success: true, message: 'Admin girişi başarılı!' });
});

// =================== ARAÇ LİSTESİ ÇEK ===================
router.get('/cars-list', requireAdmin, async (req, res) => {
    try {
        const [models] = await pool.query(`
            SELECT m.id, b.name as brand_name, m.name as model_name, m.base_price as price
            FROM models m
            JOIN brands b ON m.brand_id = b.id
            ORDER BY b.name ASC, m.base_price ASC
        `);
        res.json({ success: true, data: models });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin middleware
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.isAdmin) {
        return res.status(403).json({ success: false, error: 'Admin yetkisi gerekli!' });
    }
    next();
}

// =================== DASHBOARD İSTATİSTİKLERİ ===================
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const [[{ totalPlayers }]] = await pool.query('SELECT COUNT(*) as totalPlayers FROM player');
        const [[{ totalCars }]] = await pool.query('SELECT COUNT(*) as totalCars FROM cars');
        const [[{ activeListings }]] = await pool.query('SELECT COUNT(*) as activeListings FROM listings WHERE status = "active"');
        const [[{ totalFeedbacks }]] = await pool.query('SELECT COUNT(*) as totalFeedbacks FROM feedbacks');
        const [[{ openFeedbacks }]] = await pool.query('SELECT COUNT(*) as openFeedbacks FROM feedbacks WHERE status = "open"');
        const [[{ totalMoney }]] = await pool.query('SELECT COALESCE(SUM(balance), 0) as totalMoney FROM player');
        const [[{ bannedPlayers }]] = await pool.query('SELECT COUNT(*) as bannedPlayers FROM player WHERE is_banned = 1');
        const [[{ onlineToday }]] = await pool.query('SELECT COUNT(*) as onlineToday FROM player WHERE last_login >= CURDATE()');

        const [[{ maintenanceActive }]] = await pool.query('SELECT setting_value as maintenanceActive FROM system_settings WHERE setting_key="maintenance_mode"');

        res.json({
            success: true, data: {
                totalPlayers, totalCars, activeListings, totalFeedbacks,
                openFeedbacks, totalMoney, bannedPlayers, onlineToday,
                maintenanceActive: maintenanceActive === 'true'
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== BAKIM MODU ===================
router.post('/maintenance', requireAdmin, async (req, res) => {
    try {
        const { active } = req.body;
        const val = active ? 'true' : 'false';
        await pool.query('UPDATE system_settings SET setting_value = ? WHERE setting_key = "maintenance_mode"', [val]);
        global.isMaintenanceMode = active;
        res.json({ success: true, message: `Bakım modu ${active ? 'açıldı' : 'kapatıldı'}.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== OYUNCU LİSTESİ ===================
router.get('/players', requireAdmin, async (req, res) => {
    try {
        const { search, page = 1, limit = 25 } = req.query;
        const offset = (page - 1) * limit;
        let where = '';
        let params = [];

        if (search) {
            where = 'WHERE username LIKE ? OR name LIKE ?';
            params = [`%${search}%`, `%${search}%`];
        }

        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM player ${where}`, params);
        const [players] = await pool.query(
            `SELECT id, username, name, balance, level, total_profit, total_sales, gallery_name, 
                    is_admin, is_banned, created_at, last_login,
                    (SELECT COUNT(*) FROM player_cars WHERE player_id = player.id) as car_count
             FROM player ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        res.json({ success: true, data: players, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== OYUNCU DETAY ===================
router.get('/players/:id', requireAdmin, async (req, res) => {
    try {
        const [players] = await pool.query(
            `SELECT p.*, 
                    (SELECT COUNT(*) FROM player_cars WHERE player_id = p.id) as car_count,
                    (SELECT COUNT(*) FROM listings WHERE player_id = p.id AND status = 'active') as active_listings
             FROM player p WHERE p.id = ?`, [req.params.id]
        );
        if (players.length === 0) return res.json({ success: false, error: 'Oyuncu bulunamadı' });
        const player = players[0];
        delete player.password_hash; // Şifreyi gönderme
        res.json({ success: true, data: player });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== OYUNCU BAKİYE GÜNCELLE ===================
router.put('/players/:id/balance', requireAdmin, async (req, res) => {
    try {
        const { amount, action, customMessage } = req.body; // action: 'add' | 'remove' | 'set'
        const playerId = req.params.id;
        const amt = parseFloat(amount);

        const note = customMessage && customMessage.trim() !== '' ? customMessage.trim() : `Admin tarafından bakiye işlemi`;

        if (action === 'add') {
            await pool.query('UPDATE player SET balance = balance + ? WHERE id = ?', [amt, playerId]);
            await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "income", ?, ?)', [playerId, amt, note]);
        } else if (action === 'remove') {
            await pool.query('UPDATE player SET balance = GREATEST(0, balance - ?) WHERE id = ?', [amt, playerId]);
            await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "expense", ?, ?)', [playerId, amt, note]);
        } else if (action === 'set') {
            const [[curr]] = await pool.query('SELECT balance FROM player WHERE id = ?', [playerId]);
            if (!curr) return res.json({ success: false, error: 'Oyuncu bulunamadı' });

            const diff = amt - curr.balance;
            await pool.query('UPDATE player SET balance = ? WHERE id = ?', [amt, playerId]);

            if (diff !== 0) {
                const type = diff > 0 ? 'income' : 'expense';
                await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, ?, ?, ?)', [playerId, type, Math.abs(diff), note]);
            }
        }

        // Bildirim gönder
        await pool.query(
            'INSERT INTO notifications (player_id, type, title, message, details) VALUES (?, "admin", "Bakiye Güncellendi", ?, ?)',
            [playerId, `Bakiyeniz admin tarafından güncellendi. İşlem: ${action === 'add' ? '+' : action === 'remove' ? '-' : '='} ${Number(amt).toLocaleString('tr-TR')}₺`, note]
        );

        res.json({ success: true, message: 'Bakiye güncellendi!' });

        const io = getIO();
        if (io) io.to(`player_${playerId}`).emit('player_update', { playerId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== OYUNCU BAN / BAN KALDIR ===================
router.put('/players/:id/ban', requireAdmin, async (req, res) => {
    try {
        const { ban } = req.body;
        await pool.query('UPDATE player SET is_banned = ? WHERE id = ?', [ban ? 1 : 0, req.params.id]);
        res.json({ success: true, message: `Oyuncu ${ban ? 'banlandı' : 'banı kaldırıldı'}.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== OYUNCUYA ARAÇ VER ===================
router.post('/players/:id/give-car', requireAdmin, async (req, res) => {
    try {
        const { carId: modelId, customMessage } = req.body; // Frontend still sends 'carId', we treat it as model_id
        const playerId = req.params.id;

        const [models] = await pool.query('SELECT m.*, b.name as brand_name FROM models m JOIN brands b ON m.brand_id = b.id WHERE m.id = ?', [modelId]);
        if (models.length === 0) return res.json({ success: false, error: 'Belirtilen model bulunamadı' });

        const model = models[0];

        // Yeni araç oluştur
        const [carInsert] = await pool.query(
            `INSERT INTO cars (brand_id, model_id, year, km, damage_status, motor_health, engine_status, price, owner_type, is_available)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'player', 0)`,
            [model.brand_id, model.id, new Date().getFullYear(), 0, 'Hasarsız', 100, 'Mükemmel', model.base_price]
        );
        const newCarId = carInsert.insertId;

        await pool.query('INSERT INTO player_cars (player_id, car_id, buy_price) VALUES (?, ?, 0)', [playerId, newCarId]);

        const note = customMessage && customMessage.trim() !== '' ? customMessage.trim() : 'Yönetim tarafından hediye araç.';

        await pool.query(
            'INSERT INTO notifications (player_id, type, title, message, details) VALUES (?, "admin", "Hediye Araç Teslim Edildi!", ?, ?)',
            [playerId, `Garajınıza sıfır kilometre bir ${model.brand_name} ${model.name} eklendi.`, note]
        );

        res.json({ success: true, message: 'Araç başarıyla gönderildi!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== OYUNCUYA XP/LEVEL VER ===================
router.post('/players/:id/give-xp', requireAdmin, async (req, res) => {
    try {
        const { amount, customMessage } = req.body;
        const playerId = req.params.id;

        await pool.query('UPDATE player SET xp = xp + ? WHERE id = ?', [amount, playerId]);

        const { checkLevelUp } = require('../services/levelUp');
        await checkLevelUp(playerId);

        const note = customMessage && customMessage.trim() !== '' ? customMessage.trim() : 'Yönetim tarafından deneyim puanı eklendi.';

        await pool.query(
            'INSERT INTO notifications (player_id, type, title, message, details) VALUES (?, "admin", "Sistem Hediyesi", ?, ?)',
            [playerId, `Hesabınıza +${Number(amount).toLocaleString('tr-TR')} XP eklendi.`, note]
        );

        res.json({ success: true, message: `XP Eklendi: ${amount}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== OYUNCU ENGELLEMELERİ (BAN & TİCARET) ===================
router.post('/players/:id/restrictions', requireAdmin, async (req, res) => {
    try {
        const { type, durationHours, reason } = req.body; // type: 'login' | 'trade'
        const playerId = req.params.id;

        let untilDate = null;
        if (durationHours === 'permanent') {
            untilDate = null; // Kalıcı ban: ban_until NULL + is_banned=1
        } else if (durationHours === 0) {
            untilDate = null; // Kaldır
        } else {
            const d = new Date();
            d.setHours(d.getHours() + parseInt(durationHours));
            const pad = (n) => String(n).padStart(2, '0');
            untilDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }

        if (type === 'login') {
            const isBanned = (durationHours === 'permanent' || untilDate) ? 1 : 0;
            const banReason = isBanned ? (reason || 'Nedeni belirtilmedi') : null;
            await pool.query('UPDATE player SET is_banned = ?, ban_until = ?, ban_reason = ? WHERE id = ?', [isBanned, untilDate, banReason, playerId]);
        } else if (type === 'trade') {
            await pool.query('UPDATE player SET trade_ban_until = ? WHERE id = ?', [untilDate, playerId]);
        } else {
            return res.json({ success: false, error: 'Geçersiz işlem tipi' });
        }

        const actionText = untilDate ? (durationHours === 'permanent' ? 'Sınırsız Engellendi' : `${durationHours} Saat Engellendi`) : 'Engel Kaldırıldı';

        await pool.query(
            'INSERT INTO notifications (player_id, type, title, message, details) VALUES (?, "admin", "Hesap Durumu Değişti", ?, ?)',
            [playerId, `Hesabınızın ${type === 'login' ? 'Giriş' : 'Ticaret'} yetkileri güncellendi: ${actionText}`, reason || 'Nedeni belirtilmedi']
        );

        res.json({ success: true, message: `Oyuncu engellemesi güncellendi. (${actionText})` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== İLAN LİSTESİ ===================
router.get('/listings', requireAdmin, async (req, res) => {
    try {
        const { status = 'active', page = 1 } = req.query;
        const limit = 25;
        const offset = (page - 1) * limit;

        const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM listings WHERE status = ?', [status]);
        const [listings] = await pool.query(
            `SELECT l.*, p.username, b.name as brand_name, m.name as model_name
             FROM listings l 
             JOIN player p ON l.player_id = p.id 
             JOIN cars c ON l.car_id = c.id
             JOIN models m ON c.model_id = m.id
             JOIN brands b ON c.brand_id = b.id
             WHERE l.status = ? ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
            [status, limit, offset]
        );

        res.json({ success: true, data: listings, total, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== İLAN SİL ===================
router.delete('/listings/:id', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM offers WHERE listing_id = ?', [req.params.id]);
        await pool.query('DELETE FROM listings WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'İlan silindi!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== GERİ BİLDİRİM LİSTESİ (ADD) ===================
router.get('/feedbacks', requireAdmin, async (req, res) => {
    try {
        const { status, page = 1 } = req.query;
        const limit = 25;
        const offset = (page - 1) * limit;

        let where = '';
        let params = [];
        if (status) { where = 'WHERE f.status = ?'; params.push(status); }

        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM feedbacks f ${where}`, params);
        const [feedbacks] = await pool.query(
            `SELECT f.*, p.username 
             FROM feedbacks f JOIN player p ON f.player_id = p.id 
             ${where} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.json({ success: true, data: feedbacks, total, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== GERİ BİLDİRİME YANIT VER ===================
router.put('/feedbacks/:id/reply', requireAdmin, async (req, res) => {
    try {
        const { reply, status } = req.body;
        await pool.query(
            'UPDATE feedbacks SET admin_reply = ?, replied_at = NOW(), status = ? WHERE id = ?',
            [reply, status || 'resolved', req.params.id]
        );

        // Kullanıcıya bildirim gönder
        const [[feedback]] = await pool.query('SELECT player_id, subject FROM feedbacks WHERE id = ?', [req.params.id]);
        if (feedback) {
            await pool.query(
                'INSERT INTO notifications (player_id, type, title, message) VALUES (?, "feedback_reply", ?, ?)',
                [feedback.player_id, 'Geri Bildirime Yanıt', `"${feedback.subject || 'Geri bildiriminiz'}" konulu mesajınıza admin yanıt verdi.`]
            );
        }

        res.json({ success: true, message: 'Yanıt gönderildi!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== GERİ BİLDİRİM DURUM GÜNCELLE ===================
router.put('/feedbacks/:id/status', requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        await pool.query('UPDATE feedbacks SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ success: true, message: 'Durum güncellendi!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== TOPLU BİLDİRİM GÖNDER ===================
router.post('/broadcast', requireAdmin, async (req, res) => {
    try {
        const { title, message } = req.body;
        if (!message) return res.json({ success: false, error: 'Mesaj gerekli!' });

        const [players] = await pool.query('SELECT id FROM player WHERE is_banned = 0');
        const values = players.map(p => [p.id, 'broadcast', title || 'Duyuru', message]);

        if (values.length > 0) {
            const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
            const flat = values.flat();
            await pool.query(`INSERT INTO notifications (player_id, type, title, message) VALUES ${placeholders}`, flat);
        }

        res.json({ success: true, message: `${players.length} oyuncuya bildirim gönderildi!` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== OYUNCUYA BİREYSEL BİLDİRİM ===================
router.post('/notify/:playerId', requireAdmin, async (req, res) => {
    try {
        const { title, message } = req.body;
        await pool.query(
            'INSERT INTO notifications (player_id, type, title, message) VALUES (?, "admin", ?, ?)',
            [req.params.playerId, title || 'Admin Mesajı', message]
        );
        res.json({ success: true, message: 'Bildirim gönderildi!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== ADMİN ÇIKIŞ ===================
router.post('/logout', (req, res) => {
    req.session.isAdmin = false;
    res.json({ success: true });
});

// =================== ADMİN OTURUM KONTROLÜ ===================
router.get('/check', (req, res) => {
    res.json({ success: true, isAdmin: !!(req.session && req.session.isAdmin) });
});

// =================== YARIŞ & ORGANİZATÖR (RACES) ===================
router.get('/races', requireAdmin, async (req, res) => {
    try {
        const [races] = await pool.query('SELECT * FROM races ORDER BY created_at DESC LIMIT 50');
        res.json({ success: true, data: races });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/races', requireAdmin, async (req, res) => {
    try {
        const { name, description, entryFee, maxParticipants, startsInMinutes, isIllegal } = req.body;

        let startsAt = new Date();
        startsAt.setMinutes(startsAt.getMinutes() + parseInt(startsInMinutes));

        await pool.query(
            'INSERT INTO races (name, description, entry_fee, max_participants, starts_at, status, is_illegal) VALUES (?, ?, ?, ?, ?, "pending", ?)',
            [name, description, entryFee, maxParticipants, startsAt, isIllegal ? 1 : 0]
        );
        res.json({ success: true, message: isIllegal ? 'İllegal sokak yarışı oluşturuldu!' : 'Resmi yarış başarıyla oluşturuldu, katılımlara açıldı!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== YARIŞ İPTAL ETME ===================
router.put('/races/:id/cancel', requireAdmin, async (req, res) => {
    try {
        const raceId = req.params.id;

        const [race] = await pool.query('SELECT * FROM races WHERE id = ?', [raceId]);
        if (race.length === 0) return res.json({ success: false, error: 'Yarış bulunamadı.' });

        if (race[0].status !== 'pending') {
            return res.json({ success: false, error: 'Sadece bekleyen yarışlar iptal edilebilir.' });
        }

        // Katılımcılara paralarını iade et
        const [participants] = await pool.query('SELECT player_id FROM race_participants WHERE race_id = ?', [raceId]);

        for (const p of participants) {
            await pool.query('UPDATE player SET balance = balance + ? WHERE id = ?', [race[0].entry_fee, p.player_id]);
            await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "system", ?, "Yarış iptali ücret iadesi")', [p.player_id, race[0].entry_fee]);
            await pool.query('INSERT INTO notifications (player_id, type, title, message) VALUES (?, "system", "Yarış İptal Edildi", "Katıldığınız yarış iptal edildi ve giriş ücretiniz iade edildi.")', [p.player_id]);
        }

        await pool.query('UPDATE races SET status = "cancelled" WHERE id = ?', [raceId]);

        res.json({ success: true, message: 'Yarış iptal edildi ve ücretler iade edildi.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== PİYASA TRENDLERİ KONTROLÜ ===================
router.get('/trends', requireAdmin, async (req, res) => {
    try {
        const { TREND_TEMPLATES } = require('../services/trendService');
        res.json({ success: true, data: TREND_TEMPLATES });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/trends/active', requireAdmin, async (req, res) => {
    try {
        const { getActiveTrend } = require('../services/trendService');
        const activeTrend = await getActiveTrend();
        res.json({ success: true, data: activeTrend });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/trends/start', requireAdmin, async (req, res) => {
    try {
        const { trendId, duration } = req.body;
        const { activateSpecificTrend } = require('../services/trendService');
        await activateSpecificTrend(trendId, duration || 24);
        res.json({ success: true, message: 'Seçili piyasa trendi başlatıldı!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/trends/stop', requireAdmin, async (req, res) => {
    try {
        const { stopActiveTrend } = require('../services/trendService');
        await stopActiveTrend();
        res.json({ success: true, message: 'Aktif trend sonlandırıldı, piyasa normale döndü.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/settings/trends', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT setting_value FROM system_settings WHERE setting_key = "auto_trends_enabled"');
        const enabled = rows.length > 0 ? rows[0].setting_value === '1' : true;
        res.json({ success: true, enabled });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/settings/trends', requireAdmin, async (req, res) => {
    try {
        const { enabled } = req.body;
        const val = enabled ? '1' : '0';
        await pool.query('INSERT INTO system_settings (setting_key, setting_value) VALUES ("auto_trends_enabled", ?) ON DUPLICATE KEY UPDATE setting_value = ?', [val, val]);
        res.json({ success: true, message: `Otomatik trend döngüsü ${enabled ? 'etkinleştirildi' : 'devre dışı bırakıldı'}.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== HAZİNE / TREASURY ===================
router.get('/treasury', requireAdmin, async (req, res) => {
    try {
        const { getTreasuryStats } = require('../services/treasury');
        const stats = await getTreasuryStats();
        res.json({ success: true, data: stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/treasury/distribute', requireAdmin, async (req, res) => {
    try {
        const { amount, reason } = req.body;
        if (!amount || amount <= 0) return res.json({ success: false, error: 'Geçersiz tutar.' });

        const [players] = await pool.query('SELECT id, username FROM player WHERE is_banned = 0');
        if (players.length === 0) return res.json({ success: false, error: 'Oyuncu bulunamadı.' });

        const totalAmount = amount * players.length;

        const { getTreasuryStats, addTreasuryExpense } = require('../services/treasury');
        const stats = await getTreasuryStats();
        if (stats.balance < totalAmount) {
            return res.json({ success: false, error: `Hazine yetersiz! Gerekli: ${totalAmount.toLocaleString('tr-TR')}₺, Mevcut: ${stats.balance.toLocaleString('tr-TR')}₺` });
        }

        // Dağıtımı yap
        await pool.query('UPDATE player SET balance = balance + ? WHERE is_banned = 0', [amount]);

        const values = players.map(p => [p.id, 'admin', 'Hazine Desteği', `Devlet tarafından hesabınıza ${amount.toLocaleString('tr-TR')}₺ devlet desteği yatırıldı. Not: ${reason || ''}`]);
        const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
        const flat = values.flat();
        await pool.query(`INSERT INTO notifications (player_id, type, title, message) VALUES ${placeholders}`, flat);

        await addTreasuryExpense(pool, totalAmount, `Toplu Para Dağıtımı: Kişi Başı ${amount}₺ (${players.length} Kişi)`);

        res.json({ success: true, message: `${players.length} oyuncuya toplam ${totalAmount.toLocaleString('tr-TR')}₺ dağıtıldı.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== KREDİ İSTEKLERİ YÖNETİMİ ===================
router.get('/loan-requests', requireAdmin, async (req, res) => {
    try {
        const [requests] = await pool.query(`
            SELECT lr.*, p.username, p.name as player_name, p.level, p.balance, p.has_gallery, p.gallery_name 
            FROM loan_requests lr
            JOIN player p ON lr.player_id = p.id
            ORDER BY lr.created_at DESC
        `);
        res.json({ success: true, data: requests });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/loan-requests/:id/action', requireAdmin, async (req, res) => {
    try {
        const { action, counterAmount, adminMessage } = req.body; // action: 'approve', 'reject', 'counter'
        const reqId = req.params.id;

        const [requests] = await pool.query('SELECT * FROM loan_requests WHERE id = ?', [reqId]);
        if (requests.length === 0) return res.json({ success: false, error: 'Talep bulunamadı.' });
        const request = requests[0];
        if (request.status !== 'pending') return res.json({ success: false, error: 'Bu talep zaten işlenmiş.' });

        const pid = request.player_id;
        const [players] = await pool.query('SELECT * FROM player WHERE id = ?', [pid]);
        const p = players[0];
        const { calculateInterestRate } = require('../services/pricing');

        if (action === 'approve') {
            const amount = request.amount;
            const months = request.months;
            const interestRate = calculateInterestRate(p.level);
            const totalInterest = Math.round(amount * (interestRate / 100) * months);
            const totalAmount = amount + totalInterest;
            const monthlyPayment = Math.round(totalAmount / months);

            await pool.query(
                'UPDATE player SET balance=balance+?, loan_amount=?, loan_remaining=?, loan_monthly_payment=?, loan_months_left=?, loan_missed_payments=0 WHERE id=?',
                [amount, totalAmount, totalAmount, monthlyPayment, months, pid]
            );
            await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"loan",?,?)',
                [pid, amount, `MB Onaylı Kredi: ${months} ay, %${interestRate.toFixed(1)} faiz`]);
            await pool.query('UPDATE loan_requests SET status="approved", admin_message=? WHERE id=?', [adminMessage || 'Onaylandı', reqId]);

            const { addTreasuryExpense } = require('../services/treasury');
            await addTreasuryExpense(pool, amount, `MB Kredi Onayı (${p.username})`);
            await pool.query(
                'INSERT INTO notifications (player_id, type, title, message, details) VALUES (?, "bank", "Kredi Onaylandı", ?, ?)',
                [pid, `Merkez Bankası ${amount.toLocaleString('tr-TR')}₺ kredi talebinizi onayladı!`, adminMessage || '']
            );
            res.json({ success: true, message: 'Kredi onaylandı ve oyuncuya aktarıldı.' });
        } else if (action === 'reject') {
            await pool.query('UPDATE loan_requests SET status="rejected", admin_message=? WHERE id=?', [adminMessage || 'Reddedildi', reqId]);
            await pool.query(
                'INSERT INTO notifications (player_id, type, title, message, details) VALUES (?, "bank", "Kredi Reddedildi", ?, ?)',
                [pid, `Merkez Bankası kredi talebinizi reddetti.`, adminMessage || '']
            );
            res.json({ success: true, message: 'Kredi talebi reddedildi.' });
        } else if (action === 'counter') {
            if (!counterAmount || counterAmount <= 0) return res.json({ success: false, error: 'Geçerli bir karşı teklif tutarı girin.' });
            await pool.query('UPDATE loan_requests SET status="counter_offer", counter_amount=?, admin_message=? WHERE id=?', [counterAmount, adminMessage || 'Karşı teklif iletildi', reqId]);
            await pool.query(
                'INSERT INTO notifications (player_id, type, title, message, details) VALUES (?, "bank", "Kredi Karşı Teklifi", ?, ?)',
                [pid, `Merkez Bankası talep ettiğiniz kredi tutarını uygun bulmadı ve ${counterAmount.toLocaleString('tr-TR')}₺ karşı teklif sundu.`, adminMessage || 'Kredi menüsünden yanıtlayın.']
            );
            res.json({ success: true, message: 'Karşı teklif oyuncuya iletildi.' });
        } else {
            res.json({ success: false, error: 'Geçersiz işlem.' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== DEVLET OTOPARKI (HACİZLİ ARAÇLAR) ===================
router.get('/impounded', requireAdmin, async (req, res) => {
    try {
        const [cars] = await pool.query(`
            SELECT i.*, p.username as owner_name, c.brand_name, c.model_name, c.year 
            FROM impounded_cars i 
            JOIN player p ON i.player_id = p.id 
            JOIN cars c ON i.car_id = c.id 
            ORDER BY i.impounded_at DESC
        `);
        res.json({ success: true, data: cars });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/impounded/:id/return', requireAdmin, async (req, res) => {
    try {
        const [imp] = await pool.query('SELECT * FROM impounded_cars WHERE id = ?', [req.params.id]);
        if (imp.length === 0) return res.json({ success: false, error: 'Araç bulunamadı.' });
        const car = imp[0];

        await pool.query('INSERT INTO player_cars (player_id, car_id, motor_health, damage_status, buy_price) VALUES (?, ?, ?, ?, ?)',
            [car.player_id, car.car_id, car.motor_health, car.damage_status, car.buy_price]);
        await pool.query('DELETE FROM impounded_cars WHERE id = ?', [car.id]);

        await pool.query('INSERT INTO notifications (player_id, type, title, message) VALUES (?, "system", "Araç İade Edildi", "Devlet Otoparkında bulunan aracınız size geri iade edildi.")', [car.player_id]);
        res.json({ success: true, message: 'Araç sahibine başarıyla iade edildi.' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/impounded/:id/sell', requireAdmin, async (req, res) => {
    try {
        const [imp] = await pool.query('SELECT * FROM impounded_cars WHERE id = ?', [req.params.id]);
        if (imp.length === 0) return res.json({ success: false, error: 'Araç bulunamadı.' });
        const car = imp[0];

        const { addTreasuryIncome } = require('../services/treasury');
        await addTreasuryIncome(pool, car.buy_price, `Hacizli Araç Satışı (ID: ${car.id})`);
        await pool.query('DELETE FROM impounded_cars WHERE id = ?', [car.id]);

        await pool.query('INSERT INTO notifications (player_id, type, title, message) VALUES (?, "system", "İcra Satışı", "Devlet Otoparkında bulunan aracınız icradan satılarak hazineye aktarıldı.")', [car.player_id]);
        res.json({ success: true, message: 'Araç başarıyla devlete satıldı ve hazineye eklendi.' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =================== SETTINGS & BANKA ===================
router.get('/settings', requireAdmin, async (req, res) => {
    try {
        const [[{ bank_interest_modifier }]] = await pool.query('SELECT setting_value as bank_interest_modifier FROM system_settings WHERE setting_key = "bank_interest_modifier"');
        res.json({ success: true, data: { bankInterestModifier: parseFloat(bank_interest_modifier) || 0 } });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/settings', requireAdmin, async (req, res) => {
    try {
        const { bankInterestModifier } = req.body;
        const val = parseFloat(bankInterestModifier) || 0;
        await pool.query('UPDATE system_settings SET setting_value = ? WHERE setting_key = "bank_interest_modifier"', [val.toString()]);
        global.bankInterestModifier = val;

        await pool.query('INSERT INTO notifications (player_id, type, title, message) SELECT id, "system", "Merkez Bankası Açıklaması", ? FROM player WHERE is_banned=0',
            [`Faiz oranlarında düzenlemeye gidilmiştir. Yeni güncel faiz kararı piyasalara yansıtıldı.`]);

        res.json({ success: true, message: 'Banka faizi güncellendi ve tüm oyunculara duyuruldu!' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =================== ETKİNLİKLER ===================
router.post('/events/raffle', requireAdmin, async (req, res) => {
    try {
        const { amount, title, message } = req.body;
        if (!amount || amount <= 0) return res.json({ success: false, error: 'Geçersiz miktar.' });

        const [players] = await pool.query('SELECT id, username FROM player WHERE is_banned = 0 ORDER BY RAND() LIMIT 1');
        if (players.length === 0) return res.json({ success: false, error: 'Uygun oyuncu bulunamadı.' });

        const winner = players[0];
        await pool.query('UPDATE player SET balance = balance + ? WHERE id = ?', [amount, winner.id]);

        await pool.query('INSERT INTO notifications (player_id, type, title, message) VALUES (?, "admin", ?, ?)',
            [winner.id, title || 'Tebrikler, Çekilişi Kazandınız!', message || `Sistem çekilişinden ${Number(amount).toLocaleString('tr-TR')}₺ kazandınız.`]);

        const { addTreasuryExpense } = require('../services/treasury');
        await addTreasuryExpense(pool, amount, `Çekiliş Ödülü: ${winner.username}`);

        res.json({ success: true, message: `Çekilişi ${winner.username} kazandı! Kişiye ${Number(amount).toLocaleString('tr-TR')}₺ gönderildi.` });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/events/top-seller', requireAdmin, async (req, res) => {
    try {
        const { amount, title, message } = req.body;
        if (!amount || amount <= 0) return res.json({ success: false, error: 'Geçersiz miktar.' });

        const [players] = await pool.query('SELECT id, username, total_profit FROM player WHERE is_banned = 0 ORDER BY total_profit DESC LIMIT 1');
        if (players.length === 0) return res.json({ success: false, error: 'Uygun oyuncu bulunamadı.' });

        const winner = players[0];
        if (!winner.total_profit || winner.total_profit <= 0) return res.json({ success: false, error: 'Kar eden oyuncu yok.' });

        await pool.query('UPDATE player SET balance = balance + ? WHERE id = ?', [amount, winner.id]);

        await pool.query('INSERT INTO notifications (player_id, type, title, message) VALUES (?, "admin", ?, ?)',
            [winner.id, title || 'Tebrikler, Ayın Satıcısı!', message || `En çok kar eden satıcı olarak ${Number(amount).toLocaleString('tr-TR')}₺ ödül kazandınız.`]);

        const { addTreasuryExpense } = require('../services/treasury');
        await addTreasuryExpense(pool, amount, `Ayın Satıcısı Ödülü: ${winner.username}`);

        res.json({ success: true, message: `Ayın Satıcısı: ${winner.username} (${winner.total_profit.toLocaleString()}₺ kar). Kişiye ${Number(amount).toLocaleString('tr-TR')}₺ ödül verildi.` });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =================== OYUNCU TAMAMEN SİL ===================
router.delete('/players/:id', requireAdmin, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const playerId = req.params.id;

        // Kontrol
        const [players] = await connection.query('SELECT id, username FROM player WHERE id = ?', [playerId]);
        if (players.length === 0) {
            connection.release();
            return res.json({ success: false, error: 'Oyuncu bulunamadı.' });
        }

        // Güvenli silme için Foreign Key geçici olarak devre dışı bırakılır
        // Sadece bu silme transaction'ında geçerli olması için ayarlıyoruz
        await connection.beginTransaction();
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');

        // Öfkeli kullanıcının bağımlılıklarını temizleme
        await connection.query('DELETE FROM player_cars WHERE player_id = ?', [playerId]);
        await connection.query('DELETE FROM listings WHERE player_id = ?', [playerId]);
        await connection.query('DELETE FROM notifications WHERE player_id = ?', [playerId]);
        await connection.query('DELETE FROM feedbacks WHERE player_id = ?', [playerId]);
        await connection.query('DELETE FROM transactions WHERE player_id = ?', [playerId]);
        await connection.query('DELETE FROM loan_requests WHERE player_id = ?', [playerId]);
        try { await connection.query('DELETE FROM impounded_cars WHERE player_id = ?', [playerId]); } catch (e) { /* tablo yoksa yoksay */ }
        await connection.query('DELETE FROM offers WHERE listing_id IN (SELECT id FROM listings WHERE player_id = ?)', [playerId]);

        // Oyuncuyu sil
        await connection.query('DELETE FROM player WHERE id = ?', [playerId]);

        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        await connection.commit();

        res.json({ success: true, message: `Oyuncu (${players[0].username}) tamamen silindi.` });
    } catch (err) {
        await connection.rollback();
        // Hata durumunda FK defaulta çevir
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        res.status(500).json({ success: false, error: err.message });
    } finally {
        connection.release();
    }
});

module.exports = router;
