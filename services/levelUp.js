const { pool } = require('../db/connection');

// Seviye atlama kontrolü - tek bir yerde yönetilir
async function checkLevelUp(playerId) {
    const [players] = await pool.query('SELECT * FROM player WHERE id = ?', [playerId]);
    if (players.length === 0) return null;
    const p = players[0];

    let leveled = false;
    while (p.xp >= p.xp_needed) {
        p.xp -= p.xp_needed;
        p.level += 1;
        p.xp_needed = Math.round(p.xp_needed * 1.35); // ZORLAŞTIRILDI (1.25 -> 1.35)
        leveled = true;

        // Seviye ödülleri
        if (p.level === 3) {
            await pool.query(
                `INSERT INTO notifications (player_id, type, title, message, details) VALUES (?, 'system', 'İllegal Garaj Açıldı!', 'Seviye 3 oldunuz ve İllegal Garaj erişimi kazandınız! Detaylar için tıklayın.', 'İllegal garajda araçlarınıza çalıntı parça takabilir, motor, egzoz ve plaka modifikasyonları (Ağır Hasarlı/Pert araçları ucuza toplayıp millete kitlemek) yapabilirsiniz. Ancak dikkat edin; her illegal işlem yakalanma (Risk) seviyenizi artırır. Risk seviyeniz %100 olursa polis garajı basar ve araçlarınıza el koyar! Karlı ama tehlikeli bir yolculuk sizi bekliyor.')`,
                [playerId]
            );
        }
        if (p.level === 10) {
            p.max_car_slots = Math.max(p.max_car_slots, 5);
            await pool.query(
                `INSERT INTO notifications (player_id, type, title, message) VALUES (?, 'system', 'Seviye 10 Ödülü', 'Tebrikler! Garaj kapasiteniz 5 araca çıkarıldı.')`,
                [playerId]
            );
        }
        if (p.level === 20) {
            p.max_car_slots = Math.max(p.max_car_slots, 10);
            await pool.query(
                `INSERT INTO notifications (player_id, type, title, message) VALUES (?, 'system', 'Seviye 20 Ödülü', 'Harika gidiyorsun! Garaj kapasiteniz 10 araca çıkarıldı.')`,
                [playerId]
            );
        }
        if (p.level >= 40 && p.can_custom_build === 0) {
            p.can_custom_build = 1;
            await pool.query(
                `INSERT INTO notifications (player_id, type, title, message, details) VALUES (?, 'system', 'Özel Üretim Açıldı!', 'Seviye 40 oldunuz, artık Fabrika sekmesinde kendi aracınızı toplayabilirsiniz!', 'Özel Üretim özelliği sayesinde fabrikadan şasi, motor, egzoz ve kaporta parçalarını tek tek seçerek tamamen size özgü sıfır kilometre bir araç üretebilirsiniz.')`,
                [playerId]
            );
        }
    }

    if (leveled) {
        await pool.query(
            'UPDATE player SET xp = ?, level = ?, xp_needed = ?, max_car_slots = ?, can_custom_build = ? WHERE id = ?',
            [p.xp, p.level, p.xp_needed, p.max_car_slots, p.can_custom_build, playerId]
        );
    }
    return p;
}

module.exports = { checkLevelUp };
