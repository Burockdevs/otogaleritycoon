const { pool } = require('./db/connection');

async function debug() {
    try {
        const [junkyardCars] = await pool.query("SELECT COUNT(*) as count FROM cars WHERE owner_type = 'junkyard'");
        console.log('Total junkyard cars in DB:', junkyardCars[0].count);

        const [availableJunkyardCars] = await pool.query("SELECT COUNT(*) as count FROM cars WHERE owner_type = 'junkyard' AND is_available = 1");
        console.log('Available junkyard cars in DB:', availableJunkyardCars[0].count);

        const [sampleCars] = await pool.query(`
            SELECT c.id, b.name as brand_name, m.name as model_name, c.is_available 
            FROM cars c 
            JOIN models m ON c.model_id = m.id 
            JOIN brands b ON m.brand_id = b.id 
            WHERE c.owner_type = 'junkyard' 
            LIMIT 5
        `);
        console.log('Sample junkyard cars with JOIN:', sampleCars);

        const [levelCheck] = await pool.query("SELECT id, username, level FROM players LIMIT 5");
        console.log('Sample players level:', levelCheck);

        process.exit(0);
    } catch (err) {
        console.error('Debug error:', err);
        process.exit(1);
    }
}

debug();
