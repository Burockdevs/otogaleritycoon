const { pool, testConnection } = require('./connection');
const fs = require('fs');
const path = require('path');
const {
    BRANDS, COLORS, INTERIORS, INTERIOR_COLORS,
    FUEL_TYPES, TRANSMISSIONS, ENGINE_SIZES,
    DAMAGE_STATUSES, PART_NAMES, ENGINE_STATUSES,
    DESCRIPTION_TEMPLATES, SELLER_TYPES, JUNKYARD_DESCRIPTIONS
} = require('../data/brands');

// Ağırlıklı rastgele seçim
function weightedRandom(items) {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    for (const item of items) {
        random -= item.weight;
        if (random <= 0) return item;
    }
    return items[items.length - 1];
}

function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Fiyat hesaplama: yıl, km, hasar durumuna göre
function calculatePrice(basePrice, year, km, damageStatus, engineStatus, tier) {
    let price = basePrice;

    const currentYear = 2026;
    const age = currentYear - year;

    // Yıl etkisi: her yıl %5-12 değer kaybı
    const depreciationRate = tier >= 3 ? 0.05 : 0.08;
    price *= Math.pow(1 - depreciationRate, age);

    // KM etkisi: her 10000 km %1-3 düşüş
    const kmFactor = 1 - (km / 1000000) * (tier >= 3 ? 0.15 : 0.25);
    price *= Math.max(kmFactor, 0.3);

    // Hasar etkisi
    const damageMultipliers = {
        'Hasarsız': 1.0,
        'Çizik': 0.92,
        'Boyalı': 0.85,
        'Değişen': 0.75,
        'Hasarlı': 0.60,
        'Pert': 0.25
    };
    price *= damageMultipliers[damageStatus] || 1.0;

    // Motor durumu etkisi
    const engineMultipliers = {
        'Mükemmel': 1.05,
        'İyi': 1.0,
        'Orta': 0.88,
        'Kötü': 0.70,
        'Ölü': 0.30
    };
    price *= engineMultipliers[engineStatus] || 1.0;

    // Rastgele varyasyon (%5-15)
    const variation = 1 + (Math.random() * 0.20 - 0.10);
    price *= variation;

    // Minimum fiyat sınırı (Piyasa ucuz arabasız kalmasın ama çok da sürünmesin)
    return Math.max(Math.round(price), 35000);
}

// Araç parçaları oluştur
function generateParts(damageStatus) {
    const parts = [];
    const partNames = [...PART_NAMES];

    for (const partName of partNames) {
        let status = 'Orijinal';

        if (damageStatus === 'Hasarsız') {
            status = Math.random() < 0.95 ? 'Orijinal' : 'Çizik';
        } else if (damageStatus === 'Çizik') {
            status = Math.random() < 0.7 ? 'Orijinal' : 'Çizik';
        } else if (damageStatus === 'Boyalı') {
            const r = Math.random();
            if (r < 0.5) status = 'Orijinal';
            else if (r < 0.85) status = 'Boyalı';
            else status = 'Çizik';
        } else if (damageStatus === 'Değişen') {
            const r = Math.random();
            if (r < 0.35) status = 'Orijinal';
            else if (r < 0.6) status = 'Boyalı';
            else if (r < 0.85) status = 'Değişen';
            else status = 'Çizik';
        } else if (damageStatus === 'Hasarlı') {
            const r = Math.random();
            if (r < 0.2) status = 'Orijinal';
            else if (r < 0.4) status = 'Boyalı';
            else if (r < 0.65) status = 'Değişen';
            else if (r < 0.85) status = 'Hasarlı';
            else status = 'Çizik';
        }

        // Parça kalitesi: orijinal olmayan parçalar farklı kalitede olabilir
        let quality = 'Orijinal';
        if (status === 'Değişen') {
            const qr = Math.random();
            if (qr < 0.4) quality = 'Orijinal';
            else if (qr < 0.75) quality = 'Yan Sanayi';
            else quality = 'Çıkma';
        }

        parts.push({ name: partName, status, quality });
    }

    return parts;
}

// Motor bilgisi seçimi
function getEngineForModel(tier, prestige) {
    const tierEngines = {
        1: ['1.0', '1.2', '1.3', '1.4', '1.5'],
        2: ['1.4', '1.5', '1.6', '1.8', '2.0'],
        3: ['1.8', '2.0', '2.5', '3.0', '3.5'],
        4: ['3.0', '3.5', '4.0', '4.4', '5.0', '6.0', '6.3', '8.0']
    };
    const engines = tierEngines[tier] || tierEngines[1];
    return randomFrom(engines);
}

function getHorsepowerForEngine(engineSize, tier) {
    const size = parseFloat(engineSize);
    const base = size * 60 + tier * 20;
    return Math.round(base + randomBetween(-15, 30));
}

async function seedDatabase() {
    console.log('🚗 Veritabanı seed işlemi başlıyor...\n');

    try {
        // Önce veritabanının var olduğundan emin ol
        const isConnected = await testConnection();
        if (!isConnected) {
            throw new Error('Veritabanı bağlantısı sağlanamadığı için seed işlemi durduruldu.');
        }

        // Tabloların var olup olmadığını kontrol et
        const [tables] = await pool.query("SHOW TABLES LIKE 'player'");
        if (tables.length === 0) {
            console.log('📝 Tablolar bulunamadı, şema yükleniyor...');
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schemaSql = fs.readFileSync(schemaPath, 'utf8');

            // schema.sql dosyasını çalıştır (multipleStatements: true bağlantı ayarlarında açık olmalı)
            await pool.query(schemaSql);
            console.log('✅ Veritabanı şeması (tablolar) başarıyla oluşturuldu.');
        }

        // Mevcut verileri temizle
        await pool.query('SET FOREIGN_KEY_CHECKS = 0');
        await pool.query('TRUNCATE TABLE car_parts');
        await pool.query('TRUNCATE TABLE offers');
        await pool.query('TRUNCATE TABLE listings');
        await pool.query('TRUNCATE TABLE illegal_mods');
        await pool.query('TRUNCATE TABLE player_cars');
        await pool.query('TRUNCATE TABLE transactions');
        await pool.query('TRUNCATE TABLE favorites');
        await pool.query('TRUNCATE TABLE inspections');
        await pool.query('TRUNCATE TABLE profit_history');
        await pool.query('TRUNCATE TABLE factory_orders');
        await pool.query('TRUNCATE TABLE cars');
        await pool.query('TRUNCATE TABLE models');
        await pool.query('TRUNCATE TABLE brands');
        await pool.query('SET FOREIGN_KEY_CHECKS = 1');

        let totalCars = 0;

        for (const brand of BRANDS) {
            // Marka ekle
            const [brandResult] = await pool.query(
                'INSERT INTO brands (name, country, prestige, logo_emoji, factory_country) VALUES (?, ?, ?, ?, ?)',
                [brand.name, brand.country, brand.prestige, brand.logo, brand.factory || brand.country]
            );
            const brandId = brandResult.insertId;

            console.log(`📦 ${brand.logo} ${brand.name} (Prestij: ${brand.prestige})`);

            for (const model of brand.models) {
                // Model ekle
                const fuelType = model.fuelTypes ? model.fuelTypes[0] : 'Benzin';
                const [modelResult] = await pool.query(
                    'INSERT INTO models (brand_id, name, tier, body_type, base_price, top_speed, torque, fuel_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [brandId, model.name, model.tier, model.body, model.basePrice, model.topSpeed || 180, model.torque || 200, fuelType]
                );
                const modelId = modelResult.insertId;

                // Prestije göre ters orantılı araç oluştur (Düşük prestij çok, lüks nadir)
                const prestigeWeight = Math.max(1, 11 - brand.prestige);
                const diff = brand.prestige <= 3 ? 12 : (brand.prestige <= 6 ? 6 : 3);
                const carCount = randomBetween(prestigeWeight, prestigeWeight + diff);

                for (let i = 0; i < carCount; i++) {
                    const year = randomBetween(2015, 2025);
                    const km = randomBetween(0, 250000);
                    const damage = weightedRandom(DAMAGE_STATUSES);
                    const engineStatus = weightedRandom(ENGINE_STATUSES);
                    const color = randomFrom(COLORS);
                    const fuel = model.fuelTypes ? { type: randomFrom(model.fuelTypes) } : weightedRandom(FUEL_TYPES);
                    const transmission = fuel.type === 'Elektrik' ? { type: 'Otomatik' } : weightedRandom(TRANSMISSIONS);
                    const interior = randomFrom(INTERIORS);
                    const interiorColor = randomFrom(INTERIOR_COLORS);
                    const engineSize = getEngineForModel(model.tier, brand.prestige);
                    const horsepower = getHorsepowerForEngine(engineSize, model.tier);
                    const sellerType = randomFrom(SELLER_TYPES);
                    const description = randomFrom(DESCRIPTION_TEMPLATES);

                    const price = calculatePrice(
                        model.basePrice, year, km,
                        damage.status, engineStatus.status, model.tier
                    );

                    // Hasar detayları
                    let damageDetails = '';
                    if (damage.status !== 'Hasarsız') {
                        const detailParts = PART_NAMES.slice(0, 12);
                        const affectedParts = [];
                        for (const p of detailParts) {
                            if (Math.random() < 0.3) {
                                affectedParts.push(`${p}: ${damage.status}`);
                            }
                        }
                        damageDetails = affectedParts.join(', ') || `Hafif ${damage.status.toLowerCase()} mevcuttur`;
                    }

                    // Motor sağlığı hesapla
                    const motorHealthMap = { 'Mükemmel': randomBetween(90, 100), 'İyi': randomBetween(70, 90), 'Orta': randomBetween(45, 70), 'Kötü': randomBetween(20, 45) };
                    const motorHealth = motorHealthMap[engineStatus.status] || 80;
                    const carAge = 2026 - year;
                    const topSpeed = (model.topSpeed || 180) - Math.floor(carAge * 1.5) - Math.floor((100 - motorHealth) * 0.3);
                    const torque = (model.torque || 200) - Math.floor((100 - motorHealth) * 0.5);

                    // Araç ekle
                    const [carResult] = await pool.query(
                        `INSERT INTO cars (brand_id, model_id, year, km, price, color, fuel_type, transmission, 
                         engine_size, horsepower, top_speed, torque, motor_health, damage_status, damage_details, engine_status, 
                         body_type, interior, interior_color, seller_type, description, cleanliness) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [brandId, modelId, year, km, price, color, fuel.type, transmission.type,
                            engineSize, horsepower, Math.max(topSpeed, 100), Math.max(torque, 50), motorHealth,
                            damage.status, damageDetails, engineStatus.status,
                            model.body, interior, interiorColor, sellerType, description,
                            randomBetween(40, 100)]
                    );
                    const carId = carResult.insertId;

                    // Parçaları ekle
                    const parts = generateParts(damage.status);
                    for (const part of parts) {
                        await pool.query(
                            'INSERT INTO car_parts (car_id, part_name, status) VALUES (?, ?, ?)',
                            [carId, part.name, part.status]
                        );
                    }

                    totalCars++;
                }

                process.stdout.write(`  ├─ ${model.name} (${carCount} araç)\n`);
            }
            console.log('');
        }

        // Hurdalık araçları oluştur
        console.log('\n🔩 Hurdalık araçları oluşturuluyor...');
        let junkyardCount = 0;
        for (let j = 0; j < 30; j++) {
            const brand = randomFrom(BRANDS.filter(b => b.prestige <= 5));
            const model = randomFrom(brand.models);
            const [br] = await pool.query('SELECT id FROM brands WHERE name = ?', [brand.name]);
            if (!br[0]) {
                console.warn(`  ⚠️ Marka bulunamadı: ${brand.name}`);
                continue;
            }
            const [mr] = await pool.query('SELECT id FROM models WHERE name = ? AND brand_id = ?', [model.name, br[0].id]);
            if (!mr[0]) {
                console.warn(`  ⚠️ Model bulunamadı: ${model.name} (Marka: ${brand.name})`);
                continue;
            }
            const year = randomBetween(2000, 2018);
            const km = randomBetween(150000, 500000);
            const engineSize = getEngineForModel(model.tier, brand.prestige);
            const hp = getHorsepowerForEngine(engineSize, model.tier);
            const baseJunkPrice = model.basePrice * 0.08 + randomBetween(-5000, 5000);
            const junkPrice = Math.max(Math.round(baseJunkPrice), 5000);
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
            junkyardCount++;
        }
        console.log(`  🔩 ${junkyardCount} hurdalık aracı oluşturuldu`);

        console.log(`\n✅ Seed tamamlandı! Toplam ${totalCars} pazar + ${junkyardCount} hurdalık aracı oluşturuldu.`);

    } catch (err) {
        console.error('❌ Seed hatası:', err.message);
        throw err;
    }
}


if (require.main === module) {
    seedDatabase()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = {
    seedDatabase,
    randomFrom,
    randomBetween,
    getEngineForModel,
    getHorsepowerForEngine,
    generateParts
};
