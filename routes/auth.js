const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db/connection');

// =================== KAYIT OL ===================
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.json({ success: false, error: 'Kullanıcı adı ve şifre gerekli!' });
        }

        if (username.length < 3 || username.length > 30) {
            return res.json({ success: false, error: 'Kullanıcı adı 3-30 karakter olmalı!' });
        }

        if (password.length < 4) {
            return res.json({ success: false, error: 'Şifre en az 4 karakter olmalı!' });
        }

        // Kullanıcı adı kontrolü
        const [existing] = await pool.query('SELECT id FROM player WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.json({ success: false, error: 'Bu kullanıcı adı zaten alınmış!' });
        }

        // Şifreyi hashle
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Kullanıcı sözleşmesi kontrolü
        const { tos_accepted } = req.body;
        if (!tos_accepted) {
            return res.json({ success: false, error: 'Kullanıcı sözleşmesini kabul etmelisiniz!' });
        }

        // Yeni kullanıcı oluştur (Başlangıç 50.000₺)
        const [result] = await pool.query(
            'INSERT INTO player (username, password_hash, name, balance, tos_accepted, tos_accepted_at) VALUES (?, ?, ?, 75000, 1, NOW())',
            [username, passwordHash, username]
        );

        // Hoşgeldin Bildirimi Gönder
        const welcomeTitle = `Hoşgeldin ${username}! 🎉`;
        const welcomeMessage = `Oto Galeri Tycoon'a hoş geldin. Oyun içi bildirimlerini bu sayfadan alabilir, oyun hakkında merak ettiklerini **Menü > Bilgi Bankası** aracılığı ile öğrenebilirsin.<br><br>Merak ettiğin ancak bilgi bankasında bulunmayan bilgileri veya karşılaştığın hataları (bug) **Menü > Geri Bildirim** sayfası üzerinden bize iletebilirsin. Oyunumuz henüz gelişme aşamasında olduğundan dolayı geri bildirimlerin bizim için çok değerli. Hata bildirimlerinizin sistem tarafından ödüllendirileceğini unutma!<br><br>Önerilerini önemsiyor, oyun keyfini zirveye çıkarmak için çalışıyoruz. İyi oyunlar patron! 🚗💨`;

        await pool.query(
            'INSERT INTO notifications (player_id, type, title, message) VALUES (?, "system", ?, ?)',
            [result.insertId, welcomeTitle, welcomeMessage]
        );

        // Session'a kaydet
        req.session.playerId = result.insertId;
        req.session.username = username;

        res.json({
            success: true,
            message: `Hoş geldin ${username}! <i class="fa-solid fa-car"></i> 75.000₺ ile oyuna başlıyorsun!`,
            playerId: result.insertId
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== GİRİŞ YAP ===================
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.json({ success: false, error: 'Kullanıcı adı ve şifre gerekli!' });
        }

        // Kullanıcıyı bul
        const [players] = await pool.query('SELECT * FROM player WHERE username = ?', [username]);
        if (players.length === 0) {
            return res.json({ success: false, error: 'Kullanıcı bulunamadı!' });
        }

        const player = players[0];

        // Ban kontrolü
        if (player.is_banned) {
            const now = new Date();
            const banUntil = player.ban_until ? new Date(player.ban_until) : null;

            if (banUntil && now > banUntil) {
                // Ban süresi dolmuş
                await pool.query('UPDATE player SET is_banned = 0, ban_until = NULL, ban_reason = NULL WHERE id = ?', [player.id]).catch(() => { });
                player.is_banned = 0; // Yerel nesneyi güncelle ki giriş devam edebilsin
            } else {
                let msg = 'Hesabınız yöneticiler tarafından kalıcı olarak yasaklanmıştır.';
                if (banUntil) {
                    msg = `Hesabınız ${banUntil.toLocaleString('tr-TR')} tarihine kadar yasaklanmıştır.`;
                }
                if (player.ban_reason) {
                    msg += `\n\nBan Sebebi: ${player.ban_reason}`;
                }
                return res.json({ success: false, error: msg });
            }
        }


        // Şifre kontrolü
        const isValid = await bcrypt.compare(password, player.password_hash);
        if (!isValid) {
            return res.json({ success: false, error: 'Şifre hatalı!' });
        }

        // Session'a kaydet
        req.session.playerId = player.id;
        req.session.username = player.username;

        // Son giriş zamanını güncelle
        pool.query('UPDATE player SET last_login = NOW() WHERE id = ?', [player.id]).catch(() => { });

        res.json({
            success: true,
            message: `Tekrar hoş geldin ${player.username}! <i class="fa-solid fa-car"></i>`,
            playerId: player.id
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== ÇIKIŞ YAP ===================
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ success: false, error: 'Çıkış yapılamadı' });
        res.json({ success: true, message: 'Çıkış yapıldı' });
    });
});

// =================== OTURUM KONTROLÜ ===================
router.get('/me', async (req, res) => {
    if (req.session && req.session.playerId) {
        // İsteğe bağlı: Güvenlik için token veya hafif ban kontrolü
        const [pRows] = await pool.query('SELECT is_banned, ban_until FROM player WHERE id = ?', [req.session.playerId]);
        if (pRows.length > 0 && pRows[0].is_banned) {
            const p = pRows[0];
            if (!p.ban_until || new Date() < new Date(p.ban_until)) {
                req.session.destroy();
                return res.json({ success: false, loggedIn: false, error: 'Hesabınız yasaklandı!' });
            }
        }

        res.json({
            success: true,
            loggedIn: true,
            playerId: req.session.playerId,
            username: req.session.username
        });
    } else {
        res.json({ success: true, loggedIn: false });
    }
});

module.exports = router;
