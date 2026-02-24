const { pool } = require('../db/connection');
const { getOfferInterval, generateOfferPrice, calculateMarketValue, calculateAppraisalValue } = require('./pricing');
const { createOffer } = require('./npc');
const { generateNewTrend } = require('./trendService');

let io;
let nextResetTime = Date.now() + 60000;

function setIO(socketIO) {
    io = socketIO;
}

function getIO() {
    return io;
}

function getNextResetTime() {
    return nextResetTime;
}

// =================== TÜM LOOP'LARI BAŞLAT ===================
function startAllLoops() {
    // Merkezi 60 Saniyelik Gün Döngüsü
    startMasterDayLoop();

    // Bağımsız Uzun Döngüler
    startPersonalCarLoop();
    startPrestigeLoop();
    startDynamicMarketLoop();
    startTrendLoop();
    startCheapCarRestockLoop();
    startJunkyardRestockLoop();
    startRacingLoop();

    console.log('Game Looplar başlatıldı (Master Day Cycle: 60s)');
}

// =================== MERKEZİ GÜN DÖNGÜSÜ (60s) ===================
let dayCounter = 0;
async function startMasterDayLoop() {
    try {
        dayCounter++;
        if (dayCounter % 5 === 0 || dayCounter === 1) {
            console.log(`🌅 Yeni oyun günü başlıyor... (Gün: ${dayCounter})`);
        }

        // 1. Teklifleri Güncelle (Tüm aktif ilanlara popülariteye göre teklifler)
        const [listings] = await pool.query(`
            SELECT l.*, c.price, m.popularity_multiplier 
            FROM listings l 
            JOIN cars c ON l.car_id = c.id 
            JOIN models m ON c.model_id = m.id
            WHERE l.status = "active" AND l.listing_type = "normal"
        `);
        for (const listing of listings) {
            try {
                const mv = await calculateMarketValue(listing.car_id);
                const marketValue = mv ? mv.marketValue : listing.asking_price;
                await createOffer(listing, marketValue, io, listing.popularity_multiplier);
            } catch (err) {
                console.error(`Teklif hatası (ID: ${listing.id}):`, err);
            }
        }

        // 2. Maaş Ödemeleri
        const [staff] = await pool.query('SELECT player_id, SUM(salary) as total_salary FROM staff GROUP BY player_id');
        for (const s of staff) {
            await pool.query('UPDATE player SET balance = balance - ?, total_loss = total_loss + ? WHERE id = ?', [s.total_salary, s.total_salary, s.player_id]);
            await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "expense", ?, "Personel maaş ödemeleri")', [s.player_id, s.total_salary]);
        }

        // 3. Kredi ve Taksit Ödemeleri (15 dakikada bir = 30 oyun günü)
        if (dayCounter % 30 === 0) {
            // --- Banka Kredileri ---
            try {
                const [borrowers] = await pool.query('SELECT * FROM player WHERE loan_remaining > 0 AND loan_months_left > 0');
                for (const p of borrowers) {
                    const payment = Math.min(p.loan_monthly_payment, p.loan_remaining);
                    if (p.balance >= payment) {
                        const newRemaining = Math.max(0, p.loan_remaining - payment);
                        const newMonths = Math.max(0, p.loan_months_left - 1);
                        const extra = newRemaining === 0 ? ', loan_amount = 0, loan_monthly_payment = 0' : '';
                        await pool.query(
                            `UPDATE player SET balance = balance - ?, loan_remaining = ?, loan_months_left = ?, loan_missed_payments = 0 ${extra} WHERE id = ?`,
                            [payment, newRemaining, newMonths, p.id]
                        );
                        const { addTreasuryIncome } = require('./treasury');
                        await addTreasuryIncome(pool, payment, `Kredi Taksidi (${p.username})`);

                        await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "loan_payment", ?, ?)',
                            [p.id, payment, newRemaining > 0 ? `Kredi taksidi (Kalan: ${newRemaining.toLocaleString('tr-TR')}₺)` : 'Kredi tamamen bitti! 🎉']);
                        await pool.query('INSERT INTO profit_history (player_id, type, amount, description) VALUES (?, "expense", ?, ?)',
                            [p.id, payment, 'Kredi taksidi']);

                        if (io) io.to(`player_${p.id}`).emit('player_update', { playerId: p.id });
                    } else {
                        const missed = (p.loan_missed_payments || 0) + 1;
                        const penalty = Math.round(payment * 0.05);

                        let seizedFlag = missed >= 3 ? 1 : 0;

                        if (missed >= 3) {
                            // En değerli aracına el koy
                            const [cars] = await pool.query('SELECT * FROM player_cars WHERE player_id = ? ORDER BY buy_price DESC LIMIT 1', [p.id]);
                            if (cars.length > 0) {
                                const c = cars[0];
                                await pool.query('INSERT INTO impounded_cars (player_id, car_id, motor_health, damage_status, buy_price) VALUES (?, ?, ?, ?, ?)',
                                    [p.id, c.car_id, c.motor_health, c.damage_status, c.buy_price]);
                                await pool.query('DELETE FROM listings WHERE player_car_id = ?', [c.id]);
                                await pool.query('DELETE FROM player_cars WHERE id = ?', [c.id]);

                                await pool.query('INSERT INTO notifications (player_id, type, title, message) VALUES (?, "system", "Haciz Şoku!", "Kredi borcunuzu ödemediğiniz için en değerli aracınıza el konulup Devlet Otoparkına çekildi.")', [p.id]);
                            }
                            // Hack: reset missed so we don't seize a car every single day
                            await pool.query(
                                'UPDATE player SET loan_remaining = loan_remaining + ?, loan_missed_payments = 0, is_seized = 1 WHERE id = ?',
                                [penalty, p.id]
                            );
                        } else {
                            await pool.query(
                                'UPDATE player SET loan_remaining = loan_remaining + ?, loan_missed_payments = ?, is_seized = ? WHERE id = ?',
                                [penalty, missed, seizedFlag, p.id]
                            );
                        }
                    }
                }
            } catch (err) {
                console.error('Kredi ödeme hatası:', err);
            }

            // --- Taksit Ödemeleri ---
            try {
                const [pendingInstallments] = await pool.query(
                    `SELECT DISTINCT seller_id FROM installment_payments WHERE status = 'pending'`
                );
                for (const inst of pendingInstallments) {
                    const [nextPayment] = await pool.query(
                        `SELECT * FROM installment_payments WHERE seller_id = ? AND status = 'pending' ORDER BY installment_number ASC LIMIT 1`,
                        [inst.seller_id]
                    );
                    if (nextPayment.length > 0) {
                        const payment = nextPayment[0];
                        await pool.query('UPDATE player SET balance = balance + ? WHERE id = ?', [payment.amount, payment.seller_id]);
                        await pool.query('UPDATE installment_payments SET status = "paid", paid_at = NOW() WHERE id = ?', [payment.id]);
                        await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "installment", ?, ?)',
                            [payment.seller_id, payment.amount, `Taksit ödemesi ${payment.installment_number}/${payment.total_installments}`]);
                        await pool.query('INSERT INTO profit_history (player_id, type, amount, description) VALUES (?, "income", ?, ?)',
                            [payment.seller_id, payment.amount, `Taksit geliri ${payment.installment_number}/${payment.total_installments}`]);
                        await pool.query(
                            'INSERT INTO notifications (player_id, type, title, message) VALUES (?, "installment", ?, ?)',
                            [payment.seller_id, '<i class="fa-solid fa-money-bill-wave"></i> Taksit Ödemesi', `${payment.installment_number}. taksit ödendi: ${payment.amount.toLocaleString('tr-TR')}₺ (${payment.total_installments - payment.installment_number} taksit kaldı)`]
                        );
                        if (io) {
                            io.to(`player_${payment.seller_id}`).emit('installment_paid', { seller_id: payment.seller_id, amount: payment.amount, installment_number: payment.installment_number, total_installments: payment.total_installments });
                        }
                    }
                }
            } catch (err) {
                console.error('Taksit ödeme hatası:', err);
            }
        }
        // Global Reset Sinyali
        if (io) {
            io.emit('day_reset', { nextResetIn: 30 });
            io.emit('player_update', {});
        }

        nextResetTime = Date.now() + 30000;
        // 4. Günlük Risk Azalması ve Haciz Kontrolü
        await processRiskAndPolice();
    } catch (err) {
        console.error('Master loop hatası:', err);
    }

    // Tam 30 saniyede bir çalışır
    setTimeout(startMasterDayLoop, 30000);
}

// =================== RİSK & POLİS SİSTEMİ ===================
async function processRiskAndPolice() {
    try {
        const [risky] = await pool.query('SELECT id, username, risk_level FROM player WHERE risk_level > 0');
        for (const p of risky) {
            if (p.risk_level >= 100) {
                // El koyma mantığı
                const [illegalCars] = await pool.query(
                    `SELECT pc.id, pc.car_id, b.name as brand_name, m.name as model_name
                     FROM player_cars pc
                     JOIN cars c ON pc.car_id = c.id
                     JOIN brands b ON c.brand_id = b.id
                     JOIN models m ON c.model_id = m.id
                     JOIN illegal_mods im ON im.player_car_id = pc.id
                     WHERE pc.player_id = ? LIMIT 1`, [p.id]
                );
                if (illegalCars.length > 0) {
                    const car = illegalCars[0];
                    await pool.query('DELETE FROM offers WHERE listing_id IN (SELECT id FROM listings WHERE player_car_id = ?)', [car.id]);
                    await pool.query('DELETE FROM listings WHERE player_car_id = ?', [car.id]);
                    await pool.query('DELETE FROM illegal_mods WHERE player_car_id = ?', [car.id]);
                    await pool.query('DELETE FROM player_cars WHERE id = ?', [car.id]);
                    await pool.query("UPDATE cars SET owner_type='market', is_available=0 WHERE id=?", [car.car_id]);
                    await pool.query('UPDATE player SET risk_level = 0 WHERE id = ?', [p.id]);
                    if (io) io.to(`player_${p.id}`).emit('police_seizure', { player_id: p.id, car_name: `${car.brand_name} ${car.model_name}` });
                } else {
                    await pool.query('UPDATE player SET risk_level = 0 WHERE id = ?', [p.id]);
                }
            } else {
                // Günlük risk azalması (%1 - Çok daha yavaş düşüş)
                await pool.query('UPDATE player SET risk_level = GREATEST(0, risk_level - 1) WHERE id = ?', [p.id]);
            }
        }
    } catch (err) {
        console.error('Risk process hatası:', err);
    }
}

// =================== DİNAMİK MARKET (Background) ===================
async function startDynamicMarketLoop() {
    try {
        const action = Math.random();
        if (action < 0.3) await addRandomCarToMarket();
        else if (action < 0.5) await removeOldCarFromMarket();
    } catch (err) { console.error('Market loop hatası:', err); }
    setTimeout(startDynamicMarketLoop, 120000 + Math.random() * 180000);
}

// =================== DİNAMİK MARKET RESTOCK (30 DK) ===================
async function startCheapCarRestockLoop() {
    try {
        const [countRes] = await pool.query("SELECT COUNT(*) as c FROM cars WHERE owner_type='market' AND is_available=1 AND price <= 80000");
        if (countRes[0].c < 15) {
            console.log('📉 Piyasada ucuz araç azaldı. Sistem ucuz araç takviyesi yapıyor...');
            const needed = 15 - countRes[0].c;
            for (let i = 0; i < needed; i++) {
                await addRandomCarToMarket(true);
            }
            if (io) io.emit('market_update', { message: '📉 Piyasaya yeni ucuz bütçeli araçlar eklendi! Keşfet sekmesinden inceleyebilirsiniz.' });
        }
    } catch (err) {
        console.error('Ucuz araç restock hatası:', err);
    }
    setTimeout(startCheapCarRestockLoop, 30 * 60 * 1000); // 30 Dk
}

// =================== HURDALIK RESTOCK (5 dakikada bir, max 100 araç) ===================
async function startJunkyardRestockLoop() {
    try {
        const [countRes] = await pool.query("SELECT COUNT(*) as c FROM cars WHERE owner_type='junkyard' AND is_available=1");
        const currentCount = countRes[0].c;

        // Max 100 aracı aşma, fazlalıkları sil
        if (currentCount > 100) {
            const excess = currentCount - 100;
            await pool.query(`DELETE cp FROM car_parts cp JOIN cars c ON cp.car_id = c.id WHERE c.owner_type='junkyard' AND c.is_available=1 ORDER BY c.created_at ASC LIMIT ?`, [excess * 30]);
            await pool.query(`DELETE FROM cars WHERE owner_type='junkyard' AND is_available=1 ORDER BY created_at ASC LIMIT ?`, [excess]);
        }

        // Her döngüde 2-3 araç ekle (max 100'e kadar)
        if (currentCount < 100) {
            const toAdd = Math.min(Math.floor(Math.random() * 2) + 2, 100 - currentCount); // 2-3 araç
            const { randomFrom, randomBetween, getEngineForModel, getHorsepowerForEngine, generateParts } = require('../db/seed');
            const { BRANDS, COLORS, INTERIORS, INTERIOR_COLORS, FUEL_TYPES, TRANSMISSIONS, JUNKYARD_DESCRIPTIONS } = require('../data/brands');

            for (let j = 0; j < toAdd; j++) {
                const brand = randomFrom(BRANDS.filter(b => b.prestige <= 5));
                const model = randomFrom(brand.models);
                const [br] = await pool.query('SELECT id FROM brands WHERE name = ?', [brand.name]);
                const [mr] = await pool.query('SELECT id FROM models WHERE name = ? AND brand_id = ?', [model.name, br[0]?.id]);
                if (!br[0] || !mr[0]) continue;

                const year = randomBetween(2000, 2018);
                const km = randomBetween(150000, 500000);
                const engineSize = getEngineForModel(model.tier, brand.prestige);
                const hp = getHorsepowerForEngine(engineSize, model.tier);

                // Fiyat: 10.000 - 30.000₺ arası (hurdalık fiyatları)
                const junkPrice = randomBetween(10000, 30000);
                const desc = randomFrom(JUNKYARD_DESCRIPTIONS);
                const engineSt = Math.random() < 0.4 ? 'Ölü' : 'Kötü';
                const mh = engineSt === 'Ölü' ? randomBetween(0, 10) : randomBetween(10, 30);

                const [cr] = await pool.query(
                    `INSERT INTO cars (brand_id, model_id, year, km, price, color, fuel_type, transmission,
                     engine_size, horsepower, top_speed, torque, motor_health, damage_status, engine_status,
                     body_type, interior, interior_color, seller_type, description, cleanliness,
                     owner_type, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'junkyard', 1)`,
                    [br[0].id, mr[0].id, year, km, junkPrice, randomFrom(COLORS),
                    randomFrom(FUEL_TYPES.map(f => f.type)), randomFrom(TRANSMISSIONS.map(t => t.type)),
                        engineSize, hp, Math.max((model.topSpeed || 150) - 50, 80), Math.max((model.torque || 150) - 60, 40),
                        mh, Math.random() < 0.5 ? 'Pert' : 'Hasarlı', engineSt,
                    model.body, randomFrom(INTERIORS), randomFrom(INTERIOR_COLORS), 'Hurdalık', desc,
                    randomBetween(5, 25)]
                );
                const jcId = cr.insertId;
                const jParts = generateParts('Hasarlı');
                for (const part of jParts) {
                    const st = Math.random() < 0.3 ? 'Yok' : (Math.random() < 0.5 ? 'Hasarlı' : part.status);
                    await pool.query('INSERT INTO car_parts (car_id, part_name, status) VALUES (?, ?, ?)', [jcId, part.name, st]);
                }
            }
        }
    } catch (err) {
        console.error('Hurdalık restock hatası:', err);
    }
    setTimeout(startJunkyardRestockLoop, 5 * 60 * 1000); // 5 Dakika
}

// Yardımcı fonksiyonlar (Kısa halleriyle korundu)
async function addRandomCarToMarket(forceCheap = false) {
    try {
        const { calculatePrice, generateParts, generateDynamicDescription, randomFrom, randomBetween } = require('./carService');
        const { COLORS, DAMAGE_STATUSES, ENGINE_STATUSES } = require('../data/brands');

        let query = 'SELECT m.*, b.name as brand_name, b.prestige, b.id as brand_id FROM models m JOIN brands b ON m.brand_id = b.id';
        if (forceCheap) query += ' WHERE b.prestige <= 3 AND m.tier <= 2';
        query += ' ORDER BY RAND() LIMIT 1';

        const [models] = await pool.query(query);
        if (!models.length) return;
        const m = models[0];
        const year = randomBetween(2010, 2025);
        const km = randomBetween(0, 300000);
        const dmg = forceCheap ? randomFrom(DAMAGE_STATUSES.filter(d => ['Çizik', 'Hasarlı', 'Değişen', 'Boyalı'].includes(d.status))).status : randomFrom(DAMAGE_STATUSES).status || 'Hasarsız';
        const eng = forceCheap ? randomFrom(ENGINE_STATUSES.filter(e => ['Orta', 'Kötü'].includes(e.status))).status : randomFrom(ENGINE_STATUSES).status || 'İyi';
        let price = calculatePrice(m.base_price, year, km, dmg, eng, m.tier);
        // Hasar durumuna göre kademeli minimum fiyat
        const minPrices = { 'Hasarsız': 60000, 'Çizik': 45000, 'Boyalı': 40000, 'Değişen': 35000, 'Hasarlı': 25000, 'Pert': 15000 };
        const minPrice = minPrices[dmg] || 25000;
        price = Math.max(Math.round(price), minPrice);

        const [res] = await pool.query('INSERT INTO cars SET ?', {
            brand_id: m.brand_id, model_id: m.id, year, km, price: price, color: randomFrom(COLORS),
            fuel_type: m.fuel_type || (m.fuelTypes && m.fuelTypes[0]) || 'Benzin',
            transmission: 'Otomatik', engine_size: 1.6, horsepower: 150,
            damage_status: dmg, engine_status: eng, owner_type: 'market', is_available: 1, cleanliness: randomBetween(30, 80), description: 'Pazardan gelen araç'
        });
        const parts = generateParts(dmg);
        for (let p of parts) await pool.query('INSERT INTO car_parts SET ?', { car_id: res.insertId, part_name: p.name, status: p.status });
    } catch (e) { console.error('Market Add Error:', e); }
}

async function removeOldCarFromMarket() {
    try {
        const [cars] = await pool.query("SELECT id FROM cars WHERE owner_type='market' AND is_available=1 ORDER BY created_at ASC LIMIT 1");
        if (cars.length) await pool.query('DELETE FROM cars WHERE id=?', [cars[0].id]);
    } catch (e) { console.error('Market Remove Error:', e); }
}

// Diğer Bağımsız Looplar
async function startTrendLoop() {
    try { await generateNewTrend(); } catch (e) { }
    setTimeout(startTrendLoop, 6 * 60 * 60 * 1000);
}

async function startPersonalCarLoop() {
    try {
        await pool.query('UPDATE cars SET km = km + 5, cleanliness = GREATEST(0, cleanliness - 1) WHERE id IN (SELECT car_id FROM player_cars pc JOIN player p ON pc.id = p.personal_car_id)');
    } catch (e) { }
    setTimeout(startPersonalCarLoop, 60000);
}

async function startPrestigeLoop() {
    try {
        // Tek sorguda tüm oyuncuların puanını güncelle (Daha yavaş prestij artışı için çarpanlar düşürüldü)
        await pool.query('UPDATE player SET prestige_score = FLOOR(xp * 0.5) + (total_sales * 5)');
    } catch (e) {
        console.error('Prestige loop hatası:', e);
    }
    setTimeout(startPrestigeLoop, 300000); // 5 dakikada bir
}

// =================== YARIŞ ORGANİZASYONU DÖNGÜSÜ (1 Dk) ===================
async function startRacingLoop() {
    setInterval(async () => {
        try {
            // Süresi dolmuş ve hala pending olan yarışları bul
            const [races] = await pool.query(
                'SELECT * FROM races WHERE status = "pending" AND starts_at <= NOW()'
            );

            for (const race of races) {
                // Katılımcıları al
                const [participants] = await pool.query(`
                    SELECT rp.id as rp_id, rp.player_id, rp.car_id, 
                           c.id as car_true_id, c.model_id, c.brand_id, c.horsepower, c.torque, c.damage_status,
                           b.name as brand_name, m.name as model_name,
                           (SELECT COUNT(*) FROM illegal_mods im WHERE im.player_car_id = rp.car_id AND im.mod_type = 'racing_tires') as has_racing_tires
                    FROM race_participants rp
                    JOIN player_cars pc ON rp.car_id = pc.id
                    JOIN cars c ON pc.car_id = c.id
                    JOIN brands b ON c.brand_id = b.id
                    JOIN models m ON c.model_id = m.id
                    WHERE rp.race_id = ? AND rp.status = 'registered'
                `, [race.id]);

                if (participants.length === 0) {
                    await pool.query('UPDATE races SET status = "cancelled" WHERE id = ?', [race.id]);
                    continue;
                }

                const totalPrizePool = race.entry_fee * participants.length;
                const isIllegal = race.is_illegal;
                let results = [];

                for (let p of participants) {
                    // Risk & Kaza Zarları (RNG)
                    const crashRoll = Math.random() * 100;

                    // İllegal yarışlarda kaza riski daha yüksek
                    const crashThreshold = isIllegal ? 8.0 : 2.5;

                    if (crashRoll <= crashThreshold) {
                        await pool.query('UPDATE race_participants SET status = "crashed", score = 0 WHERE id = ?', [p.rp_id]);

                        // Aracı ciddi hasarlı yap
                        await pool.query('UPDATE cars SET damage_status = "Hasarlı", engine_status = "Kötü" WHERE id = ?', [p.car_true_id]);

                        const msg = isIllegal
                            ? "Sokak yarışında virajı alamayıp duvara çaptınız! Araç ağır hasarlı."
                            : "Pist yarışında kaza yaptınız! Araç ağır hasar gördü.";

                        await pool.query('INSERT INTO notifications (player_id, type, title, message) VALUES (?, "system", "Yarış Kazası!", ?)', [p.player_id, msg]);

                        // Marka popülerliği kaybı
                        await pool.query('UPDATE models SET popularity_multiplier = GREATEST(0.50, popularity_multiplier - 0.15) WHERE id = ?', [p.model_id]);

                        // İllegal ise risk seviyesini artır
                        if (isIllegal) {
                            await pool.query('UPDATE player SET risk_level = risk_level + 5 WHERE id = ?', [p.player_id]);
                        }

                        results.push({ ...p, score: 0, status: 'disqualified', reward: 0 });
                        continue;
                    }

                    // Ufak Parça Hasarı Şansı
                    const scThreshold = isIllegal ? 30 : 20;
                    if (crashRoll > crashThreshold && crashRoll <= scThreshold) {
                        if (p.damage_status === "Hasarsız" || p.damage_status === "Orijinal") {
                            await pool.query('UPDATE cars SET damage_status = "Çizik" WHERE id = ?', [p.car_true_id]);
                            await pool.query('INSERT INTO notifications (player_id, type, title, message) VALUES (?, "system", "Yarış Hasarı", "Sürtünmeden dolayı araçta ufak çizikler oluştu.")', [p.player_id]);
                        }
                    }

                    // Motor Skoru Hesaplama
                    let baseScore = (p.horsepower * 1.5) + (p.torque * 1.2);
                    if (p.has_racing_tires > 0) baseScore *= 1.20;

                    const rngMult = 0.90 + (Math.random() * 0.20);
                    const finalScore = Math.floor(baseScore * rngMult);

                    await pool.query('UPDATE race_participants SET status = "finished", score = ? WHERE id = ?', [finalScore, p.rp_id]);
                    results.push({ ...p, score: finalScore, status: 'finished', reward: 0 });
                }

                const finishers = results.filter(r => r.status === 'finished').sort((a, b) => b.score - a.score);

                if (finishers.length > 0) {
                    const firstPlace = finishers[0];
                    firstPlace.reward = totalPrizePool * (isIllegal ? 0.70 : 0.50); // İllegalde kazanan hepsini toplar (neredeyse)
                    await notifyWinner(firstPlace, "1. Sıra", firstPlace.reward);

                    await pool.query('UPDATE models SET popularity_multiplier = LEAST(2.00, popularity_multiplier + 0.10) WHERE id = ?', [firstPlace.model_id]);

                    if (isIllegal) {
                        await pool.query('UPDATE player SET reputation = reputation + 2, risk_level = risk_level + 2 WHERE id = ?', [firstPlace.player_id]);
                    }

                    if (!isIllegal) {
                        if (finishers.length > 1) {
                            const secondPlace = finishers[1];
                            secondPlace.reward = totalPrizePool * 0.30;
                            await notifyWinner(secondPlace, "2. Sıra", secondPlace.reward);
                        }
                        if (finishers.length > 2) {
                            const thirdPlace = finishers[2];
                            thirdPlace.reward = totalPrizePool * 0.20;
                            await notifyWinner(thirdPlace, "3. Sıra", thirdPlace.reward);
                        }
                    } else if (finishers.length > 1) {
                        // İllegalde 2.ye teselli ikramiyesi
                        const secondPlace = finishers[1];
                        secondPlace.reward = totalPrizePool * 0.15;
                        await notifyWinner(secondPlace, "2. Sıra", secondPlace.reward);
                    }
                }

                // Yarışı kapat
                await pool.query('UPDATE races SET status = "completed" WHERE id = ?', [race.id]);
            }
        } catch (err) {
            console.error('[RacingLoop] Hata:', err);
        }
    }, 60000); // Her 1 dakikada bir kontrol eder
}

async function notifyWinner(pilot, rank, reward) {
    await pool.query('UPDATE race_participants SET reward = ? WHERE id = ?', [reward, pilot.rp_id]);
    await pool.query('UPDATE player SET balance = balance + ? WHERE id = ?', [reward, pilot.player_id]);
    await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "income", ?, "Yarış Ödülü - Pist")', [pilot.player_id, reward]);
    await pool.query(
        'INSERT INTO notifications (player_id, type, title, message) VALUES (?, "system", "Yarış Sonucu!", ?)',
        [pilot.player_id, `Zorlu pist yarışında ${rank} oldunuz! Katılım ve performansınız sayesinde hesabınıza ${Number(reward).toLocaleString('tr-TR')}₺ yattı. ${pilot.brand_name} markası piyasada ivme yakaladı!`]
    );
    if (io) {
        io.to(`player_${pilot.player_id}`).emit('player_update', { playerId: pilot.player_id, balanceChange: reward });
    }
}

module.exports = { setIO, getIO, startAllLoops, getNextResetTime };
