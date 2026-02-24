const { pool } = require('../db/connection');

async function addTreasuryIncome(poolOrConnection, amount, description) {
    if (!amount || amount <= 0) return;
    try {
        await poolOrConnection.query('UPDATE treasury SET balance = balance + ?, total_income = total_income + ?', [amount, amount]);
        await poolOrConnection.query('INSERT INTO treasury_logs (type, amount, description) VALUES ("income", ?, ?)', [amount, description]);
    } catch (e) {
        console.error("Treasury Income Error:", e);
    }
}

async function addTreasuryExpense(poolOrConnection, amount, description) {
    if (!amount || amount <= 0) return;
    try {
        await poolOrConnection.query('UPDATE treasury SET balance = balance - ?, total_expense = total_expense + ?', [amount, amount]);
        await poolOrConnection.query('INSERT INTO treasury_logs (type, amount, description) VALUES ("expense", ?, ?)', [amount, description]);
    } catch (e) {
        console.error("Treasury Expense Error:", e);
    }
}

async function getTreasuryStats() {
    try {
        const [rows] = await pool.query('SELECT * FROM treasury LIMIT 1');
        return rows[0] || { balance: 0, total_income: 0, total_expense: 0 };
    } catch (e) {
        return { balance: 0, total_income: 0, total_expense: 0 };
    }
}

module.exports = {
    addTreasuryIncome,
    addTreasuryExpense,
    getTreasuryStats
};
