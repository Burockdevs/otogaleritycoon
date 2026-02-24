const { pool } = require('../db/connection');
const { generateOfferPrice } = require('./pricing');

// NPC teklifi oluştur (Popülariteye göre dinamik sayı)
async function createOffer(listing, marketValue, io, popularityMultiplier = 1.00) {
    try {
        // Popülarite çarpanı ile teklif sayısını (hızını) belirle. Min 1, popülerliğe göre katlanır.
        const baseOfferCount = 2 + (Math.random() * 3); // 2 ile 5 arası ham sayı
        const offerCount = Math.max(1, Math.floor(baseOfferCount * parseFloat(popularityMultiplier)));

        const createdOffers = [];

        // Rastgele NPC'ler seç (farklı tipler karışık gelsin)
        const [npcs] = await pool.query('SELECT * FROM npc_buyers ORDER BY RAND() LIMIT ?', [offerCount]);
        if (npcs.length === 0) return null;

        // Araca dair detaylı bilgileri ve oyuncunun alış maliyetini al
        const [carData] = await pool.query(
            'SELECT c.km, c.engine_status, c.damage_status, c.body_type, c.fuel_type, pc.buy_price FROM cars c JOIN player_cars pc ON c.id = pc.car_id WHERE c.id = ? AND pc.id = ?',
            [listing.car_id, listing.player_car_id]
        );

        const playerBuyPrice = carData[0]?.buy_price || 0;

        for (const npc of npcs) {
            const { price: offerPrice, message: offerMessage } = await generateOfferPrice(
                listing.asking_price,
                marketValue,
                npc.type,
                carData[0],
                listing.player_id,
                npc.wealth_level || 1,
                playerBuyPrice
            );

            if (offerPrice <= 0) continue;

            // Teklifi kaydet
            const [result] = await pool.query(
                'INSERT INTO offers (listing_id, npc_id, offer_price, message) VALUES (?, ?, ?, ?)',
                [listing.id, npc.id, offerPrice, offerMessage]
            );

            // İlan teklif sayısını güncelle
            await pool.query(
                'UPDATE listings SET offer_count = offer_count + 1 WHERE id = ?',
                [listing.id]
            );

            const offer = {
                id: result.insertId,
                listing_id: listing.id,
                npc_id: npc.id,
                npc_name: npc.name,
                npc_type: npc.type,
                npc_wealth: npc.wealth_level || 1,
                offer_price: offerPrice,
                message: offerMessage,
                status: 'pending'
            };

            createdOffers.push(offer);

            // Socket.IO ile sadece ilgili oyuncuya bildir
            if (io) {
                io.to(`player_${listing.player_id}`).emit('new_offer', offer);
            }
        }

        return createdOffers.length > 0 ? createdOffers : null;
    } catch (err) {
        console.error('NPC teklif oluşturma hatası:', err);
        return null;
    }
}

module.exports = {
    createOffer
};
