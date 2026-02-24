// Marketteki trendleri ve krizleri yöneten servis
const { pool } = require('../db/connection');

const TREND_TEMPLATES = [
    { name: 'Ekonomik Büyüme', type: 'boom', multiplier: 1.15, effect: 'Fiyatlar artıyor!', description: 'Piyasa canlanıyor, araç değerleri yükselişte.', affected_type: null },
    { name: 'Piyasa Durgunluğu', type: 'recession', multiplier: 0.90, effect: 'Fiyatlar düşüyor!', description: 'Alım gücü düştü, fiyatlar geriliyor.', affected_type: null },
    { name: 'Akaryakıt Krizi', type: 'fuel_crisis', multiplier: 0.85, effect: 'Dizel/Benzin araçlar ucuzluyor!', description: 'Yakıt fiyatları uçtu, elektrikli ve hibrit araçlara talep arttı.', affected_type: 'Benzin' },
    { name: 'ÖTV İndirimi', type: 'tax_cut', multiplier: 0.95, effect: 'Sıfır araçlar ucuzladı!', description: 'Hükümet vergi indirimi yaptı, piyasa hareketlendi.', affected_type: null },
    { name: 'Döviz Artışı', type: 'currency_spike', multiplier: 1.25, effect: 'Her şey çok pahalılaştı!', description: 'Dolar fırladı, araç fiyatları anında güncellendi.', affected_type: null },
    { name: 'Bahar Kampanyası', type: 'campaign', multiplier: 1.05, effect: 'Küçük artış', description: 'Bahar geldi, araç piyasası hareketli.', affected_type: 'Cabrio' },
    { name: 'Çip Krizi', type: 'chip_shortage', multiplier: 1.30, effect: 'Sıfır araç yok, 2. el uçtu!', description: 'Fabrikalar çip bulamıyor, ikinci el fiyatları sıfırı geçti!', affected_type: null },
    { name: 'Lüks Araç Vergisi', type: 'luxury_tax', multiplier: 0.80, effect: 'Lüks araçlar elde kalıyor.', description: 'Lüks segmentteki vergi artışı satışları bıçak gibi kesti.', affected_type: 'Lüks' },
    { name: 'İkinci El Fırsatı', type: 'used_car_boom', multiplier: 1.10, effect: '2. el araçlar değerlendi!', description: 'İnsanlar sıfır araç alamayınca ikinci ele yöneldi, fiyatlar tırmanıyor.', affected_type: null },
    { name: 'SUV Çılgınlığı', type: 'suv_craze', multiplier: 1.20, effect: 'SUV araçlara büyük talep var!', description: 'Herkes yüksek araç istiyor, SUV ve crossover fiyatları fırladı.', affected_type: 'SUV' },
    { name: 'Elektrik Gelişimi', type: 'ev_trend', multiplier: 1.15, effect: 'Elektrikli araçlar değerlendi!', description: 'Yeni şarj istasyonları kuruldu, elektrikli araçlara hücum var.', affected_type: 'Elektrik' }
];

async function generateNewTrend(isForced = false) {
    try {
        // Otomatik trendler kapalıysa ve zorlanmamışsa (admin değilse) çık
        if (!isForced) {
            const [settings] = await pool.query('SELECT setting_value FROM system_settings WHERE setting_key = "auto_trends_enabled"');
            const enabled = settings.length > 0 ? settings[0].setting_value === '1' : true; // Varsayılan açık
            if (!enabled) return;

            // %50 şansla pas geç (piyasa normal kalsın)
            if (Math.random() < 0.5) {
                await pool.query('UPDATE market_trends SET is_active = 0 WHERE is_active = 1');
                console.log('[Trend] Piyasa normale (Normal) dönmesi için pas geçildi.');
                return;
            }
        }

        const template = TREND_TEMPLATES[Math.floor(Math.random() * TREND_TEMPLATES.length)];

        // Trends should last between 12-48 real hours
        const durationHours = Math.floor(Math.random() * (48 - 12 + 1)) + 12;
        const endDate = new Date();
        endDate.setHours(endDate.getHours() + durationHours);

        // Eski trendleri pasif yap
        await pool.query('UPDATE market_trends SET is_active = 0 WHERE is_active = 1');

        // Yeni trend ekle
        await pool.query(
            'INSERT INTO market_trends (name, type, multiplier, effect, description, expires_at, is_active, affected_type) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
            [template.name, template.type, template.multiplier, template.effect, template.description, endDate, template.affected_type]
        );

        console.log(`[Trend] Yeni trend oluşturuldu: ${template.name} (${durationHours} saat)`);
    } catch (err) {
        console.error('[Trend] Hata:', err);
    }
}

async function getActiveTrend() {
    const [rows] = await pool.query('SELECT * FROM market_trends WHERE is_active = 1 AND (expires_at > NOW() OR expires_at IS NULL)');
    return rows.length > 0 ? rows[0] : null;
}

async function activateSpecificTrend(trendIndex, durationHours = 24) {
    try {
        const template = TREND_TEMPLATES[trendIndex];
        if (!template) throw new Error("Trend bulunamadı");

        // Özel süreli manuel trend
        durationHours = Number(durationHours) || 24;
        const endDate = new Date();
        endDate.setHours(endDate.getHours() + durationHours);

        await pool.query('UPDATE market_trends SET is_active = 0 WHERE is_active = 1');

        await pool.query(
            'INSERT INTO market_trends (name, type, multiplier, effect, description, expires_at, is_active, affected_type) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
            [template.name, template.type, template.multiplier, template.effect, template.description, endDate, template.affected_type]
        );
        console.log(`[Admin] Manuel Trend Başlatıldı: ${template.name}`);
    } catch (err) {
        console.error('[Trend] Manuel Aktivasyon Hatası:', err);
    }
}

async function stopActiveTrend() {
    try {
        await pool.query('UPDATE market_trends SET is_active = 0 WHERE is_active = 1');
        console.log(`[Admin] Aktif Trend Manuel Olarak Sonlandırıldı.`);
    } catch (err) {
        console.error('[Trend] İptal Hatası:', err);
    }
}

module.exports = {
    generateNewTrend,
    getActiveTrend,
    activateSpecificTrend,
    stopActiveTrend,
    TREND_TEMPLATES
};
