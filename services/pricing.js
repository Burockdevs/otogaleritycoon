const { pool } = require('../db/connection');

// Piyasa değeri hesaplama
async function calculateMarketValue(carId) {
    try {
        const [cars] = await pool.query(
            `SELECT c.*, b.prestige, m.base_price, m.tier, m.popularity_multiplier 
             FROM cars c 
             JOIN brands b ON c.brand_id = b.id 
             JOIN models m ON c.model_id = m.id 
             WHERE c.id = ?`, [carId]
        );

        if (cars.length === 0) return null;
        const car = cars[0];

        // Aynı marka + model araçların ortalama fiyatı
        const [similarCars] = await pool.query(
            `SELECT AVG(price) as avg_price, MIN(price) as min_price, MAX(price) as max_price, COUNT(*) as count
             FROM cars 
             WHERE model_id = ? AND is_available = 1 AND id != ?`,
            [car.model_id, carId]
        );

        // Aynı marka + model + yıl
        const [sameYearCars] = await pool.query(
            `SELECT AVG(price) as avg_price, COUNT(*) as count
             FROM cars 
             WHERE model_id = ? AND year = ? AND is_available = 1 AND id != ?`,
            [car.model_id, car.year, carId]
        );

        let marketValue;
        let baseAnchor = car.base_price || car.price;

        if (sameYearCars[0].count > 0) {
            let avgPrice = sameYearCars[0].avg_price * 0.7 + similarCars[0].avg_price * 0.3;
            // Anti-inflation cap: max 50% above base price
            if (avgPrice > baseAnchor * 1.5) avgPrice = baseAnchor * 1.5;
            // Anti-deflation cap: min 50% below base price
            if (avgPrice < baseAnchor * 0.5) avgPrice = baseAnchor * 0.5;
            marketValue = baseAnchor * 0.6 + avgPrice * 0.4;
        } else if (similarCars[0].count > 0) {
            let avgPrice = similarCars[0].avg_price;
            if (avgPrice > baseAnchor * 1.5) avgPrice = baseAnchor * 1.5;
            if (avgPrice < baseAnchor * 0.5) avgPrice = baseAnchor * 0.5;
            marketValue = baseAnchor * 0.6 + avgPrice * 0.4;
        } else {
            marketValue = baseAnchor;
        }

        // Hasar durumuna göre değer ayarlama
        const damageFactors = {
            'Hasarsız': 1.05,
            'Çizik': 0.95,
            'Boyalı': 0.88,
            'Değişen': 0.78,
            'Hasarlı': 0.65
        };

        const engineFactors = {
            'Mükemmel': 1.05,
            'İyi': 1.0,
            'Orta': 0.90,
            'Kötü': 0.75
        };

        marketValue *= (damageFactors[car.damage_status] || 1);
        marketValue *= (engineFactors[car.engine_status] || 1);

        // KM etkisi
        const avgKm = 100000;
        if (car.km < avgKm) {
            marketValue *= 1 + ((avgKm - car.km) / avgKm) * 0.1;
        } else {
            marketValue *= 1 - ((car.km - avgKm) / avgKm) * 0.15;
        }

        // Temizlik etkisi
        if (car.cleanliness < 50) {
            marketValue *= 0.95;
        } else if (car.cleanliness >= 90) {
            marketValue *= 1.03;
        }

        // Popülarite (Talep) Çarpanı Etkisi
        marketValue *= parseFloat(car.popularity_multiplier || 1.00);

        // Piyasada Bulunma Sıklığı (Scarcity) Etkisi
        const scarcityCount = similarCars[0].count;
        let scarcityMultiplier = 1.0;
        if (scarcityCount === 0) scarcityMultiplier = 1.25;      // Eşsiz
        else if (scarcityCount <= 2) scarcityMultiplier = 1.15;  // Çok Nadir
        else if (scarcityCount <= 5) scarcityMultiplier = 1.05;  // Nadir
        else if (scarcityCount >= 20) scarcityMultiplier = 0.90; // Çok bol
        else if (scarcityCount >= 10) scarcityMultiplier = 0.95; // Bol

        marketValue *= scarcityMultiplier;

        // --- PROFIT MARGIN CAP ---
        // Prevents outrageous margins by clamping the total compounded multipliers
        const maxAllowedValue = baseAnchor * 2.0;
        if (marketValue > maxAllowedValue) {
            marketValue = maxAllowedValue;
        }

        marketValue = Math.round(marketValue);

        const suggestedPrice = Math.round(marketValue * 1.10);

        const priceDiff = ((car.price - marketValue) / marketValue) * 100;
        let assessment;
        if (priceDiff < -15) assessment = 'Çok Uygun';
        else if (priceDiff < -5) assessment = 'Uygun';
        else if (priceDiff < 5) assessment = 'Piyasa Değerinde';
        else if (priceDiff < 15) assessment = 'Pahalı';
        else assessment = 'Çok Pahalı';

        return {
            carId,
            marketValue,
            suggestedPrice,
            currentPrice: car.price,
            priceDifference: priceDiff.toFixed(1),
            assessment,
            similarCount: similarCars[0].count,
            avgPrice: Math.round(similarCars[0].avg_price || car.price),
            minPrice: Math.round(similarCars[0].min_price || car.price),
            maxPrice: Math.round(similarCars[0].max_price || car.price)
        };
    } catch (err) {
        console.error('Piyasa değeri hesaplama hatası:', err);
        return null;
    }
}

// Teklif süresi hesaplama (ms cinsinden)
function getOfferInterval(price, popularityMultiplier = 1.00) {
    let baseInterval = 30000;
    if (price <= 100000) baseInterval = 30000;        // 30sn
    else if (price <= 500000) baseInterval = 45000;   // 45sn
    else if (price <= 1000000) baseInterval = 60000;  // 1dk
    else if (price <= 5000000) baseInterval = 90000;  // 1.5dk
    else baseInterval = 120000;                       // 2dk

    // Yüksek popülarite = Daha hızlı teklif (Düşük bekleme süresi)
    // Örn popülerlik 2.00 ise yarı zamanına düşer. Diskalifiyeden popülerliği 0.5 ise iki katına çıkar.
    const finalInterval = baseInterval / parseFloat(popularityMultiplier);

    // Teklifin saniyesi çok da kısalarak spam yapmasın diye bir sınır (min 15sn, max 3dk)
    return Math.min(Math.max(finalInterval, 10000), 240000);
}

// Teklif fiyatı ve mesajı oluşturma (piyasa değerine göre gerçekçi)
async function generateOfferPrice(askingPrice, marketValue, npcType, carData, playerId, wealthLevel = 1, playerBuyPrice = 0) {
    let minPercent, maxPercent;
    let messages = [];

    const { calculateStaffBonuses } = require('./staffService');
    const { getActiveTrend } = require('./trendService');

    // Personel Bonusları
    const staffBonuses = await calculateStaffBonuses(playerId);
    const trend = await getActiveTrend();

    // Temel: piyasa değerine göre oranlar
    switch (npcType) {
        case 'pazarlikci':
            minPercent = 0.55;
            maxPercent = 0.75;
            messages = [
                "Fiyat biraz yüksek geldi, pazarlık sünnettir.",
                "Bu paraya daha iyi araç bulurum ama son teklifimi vereyim.",
                "Çok düşünmem lazım ama bu kadar verebilirim.",
                "Kardeşim bu fiyata olmaz, en fazla bu kadar.",
                "İnternette benzerini daha ucuza gördüm, şu kadar verebilirim.",
                "Bir düşüneyim dedim ama bu teklifimi değerlendirin."
            ];
            break;
        case 'comert':
            minPercent = 0.95;
            maxPercent = 1.10;
            messages = [
                "Aracı çok beğendim, hakkını verelim.",
                "Tam aradığım araç, fiyatını konuşalım.",
                "Oğluma hediye alacağım, güzel araç.",
                "Eşim çok beğendi, hemen alalım.",
                "Kaliteli araç, parasını hak ediyor.",
                "Uzun süredir böyle bir araç arıyordum, teklifimi sunuyorum."
            ];
            break;
        default: // normal
            minPercent = 0.82;
            maxPercent = 0.95;
            messages = [
                "Ciddi alıcıyım, makul bir teklif sunuyorum.",
                "Arkadaşın arabasına bakıyorum, fiyatı uygunsa alırım.",
                "Bu araç ihtiyacıma uygun, bir bakalım.",
                "Piyasayı araştırdım, bu teklifim.",
                "Aracı inceledim, bu kadar verebilirim.",
                "Komisyoncu arkadaş önerdi, teklifimi iletiyorum."
            ];
    }

    // Zenginlik seviyesine göre teklif aralığı artırma
    switch (wealthLevel) {
        case 2: // Orta
            minPercent += 0.01;
            maxPercent += 0.01;
            break;
        case 3: // Zengin
            minPercent += 0.02;
            maxPercent += 0.03;
            break;
        case 4: // Milyoner
            minPercent += 0.03;
            maxPercent += 0.05;
            break;
    }

    // Satış Danışmanı Bonusu (Fiyatı yukarı çeker)
    minPercent *= staffBonuses.salesMultiplier;
    maxPercent *= staffBonuses.salesMultiplier;

    // Trend Bonusu
    if (trend && carData) {
        if (carData.body_type === trend.affected_type || carData.fuel_type === trend.affected_type) {
            minPercent *= trend.multiplier;
            maxPercent *= trend.multiplier;
            messages = [
                `${trend.event_name} nedeniyle bu araca olan talebim çok yüksek!`,
                `${trend.event_name} yüzünden bu tip araçlar çok aranan, teklifimi buna göre yapıyorum.`,
                `Piyasada ${trend.event_name} etkisi var, bu araç tam zamanında geldi!`
            ];
        }
    }

    // Araç durumuna göre düzeltme
    if (carData) {
        if (carData.km > 200000) {
            minPercent -= 0.04;
            maxPercent -= 0.04;
        } else if (carData.km > 100000) {
            minPercent -= 0.02;
            maxPercent -= 0.02;
        } else if (carData.km < 30000) {
            minPercent += 0.03;
            maxPercent += 0.03;
        } else if (carData.km < 50000) {
            minPercent += 0.02;
            maxPercent += 0.02;
        }

        if (carData.engine_status === 'Mükemmel') {
            minPercent += 0.03;
            maxPercent += 0.02;
        } else if (carData.engine_status === 'İyi') {
            minPercent += 0.01;
        } else if (carData.engine_status === 'Kötü') {
            minPercent -= 0.08;
            maxPercent -= 0.06;
        } else if (carData.engine_status === 'Ölü') {
            minPercent -= 0.15;
            maxPercent -= 0.12;
        }

        if (carData.damage_status === 'Hasarsız') {
            minPercent += 0.02;
        } else if (carData.damage_status === 'Hasarlı' || carData.damage_status === 'Pert') {
            minPercent -= 0.10;
            maxPercent -= 0.08;
        }
    }

    // İlan fiyatı piyasa değerine göre ayarlama
    const priceRatio = askingPrice / marketValue;
    if (priceRatio < 0.85) {
        // Çok ucuza koymuş — teklifler yükselsin
        minPercent += 0.08;
        maxPercent += 0.10;
    } else if (priceRatio > 1.3) {
        // Çok pahalıya koymuş — teklifler düşsün
        minPercent -= 0.08;
        maxPercent -= 0.10;
    } else if (priceRatio > 1.15) {
        minPercent -= 0.04;
        maxPercent -= 0.05;
    }

    // Clamp
    minPercent = Math.max(0.40, minPercent);
    maxPercent = Math.max(minPercent + 0.05, maxPercent);

    const percent = minPercent + Math.random() * (maxPercent - minPercent);
    // Hard Cap: Hiçbir teklif piyasa değerinin %105'ini geçemez (Gelecek güncellemelerle dengelenebilir)
    const cappedPercent = Math.min(percent, 1.05);

    // Teklif piyasa değerine göre hesaplanır
    let offerPrice = Math.round(marketValue * cappedPercent);
    const message = messages[Math.floor(Math.random() * messages.length)];

    // Şahsi Yatırım Kâr Sınırı: Bir teklif oyuncunun toplam yatırımının (alış + tamir masrafları) en fazla %25'i kadar kârlı olabilir
    if (playerBuyPrice > 0) {
        const maxInvestedOffer = Math.round(playerBuyPrice * 1.45);
        if (offerPrice > maxInvestedOffer) {
            // Tam olarak hep aynı sayı çıkmasın diye %0 ile %5 arası ufak bir varyasyon (aşağı yönlü) uyguluyoruz
            const variance = 1.00 - (Math.random() * 0.05);
            offerPrice = Math.round(maxInvestedOffer * variance);
        }
    }

    return {
        price: offerPrice,
        message: message
    };
}

// Üst satış fiyatı (Ekspertiz/Appraisal)
async function calculateAppraisalValue(marketValue, condition, playerId) {
    const { pool } = require('../db/connection');
    const [player] = await pool.query('SELECT reputation, gallery_floor_level FROM player WHERE id = ?', [playerId]);
    const reputation = player[0]?.reputation || 50;

    // İtibar ve galeri kalitesi fiyatı %5 - %10 daha yukarı çekebilir
    const reputationBonus = (reputation - 50) / 500; // -0.1 to +0.1
    const galleryBonus = (player[0]?.gallery_floor_level || 1) * 0.02;

    const premium = 1.1 + (condition === 'Mükemmel' ? 0.15 : 0.05) + reputationBonus + galleryBonus;
    return Math.round(marketValue * premium);
}

// Pazarlık kabul olasılığı (%)
function calculateAcceptanceProbability(offerPrice, listingPrice, marketValue) {
    if (offerPrice >= listingPrice) return 100;
    if (offerPrice >= marketValue * 0.95) return 92;

    const ratioMarket = offerPrice / marketValue;
    if (ratioMarket < 0.65) return 0;

    // Yüzde hesabı: %65'te %0, %95'te %92
    // Formül: (Teklif/Piyasa - 0.65) / (0.95 - 0.65) * 92
    let prob = (ratioMarket - 0.65) / 0.30 * 92;

    // Satıcı çok pahalıya koyduysa piyasa değerine yakın teklife daha sıcak bakar
    if (listingPrice > marketValue * 1.3) prob += 5;

    return Math.round(Math.max(0, Math.min(95, prob)));
}

// Expertiz ücreti hesaplama
function calculateInspectionCost(carPrice) {
    // Aracın fiyatının %1-2'si arası
    const rate = 0.01 + Math.random() * 0.01;
    const cost = Math.round(carPrice * rate);
    return Math.max(cost, 500); // Minimum 500₺
}

// Tamir ücreti hesaplama (Güncellenmiş: daha pahalı tamir maliyetleri)
function calculateRepairCost(partStatus, carPrice) {
    let baseCost = carPrice * 0.04;
    const statusMultipliers = { 'Hasarlı': 2.5, 'Değişen': 1.8, 'Boyalı': 1.2, 'Çizik': 0.7 };
    baseCost *= (statusMultipliers[partStatus] || 1);
    return Math.round(Math.max(baseCost * 1.5, 2000));
}

// Motor Yenileme Ücreti (Sağlık ve Piyasa Değerine Göre)
function calculateMotorRepairCost(carPrice, motorHealth) {
    const healthLost = 100 - motorHealth;
    // Maksimum maliyet (sağlık 0 ise) araç fiyatının %30'u olsun
    const maxCost = carPrice * 0.30;
    const cost = maxCost * (healthLost / 100);
    return Math.round(Math.max(cost, 2000));
}

// Tamir sonrası değer artışı (Güncellenmiş: tamirli aracın değeri daha çok artar)
function calculateRepairValueIncrease(carPrice, oldStatus) {
    let increase = 0;

    const statusValues = {
        'Hasarlı': 0.15, // Eskiden 0.35'ti. (Maliyet ~0.10, Kâr %5'e düştü)
        'Değişen': 0.08, // Eskiden 0.22'di. (Maliyet ~0.07, Kâr %1'e düştü)
        'Boyalı': 0.05,  // Eskiden 0.14'tü. (Maliyet ~0.05, Kâr %0'a yakın)
        'Çizik': 0.03    // Eskiden 0.07'ydi. (Maliyet ~0.03, Kâr %0'a yakın)
    };

    increase = carPrice * (statusValues[oldStatus] || 0.05);
    return Math.round(increase);
}

// Boyama ücreti hesaplama
function calculatePaintCost(carPrice, isLansomanColor) {
    let cost = carPrice * 0.03; // %3
    if (isLansomanColor) cost *= 1.5; // Lansoman rengi daha pahalı
    return Math.round(Math.max(cost, 2000));
}

// Boyama sonrası değer artışı (Güncellenmiş: boyama daha değerli)
function calculatePaintValueIncrease(carPrice, isLansomanColor) {
    let increase = carPrice * 0.04; // Eskiden 0.08'di
    if (isLansomanColor) increase *= 1.5; // Eskiden 2.0'dı
    return Math.round(increase);
}

// Yıkama ücreti
function calculateWashCost(carPrice) {
    return Math.round(Math.max(carPrice * 0.003, 250));
}

// Pazarlık cevabı - satıcı kabul eder mi?
function evaluateBargain(offerPrice, listedPrice, marketValue, npcType = 'normal') {
    // İstenen fiyata (veya fazlasına) direkt kabul et
    if (offerPrice >= listedPrice) {
        return { accepted: true, finalPrice: listedPrice, message: 'Bu fiyata anlaştık, hayırlı olsun!' };
    }

    // Teklifi SATIŞ FİYATINA göre değerlendir (piyasa değerine değil)
    const offerRatio = offerPrice / listedPrice;

    // NPC tipine göre tolerans ayarları
    let minRatio = 0.65; // Baz
    let autoAcceptRatio = 0.95; // Baz
    let hardRejectMsg = 'Bu teklif çok düşük! Ciddi olun lütfen.';
    let acceptMsg = 'Teklif kabul edildi!';
    let waitMsg = 'Tamam, anlaştık!';

    if (npcType === 'pazarlikci') { // Daha inatçı
        minRatio = 0.72;
        autoAcceptRatio = 0.98;
        hardRejectMsg = 'Bu fiyata vermem mümkün değil. Ölücü olmayın!';
    } else if (npcType === 'comert') { // Daha cömert
        minRatio = 0.58;
        autoAcceptRatio = 0.90;
        acceptMsg = 'Hadi kıramadım sizi, hayırlı olsun!';
    }

    // Çok düşük teklifler direkt red
    if (offerRatio < minRatio) {
        return { accepted: false, counterOffer: null, message: hardRejectMsg };
    }

    // Otomatik kabul eşiği
    if (offerRatio >= autoAcceptRatio) {
        return { accepted: true, finalPrice: offerPrice, message: acceptMsg };
    }

    // minRatio ile autoAcceptRatio arası - olasılıkla kabul
    const chanceBase = minRatio;
    const chanceRange = autoAcceptRatio - chanceBase;

    if (offerRatio >= chanceBase) {
        let acceptChance = (offerRatio - chanceBase) / chanceRange;

        // Cömertler daha kolay kabul eder
        if (npcType === 'comert') acceptChance *= 1.2;
        // Pazarlıkçılar daha zor
        if (npcType === 'pazarlikci') acceptChance *= 0.8;

        if (Math.random() < acceptChance) {
            return { accepted: true, finalPrice: offerPrice, message: waitMsg };
        }

        // Karşı teklif - listedPrice'ı geçmemeli
        let priceTarget = listedPrice;
        if (npcType === 'pazarlikci') priceTarget = listedPrice * 0.98;
        if (npcType === 'comert') priceTarget = listedPrice * 0.92;

        const counter = Math.min(listedPrice, Math.round(offerPrice + (priceTarget - offerPrice) * (0.4 + Math.random() * 0.3)));

        const counterMessages = [
            `En düşük ${counter.toLocaleString('tr-TR')}₺'ye veririm.`,
            `${counter.toLocaleString('tr-TR')}₺ altına inmem imkansız.`,
            `Ciddi alıcıysanız ${counter.toLocaleString('tr-TR')}₺ yapalım.`
        ];

        return { accepted: false, counterOffer: counter, message: counterMessages[Math.floor(Math.random() * counterMessages.length)] };
    }

    // Red ama karşı teklif
    const counterRatio = npcType === 'pazarlikci' ? 0.95 : (npcType === 'comert' ? 0.85 : 0.90);
    const counter = Math.min(listedPrice, Math.round(listedPrice * (counterRatio + Math.random() * 0.05)));
    return { accepted: false, counterOffer: counter, message: `Bu fiyata olmaz. ${counter.toLocaleString('tr-TR')}₺'den aşağı düşmem.` };
}

// Kredi limiti hesaplama
function calculateLoanLimit(level, hasGallery) {
    let baseLimit = 30000;
    baseLimit += level * 5000;
    if (hasGallery) baseLimit *= 1.5;
    if (level >= 10) baseLimit *= 1.5;
    if (level >= 20) baseLimit *= 1.5;
    if (level >= 30) baseLimit *= 1.5;
    if (level >= 40) baseLimit *= 1.5;
    if (level >= 50) baseLimit *= 1.5;
    if (level >= 60) baseLimit *= 1.5;
    return Math.round(baseLimit);
}

// Faiz oranı hesaplama
function calculateInterestRate(level) {
    // Seviye arttıkça faiz düşer
    let rate = 2.5; // %2.5 baz
    rate -= level * 0.03;

    // Sistem faiz kararı (Merkez Bankası Faizi)
    const modifier = global.bankInterestModifier || 0;
    rate += modifier;

    return Math.max(rate, 0.3); // Minimum %0.3
}

module.exports = {
    calculateMarketValue,
    evaluateBargain,
    getOfferInterval,
    generateOfferPrice,
    calculateInspectionCost,
    calculateRepairCost,
    calculateRepairValueIncrease,
    calculatePaintCost,
    calculatePaintValueIncrease,
    calculateWashCost,
    calculateMotorRepairCost,
    calculateLoanLimit,
    calculateInterestRate,
    calculateAppraisalValue
};
