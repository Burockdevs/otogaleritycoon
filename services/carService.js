const {
    COLORS, INTERIORS, INTERIOR_COLORS,
    FUEL_TYPES, TRANSMISSIONS,
    DAMAGE_STATUSES, PART_NAMES, ENGINE_STATUSES,
    DESCRIPTION_TEMPLATES, SELLER_TYPES
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

// Dinamik açıklama oluştur
function generateDynamicDescription(car, modelName, brandName) {
    const templates = [
        `${car.year} model ${brandName} ${modelName}, sadece ${car.km.toLocaleString('tr-TR')} km'de.`,
        `${car.damage_status} durumda, ${car.engine_status} motor performansına sahip bir araç.`,
        "Bakımları yeni yapıldı, masrafsız binilecek bir araçtır.",
        car.km < 50000 ? "Adeta bayiden çıktığı gibi duruyor." : "Yorulmamış, diri bir araçtır.",
        car.damage_status === 'Hasarsız' ? "Hatasız boyasız arayanlar için kaçırılmayacak fırsat." : "Ufak tefek kozmetik kusurları olsa da mekanik olarak kusursuzdur."
    ];

    // Rastgele 2-3 cümleyi birleştir
    const shuffled = templates.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, randomBetween(2, 3)).join(' ');
}

// Fiyat hesaplama (Basitleştirilmiş seed mantığı)
function calculatePrice(basePrice, year, km, damageStatus, engineStatus, tier) {
    let price = basePrice;
    const currentYear = 2026;
    const age = currentYear - year;
    const depreciationRate = tier >= 3 ? 0.05 : 0.08;
    price *= Math.pow(1 - depreciationRate, age);
    const kmFactor = 1 - (km / 1000000) * (tier >= 3 ? 0.15 : 0.25);
    price *= Math.max(kmFactor, 0.3);

    const damageMultipliers = { 'Hasarsız': 1.0, 'Çizik': 0.92, 'Boyalı': 0.85, 'Değişen': 0.75, 'Hasarlı': 0.60, 'Pert': 0.25 };
    price *= damageMultipliers[damageStatus] || 1.0;

    const engineMultipliers = { 'Mükemmel': 1.05, 'İyi': 1.0, 'Orta': 0.88, 'Kötü': 0.70, 'Ölü': 0.30 };
    price *= engineMultipliers[engineStatus] || 1.0;

    price *= (1 + (Math.random() * 0.20 - 0.10));
    return Math.round(price);
}

module.exports = {
    weightedRandom,
    randomFrom,
    randomBetween,
    generateParts,
    generateDynamicDescription,
    calculatePrice
};
