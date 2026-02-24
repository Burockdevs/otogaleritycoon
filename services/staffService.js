const { pool } = require('../db/connection');

const STAFF_ROLES = {
    sales: {
        name: 'Satış Danışmanı',
        baseSalary: 1500,
        hireCost: 2500,
        description: 'NPC tekliflerini %10 - %25 oranında artırır.',
        bonusEffect: (level) => 0.05 + (level * 0.02)
    },
    mechanic: {
        name: 'Usta Tamirci',
        baseSalary: 2000,
        hireCost: 3500,
        description: 'Tamir masraflarını %15 - %35 oranında düşürür.',
        bonusEffect: (level) => 0.10 + (level * 0.05)
    },
    detailer: {
        name: 'Temizlik Uzmanı',
        baseSalary: 1200,
        hireCost: 1500,
        description: 'Araç temizlik değerini artırır ve kirlenmeyi yavaşlatır.',
        bonusEffect: (level) => 0.20 + (level * 0.10)
    }
};

async function getStaff(playerId) {
    const [rows] = await pool.query('SELECT * FROM staff WHERE player_id = ?', [playerId]);
    return rows;
}

async function hireStaff(playerId, role, name) {
    const roleConfig = STAFF_ROLES[role];
    if (!roleConfig) throw new Error('Geçersiz pozisyon');

    // Bakiye kontrolü
    const [player] = await pool.query('SELECT balance FROM player WHERE id = ?', [playerId]);
    if (player[0].balance < roleConfig.hireCost) throw new Error('Yetersiz bakiye');

    await pool.query(
        'INSERT INTO staff (player_id, name, role, salary, level) VALUES (?, ?, ?, ?, ?)',
        [playerId, name || STAFF_ROLES[role].name, role, roleConfig.baseSalary, 1]
    );

    await pool.query('UPDATE player SET balance = balance - ? WHERE id = ?', [roleConfig.hireCost, playerId]);

    return { success: true, message: `${name || roleConfig.name} işe alındı!` };
}

async function fireStaff(playerId, staffId) {
    await pool.query('DELETE FROM staff WHERE id = ? AND player_id = ?', [staffId, playerId]);
    return { success: true, message: 'Personel işten çıkarıldı.' };
}

async function calculateStaffBonuses(playerId) {
    const staff = await getStaff(playerId);
    const bonuses = {
        salesMultiplier: 1.0,
        repairDiscount: 0.0,
        cleaningBonus: 1.0
    };

    staff.forEach(s => {
        const config = STAFF_ROLES[s.role];
        if (config) {
            if (s.role === 'sales') {
                bonuses.salesMultiplier += config.bonusEffect(s.level);
            } else if (s.role === 'mechanic') {
                bonuses.repairDiscount += config.bonusEffect(s.level);
            } else if (s.role === 'detailer') {
                bonuses.cleaningBonus += config.bonusEffect(s.level);
            }
        }
    });

    return bonuses;
}

module.exports = {
    getStaff,
    hireStaff,
    fireStaff,
    calculateStaffBonuses,
    STAFF_ROLES
};
