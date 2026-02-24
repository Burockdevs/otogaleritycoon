const { pool } = require('./db/connection');

async function check() {
    try {
        const [rows] = await pool.query('DESCRIBE player');
        console.log('--- PLAYER TABLE STRUCTURE ---');
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

check();
