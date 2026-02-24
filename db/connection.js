require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'v2e@yh3PGrp7NhN',
    database: process.env.DB_NAME || 'galeri_simulator',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    decimalNumbers: true,
    multipleStatements: true
});

// Bağlantı testi
async function testConnection() {
    try {
        // Güvenlik amaçlı db'yi önceden oluştur
        const tempConn = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || 'v2e@yh3PGrp7NhN' });
        await tempConn.query("CREATE DATABASE IF NOT EXISTS galeri_simulator DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await tempConn.end();

        const conn = await pool.getConnection();
        console.log('✅ MySQL bağlantısı başarılı!');
        conn.release();
        return true;
    } catch (err) {
        console.error('❌ MySQL bağlantı hatası:', err.message);
        console.log('⚠️  XAMPP MySQL servisinin çalıştığından emin olun!');
        return false;
    }
}

module.exports = { pool, testConnection };
