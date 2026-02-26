const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const {
    calculateMarketValue, calculateInspectionCost, calculateRepairCost,
    calculateRepairValueIncrease, calculatePaintCost, calculatePaintValueIncrease,
    calculateWashCost, calculateMotorRepairCost, calculateLoanLimit, calculateInterestRate
} = require('../services/pricing');
const { ILLEGAL_MODS, MECHANIC_TYPES } = require('../data/brands');
const { checkLevelUp } = require('../services/levelUp');
const { getIO } = require('../services/gameLoop');

// Helper: oyuncu bilgilerini getir
async function getPlayer(pid) {
    const [p] = await pool.query(
        'SELECT id, username, name, balance, level, xp, xp_needed, prestige_score, total_sales, total_buys, total_profit, total_loss, has_gallery, gallery_name, max_car_slots, has_factory_deal, personal_car_id, risk_level, loan_amount, loan_remaining, loan_monthly_payment, loan_months_left, loan_missed_payments, is_seized, theme, avatar, reputation, review_count, gallery_floor_level, gallery_lighting_level, can_custom_build, (SELECT COUNT(*) FROM player_cars WHERE player_id = ?) as car_count FROM player WHERE id = ?',
        [pid, pid]
    );
    return p[0] || null;
}

// =================== OYUNCU BİLGİLERİ ===================
router.get('/info', async (req, res) => {
    try {
        const p = await getPlayer(req.playerId);
        if (!p) return res.status(404).json({ success: false, error: 'Oyuncu bulunamadı' });
        res.json({ success: true, data: p });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== İŞLETME YORUMLARI ===================
router.get('/business-reviews', async (req, res) => {
    try {
        const [reviews] = await pool.query(
            'SELECT * FROM business_reviews WHERE player_id = ? ORDER BY created_at DESC LIMIT 50',
            [req.playerId]
        );
        res.json({ success: true, data: reviews });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== ARAÇLARIM ===================
router.get('/cars', async (req, res) => {
    try {
        const pid = req.playerId;
        const [cars] = await pool.query(
            `SELECT pc.*, pc.id as player_car_id, c.*,
                    b.name as brand_name, b.logo_emoji, b.prestige,
                    m.name as model_name, m.tier, m.body_type as m_body_type,
                    IF(p.personal_car_id = pc.id, 1, 0) as is_personal,
                    (SELECT COUNT(*) FROM listings l WHERE l.player_car_id = pc.id AND l.status = 'active') as has_listing
             FROM player_cars pc
             JOIN cars c ON pc.car_id = c.id
             JOIN brands b ON c.brand_id = b.id
             JOIN models m ON c.model_id = m.id
             JOIN player p ON pc.player_id = p.id
             WHERE pc.player_id = ?
             ORDER BY pc.created_at DESC`, [pid]
        );
        res.json({ success: true, data: cars });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== KİŞİSEL ARAÇ ===================
router.post('/personal-car/:playerCarId', async (req, res) => {
    try {
        const pid = req.playerId;
        const pcId = parseInt(req.params.playerCarId);

        // İlan kontrolü
        const [listing] = await pool.query('SELECT id FROM listings WHERE player_car_id = ? AND status = "active"', [pcId]);
        if (listing.length > 0) return res.json({ success: false, error: 'İlandaki aracı kişisel araç yapamazsınız.' });

        const [pCars] = await pool.query('SELECT * FROM player_cars WHERE id = ? AND player_id = ?', [pcId, pid]);
        if (pCars.length === 0) return res.json({ success: false, error: 'Araç bulunamadı' });

        const [current] = await pool.query('SELECT personal_car_id FROM player WHERE id = ?', [pid]);
        if (current[0].personal_car_id === pcId) {
            await pool.query('UPDATE player SET personal_car_id = NULL WHERE id = ?', [pid]);
            return res.json({ success: true, message: 'Kişisel araç kaldırıldı' });
        }

        await pool.query('UPDATE player SET personal_car_id = ? WHERE id = ?', [pcId, pid]);
        res.json({ success: true, message: 'Kişisel araç atandı! ⭐' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== GALERİ SATIN AL ===================
router.post('/buy-gallery', async (req, res) => {
    try {
        const pid = req.playerId;
        const p = await getPlayer(pid);
        if (p.has_gallery) return res.json({ success: false, error: 'Zaten galeriniz var' });
        if (p.level < 10) return res.json({ success: false, error: 'Minimum seviye 10 gerekli!' });
        if (p.balance < 500000) return res.json({ success: false, error: 'Yetersiz bakiye! (500.000₺ gerekli)' });

        await pool.query('UPDATE player SET has_gallery=1, balance=balance-500000, max_car_slots=20 WHERE id=?', [pid]);
        await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"buy",500000,"Galeri açıldı")', [pid]);
        await pool.query('INSERT INTO profit_history (player_id,type,amount,description) VALUES (?,"expense",500000,"Galeri yatırımı")', [pid]);

        // Başarım kontrolü (async, hata yoksay)
        setTimeout(() => checkAndUnlockAchievements(pid).catch(() => { }), 100);

        res.json({ success: true, message: 'Galeri açıldı! <i class="fa-solid fa-building"></i> Artık 20 araç slotunuz var!', player: await getPlayer(pid) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== AVATAR GÜNCELLE ===================
router.post('/update-avatar', async (req, res) => {
    try {
        const { avatar } = req.body;
        if (!avatar) return res.json({ success: false, error: 'Avatar seçilmedi' });

        await pool.query('UPDATE player SET avatar = ? WHERE id = ?', [avatar, req.playerId]);
        res.json({ success: true, message: 'Avatar güncellendi! <i class="fa-solid fa-user"></i>', avatar });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== FABRİKA ANLAŞMASI ===================
router.post('/factory-deal', async (req, res) => {
    try {
        const pid = req.playerId;
        const p = await getPlayer(pid);
        if (p.has_factory_deal) return res.json({ success: false, error: 'Zaten fabrika anlaşmanız var' });
        if (p.level < 25) return res.json({ success: false, error: 'Minimum seviye 25 gerekli!' });
        if (p.balance < 2000000) return res.json({ success: false, error: 'Yetersiz bakiye! (2.000.000₺ gerekli)' });

        await pool.query('UPDATE player SET has_factory_deal=1, balance=balance-2000000 WHERE id=?', [pid]);
        await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"buy",2000000,"Fabrika anlaşması")', [pid]);
        await pool.query('INSERT INTO profit_history (player_id,type,amount,description) VALUES (?,"expense",2000000,"Fabrika anlaşması yatırımı")', [pid]);

        // Başarım kontrolü (async, hata yoksay)
        setTimeout(() => checkAndUnlockAchievements(pid).catch(() => { }), 100);

        res.json({ success: true, message: 'Fabrika anlaşması yapıldı! <i class="fa-solid fa-industry"></i>', player: await getPlayer(pid) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== FABRİKA SATIN ALMA (nakliye + vergi + taksit) ===================
router.post('/factory-buy', async (req, res) => {
    try {
        const pid = req.playerId;
        const { model_id, year, installments } = req.body;
        const p = await getPlayer(pid);

        if (!p.has_factory_deal) return res.json({ success: false, error: 'Fabrika anlaşmanız yok!' });
        if (p.is_seized) return res.json({ success: false, error: 'Hesabınız hacizli!' });

        const [models] = await pool.query(
            'SELECT m.*, b.name as brand_name, b.logo_emoji, b.factory_country FROM models m JOIN brands b ON m.brand_id=b.id WHERE m.id=?',
            [model_id]
        );
        if (models.length === 0) return res.json({ success: false, error: 'Model bulunamadı' });
        const model = models[0];

        if (p.car_count >= p.max_car_slots) return res.json({ success: false, error: 'Araç slotunuz dolu!' });

        const currentYear = new Date().getFullYear();
        const requestedYear = parseInt(year) || currentYear;

        // Baz fiyat: %15 indirim
        let basePrice = Math.round(model.base_price * 0.85);

        const isTurkey = (model.factory_country || '').toLowerCase().includes('türkiye');
        const shippingCost = isTurkey ? 0 : Math.round(basePrice * 0.05);
        const taxCost = Math.round(basePrice * 0.08);

        let totalPrice = basePrice + shippingCost + taxCost;

        if (requestedYear > currentYear) {
            totalPrice = Math.round(totalPrice * 1.10); // +%10 next year tax
        }

        const validInstallments = [0, 3, 6, 9, 12];
        const inst = validInstallments.includes(parseInt(installments)) ? parseInt(installments) : 0;

        if (inst === 3) totalPrice = Math.round(totalPrice * 1.10);
        else if (inst === 6) totalPrice = Math.round(totalPrice * 1.20);
        else if (inst === 9) totalPrice = Math.round(totalPrice * 1.30);
        else if (inst === 12) totalPrice = Math.round(totalPrice * 1.40);

        if (inst === 0 && p.balance < totalPrice) {
            return res.json({ success: false, error: `Yetersiz bakiye! Peşin: ${totalPrice.toLocaleString('tr-TR')}₺` });
        }

        // Max limit validation against concurrent loans
        if (inst > 0) {
            const currentDebt = p.loan_remaining || 0;
            // Basic check to prevent excessive abuse, though limit depends on player
            if (currentDebt + totalPrice > 50000000) {
                return res.json({ success: false, error: 'Banka limitiniz bu kredi sözleşmesini karşılamıyor!' });
            }
        }

        const carData = {
            brand_id: model.brand_id, model_id: model.id, year: requestedYear, km: 0, price: totalPrice, // The market price inherently tracks its total generated factory cost
            color: model.lansoman_color || 'Beyaz', interior: 'Deri', interior_color: 'Siyah',
            fuel_type: model.fuel_type || 'Benzin', transmission: model.transmission || 'Otomatik',
            engine_size: model.engine_size || 1.6, horsepower: model.horsepower || 150,
            top_speed: model.top_speed || 180, torque: model.torque || 200, motor_health: 100,
            damage_status: 'Hasarsız', engine_status: 'Mükemmel', body_type: model.body_type,
            seller_type: 'Fabrika', owner_type: 'player', is_available: 0, cleanliness: 100,
            description: `Fabrikadan sıfır ${requestedYear} model araç`
        };

        const [carResult] = await pool.query('INSERT INTO cars SET ?', [carData]);
        const carId = carResult.insertId;

        const partNames = ['Ön Tampon', 'Arka Tampon', 'Ön Kaput', 'Bagaj Kapağı', 'Sol Ön Çamurluk', 'Sağ Ön Çamurluk', 'Sol Ön Kapı', 'Sağ Ön Kapı', 'Tavan', 'Motor', 'Şanzıman', 'Fren Sistemi', 'Süspansiyon', 'Egzoz'];
        for (const part of partNames) {
            await pool.query('INSERT INTO car_parts (car_id,part_name,status,quality) VALUES (?,?,"Orijinal",100)', [carId, part]);
        }

        // Add to our persistent tracking pool
        await pool.query('INSERT INTO player_cars (player_id,car_id,buy_price) VALUES (?,?,?)', [pid, carId, totalPrice]);

        if (inst === 0) {
            // Nakit Alım
            await pool.query('UPDATE player SET balance=balance-?, total_buys=total_buys+1, xp=xp+? WHERE id=?', [totalPrice, Math.round(totalPrice / 500), pid]);
            await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"buy",?,?)', [pid, totalPrice, `${model.brand_name} ${model.name} fabrikadan peşin alındı`]);
            await pool.query('INSERT INTO profit_history (player_id,type,amount,description) VALUES (?,"expense",?,?)', [pid, totalPrice, `Fabrika alımı: ${model.brand_name} ${model.name}`]);
        } else {
            // Kredi Alım (Merge with existing bank loans)
            const currentDebt = p.loan_remaining || 0;
            const currentMonthly = p.loan_monthly_payment || 0;
            const currentMonths = p.loan_months_left || 0;

            const newDebt = currentDebt + totalPrice;
            // Re-average months or extend
            const combinedMonths = Math.max(currentMonths, inst);
            const newMonthly = Math.round(newDebt / combinedMonths);

            await pool.query(
                `UPDATE player SET loan_amount = loan_amount + ?, loan_remaining = ?, loan_months_left = ?, loan_monthly_payment = ?, total_buys=total_buys+1, xp=xp+? WHERE id=?`,
                [totalPrice, newDebt, combinedMonths, newMonthly, Math.round(totalPrice / 500), pid]
            );

            await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"loan",?,?)', [pid, totalPrice, `${model.brand_name} ${model.name} siparişi için ${inst} ay vadeli kredi kullanıldı`]);
        }

        const { addTreasuryIncome } = require('../services/treasury');
        await addTreasuryIncome(pool, totalPrice, `Sıfır Araç Satışı: ${model.brand_name} ${model.name} (${inst > 0 ? inst + ' Taksit' : 'Nakit'})`);

        await checkLevelUp(pid);

        let msg = `${model.brand_name} ${model.name} ${requestedYear} siparişiniz `;
        msg += inst > 0 ? `${inst} ay taksitle onaylandı! <i class="fa-solid fa-file-signature"></i>` : `fabrikadan nakit alındı! <i class="fa-solid fa-industry"></i>`;

        res.json({ success: true, message: msg, player: await getPlayer(pid) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== EXPERTİZ SİSTEMİ ===================
router.post('/inspect/:carId', async (req, res) => {
    try {
        const pid = req.playerId;
        const carId = req.params.carId;

        const [cars] = await pool.query(
            'SELECT c.*, b.name as brand_name, m.name as model_name FROM cars c JOIN brands b ON c.brand_id=b.id JOIN models m ON c.model_id=m.id WHERE c.id=?',
            [carId]
        );
        if (cars.length === 0) return res.json({ success: false, error: 'Araç bulunamadı' });
        const car = cars[0];

        const [existing] = await pool.query('SELECT * FROM inspections WHERE car_id=? AND player_id=?', [carId, pid]);
        if (existing.length > 0) return res.json({ success: false, error: 'Bu araca zaten expertiz yaptırdınız!', inspection: existing[0] });

        const p = await getPlayer(pid);
        const isFree = req.query.free === 'true' && (car.seller_type === 'Galeriden' || car.seller_type === 'Yetkili Bayi');
        const cost = isFree ? 0 : calculateInspectionCost(car.price);
        if (p.balance < cost) return res.json({ success: false, error: `Yetersiz bakiye! Expertiz: ${cost.toLocaleString('tr-TR')}₺` });

        const [parts] = await pool.query('SELECT * FROM car_parts WHERE car_id=?', [carId]);

        let score = 100;
        const issues = [];

        // Hasar durumu
        const dmgS = { 'Hasarsız': 0, 'Çizik': -5, 'Boyalı': -12, 'Değişen': -22, 'Hasarlı': -35, 'Pert': -50 };
        score += (dmgS[car.damage_status] || 0);
        if (car.damage_status !== 'Hasarsız') issues.push(`Hasar durumu: ${car.damage_status}`);

        // Motor durumu
        const engS = { 'Mükemmel': 0, 'İyi': -5, 'Orta': -15, 'Kötü': -30, 'Ölü': -50 };
        score += (engS[car.engine_status] || 0);
        if (!['Mükemmel', 'İyi'].includes(car.engine_status)) issues.push(`Motor durumu: ${car.engine_status}`);

        // KM
        if (car.km > 200000) { score -= 10; issues.push('Yüksek kilometre (200.000+ km)'); }
        else if (car.km > 150000) { score -= 5; issues.push('Yüksek kilometre (150.000+ km)'); }

        // Motor sağlığı
        if (car.motor_health !== undefined && car.motor_health < 50) {
            score -= 10;
            issues.push(`Motor sağlığı düşük (%${car.motor_health})`);
        }

        // Parçalar
        let damagedParts = 0;
        for (const part of parts) {
            if (part.status === 'Yok') { damagedParts++; score -= 8; }
            else if (part.status === 'Hasarlı') { damagedParts++; score -= 5; }
            else if (part.status === 'Değişen') { damagedParts++; score -= 3; }
            else if (part.status === 'Boyalı') { score -= 1; }
        }
        if (damagedParts > 0) issues.push(`${damagedParts} parça hasarlı/değişmiş/eksik`);

        if (car.cleanliness < 40) { score -= 5; issues.push('Araç kirli'); }

        score = Math.max(0, Math.min(100, score));
        const verdict = score >= 85 ? 'Mükemmel' : score >= 70 ? 'İyi' : score >= 50 ? 'Orta' : 'Riskli';

        await pool.query(
            'INSERT INTO inspections (player_id,car_id,score,verdict,issues,cost) VALUES (?,?,?,?,?,?)',
            [pid, carId, score, verdict, JSON.stringify(issues), cost]
        );
        if (cost > 0) {
            await pool.query('UPDATE player SET balance=balance-?, xp=xp+5 WHERE id=?', [cost, pid]);
            await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"buy",?,?)', [pid, cost, `Expertiz: ${car.brand_name} ${car.model_name}`]);

            const { addTreasuryIncome } = require('../services/treasury');
            await addTreasuryIncome(pool, cost, `Expertiz Hizmeti (${car.brand_name} ${car.model_name})`);
        }

        res.json({
            success: true,
            message: `Expertiz tamamlandı! Puan: ${score}/100 (${verdict})`,
            inspection: { score, verdict, issues, cost },
            player: await getPlayer(pid)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== TAMİR SİSTEMİ (TEK TİP) ===================
router.post('/repair/:playerCarId', async (req, res) => {
    try {
        const pid = req.playerId;
        // Tamirci ve tamir tipi seçeneklerini kaldırdık, sadece part_id alınıyor
        const { part_id } = req.body;

        // İlan kontrolü
        const [listing] = await pool.query('SELECT id FROM listings WHERE player_car_id = ? AND status = "active"', [req.params.playerCarId]);
        if (listing.length > 0) return res.json({ success: false, error: 'İlandaki aracı tamir edemezsiniz. Önce ilanı kaldırın.' });

        const [pCars] = await pool.query(
            `SELECT pc.*, c.price, b.name as brand_name, m.name as model_name
             FROM player_cars pc JOIN cars c ON pc.car_id=c.id
             JOIN brands b ON c.brand_id=b.id JOIN models m ON c.model_id=m.id
             WHERE pc.id=? AND pc.player_id=?`, [req.params.playerCarId, pid]
        );
        if (pCars.length === 0) return res.json({ success: false, error: 'Araç bulunamadı' });
        const pCar = pCars[0];

        const [parts] = await pool.query('SELECT * FROM car_parts WHERE id=? AND car_id=?', [part_id, pCar.car_id]);
        if (parts.length === 0) return res.json({ success: false, error: 'Parça bulunamadı' });
        const part = parts[0];

        if (part.status === 'Orijinal') return res.json({ success: false, error: 'Bu parça zaten orijinal durumda!' });

        // Maliyet hesaplamasında tamirci çarpanı çıkarıldı
        const cost = calculateRepairCost(part.status, pCar.price);

        const p = await getPlayer(pid);
        if (p.balance < cost) return res.json({ success: false, error: `Yetersiz bakiye! Tamir: ${cost.toLocaleString('tr-TR')}₺` });

        // Tek tip tamir mantığı: Orijinal statüsüne getir (listeden kalkması için)
        const newStatus = 'Orijinal';
        const newQuality = 100;

        const valueIncrease = calculateRepairValueIncrease(pCar.price, part.status);
        await pool.query('UPDATE car_parts SET status=?, quality=?, is_original=1 WHERE id=?',
            [newStatus, newQuality, part_id]);
        await pool.query('UPDATE cars SET price=price+? WHERE id=?', [valueIncrease, pCar.car_id]);
        await pool.query('UPDATE player_cars SET buy_price = buy_price + ?, expenses = expenses + ? WHERE id = ?', [cost, cost, pCar.id]);
        await pool.query('UPDATE player SET balance=balance-?, xp=xp+10 WHERE id=?', [cost, pid]);
        await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"buy",?,?)',
            [pid, cost, `Tamir: ${part.part_name}`]);
        await pool.query('INSERT INTO profit_history (player_id,type,amount,description) VALUES (?,"expense",?,?)',
            [pid, cost, `Tamir: ${part.part_name}`]);

        // Genel hasar durumunu güncelle
        const [allParts] = await pool.query('SELECT status FROM car_parts WHERE car_id=?', [pCar.car_id]);
        let worstStatus = 'Hasarsız';
        for (const pp of allParts) {
            if (pp.status === 'Yok' || pp.status === 'Hasarlı') { worstStatus = 'Hasarlı'; break; }
            if (pp.status === 'Değişen' && worstStatus !== 'Hasarlı') worstStatus = 'Değişen';
            if (pp.status === 'Boyalı' && !['Hasarlı', 'Değişen'].includes(worstStatus)) worstStatus = 'Boyalı';
            if (pp.status === 'Çizik' && worstStatus === 'Hasarsız') worstStatus = 'Çizik';
        }
        if (allParts.every(pp => pp.status === 'Orijinal')) worstStatus = 'Hasarsız';
        await pool.query('UPDATE cars SET damage_status=? WHERE id=?', [worstStatus, pCar.car_id]);

        res.json({
            success: true,
            message: `${part.part_name} tamir edildi! <i class="fa-solid fa-wrench"></i> +${valueIncrease.toLocaleString('tr-TR')}₺`,
            cost, valueIncrease, newStatus,
            player: await getPlayer(pid)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== TAMİRCİ TİPLERİ ===================
router.get('/mechanic-types', (req, res) => {
    res.json({ success: true, data: [] });
});

// =================== TÜMÜNÜ TAMİR ET ===================
router.post('/repair-all/:playerCarId', async (req, res) => {
    try {
        const pid = req.playerId;

        // İlan kontrolü
        const [listing] = await pool.query('SELECT id FROM listings WHERE player_car_id = ? AND status = "active"', [req.params.playerCarId]);
        if (listing.length > 0) return res.json({ success: false, error: 'İlandaki aracı tamir edemezsiniz. Önce ilanı kaldırın.' });

        const [pCars] = await pool.query(
            `SELECT pc.*, c.price, b.name as brand_name, m.name as model_name
             FROM player_cars pc JOIN cars c ON pc.car_id=c.id
             JOIN brands b ON c.brand_id=b.id JOIN models m ON c.model_id=m.id
             WHERE pc.id=? AND pc.player_id=?`, [req.params.playerCarId, pid]
        );
        if (pCars.length === 0) return res.json({ success: false, error: 'Araç bulunamadı' });
        const pCar = pCars[0];

        // Hasarlı parçaları bul
        const [damagedParts] = await pool.query(
            "SELECT * FROM car_parts WHERE car_id=? AND status != 'Orijinal'",
            [pCar.car_id]
        );

        if (damagedParts.length === 0) return res.json({ success: false, error: 'Tüm parçalar zaten orijinal durumda!' });

        // Toplam maliyet hesapla
        let totalCost = 0;
        let totalValueIncrease = 0;
        for (const part of damagedParts) {
            totalCost += calculateRepairCost(part.status, pCar.price);
            totalValueIncrease += calculateRepairValueIncrease(pCar.price, part.status);
        }

        const p = await getPlayer(pid);
        if (p.balance < totalCost) return res.json({ success: false, error: `Yetersiz bakiye! Toplam tamir: ${totalCost.toLocaleString('tr-TR')}₺ | Bakiyeniz: ${p.balance.toLocaleString('tr-TR')}₺` });

        // Tüm parçaları orijinale çevir
        for (const part of damagedParts) {
            await pool.query("UPDATE car_parts SET status='Orijinal', quality=100, is_original=1 WHERE id=?", [part.id]);
        }

        // Araç değerini güncelle
        await pool.query('UPDATE cars SET price=price+?, damage_status=? WHERE id=?', [totalValueIncrease, 'Hasarsız', pCar.car_id]);
        await pool.query('UPDATE player_cars SET buy_price = buy_price + ?, expenses = expenses + ? WHERE id = ?', [totalCost, totalCost, pCar.id]);
        await pool.query('UPDATE player SET balance=balance-?, xp=xp+? WHERE id=?', [totalCost, damagedParts.length * 10, pid]);
        await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,\"buy\",?,?)',
            [pid, totalCost, `Toplu Tamir: ${damagedParts.length} parça`]);
        await pool.query('INSERT INTO profit_history (player_id,type,amount,description) VALUES (?,\"expense\",?,?)',
            [pid, totalCost, `Toplu Tamir: ${damagedParts.length} parça`]);

        res.json({
            success: true,
            message: `${damagedParts.length} parça tamir edildi! <i class="fa-solid fa-wrench"></i> Toplam maliyet: ${totalCost.toLocaleString('tr-TR')}₺ | +${totalValueIncrease.toLocaleString('tr-TR')}₺ değer artışı`,
            cost: totalCost,
            valueIncrease: totalValueIncrease,
            repairedCount: damagedParts.length,
            player: await getPlayer(pid)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== BOYAMA ===================
router.post('/paint/:playerCarId', async (req, res) => {
    try {
        const pid = req.playerId;
        const { color } = req.body;
        if (!color) return res.json({ success: false, error: 'Renk seçin!' });

        // İlan kontrolü
        const [listing] = await pool.query('SELECT id FROM listings WHERE player_car_id = ? AND status = "active"', [req.params.playerCarId]);
        if (listing.length > 0) return res.json({ success: false, error: 'İlandaki aracı boyayamazsınız. Önce ilanı kaldırın.' });

        const [pCars] = await pool.query(
            `SELECT pc.*, c.*, b.name as brand_name, m.name as model_name
             FROM player_cars pc JOIN cars c ON pc.car_id=c.id
             JOIN brands b ON c.brand_id=b.id JOIN models m ON c.model_id=m.id
             WHERE pc.id=? AND pc.player_id=?`, [req.params.playerCarId, pid]
        );
        if (pCars.length === 0) return res.json({ success: false, error: 'Araç bulunamadı' });
        const pCar = pCars[0];

        const cost = calculatePaintCost(pCar.price, false);
        const valueIncrease = calculatePaintValueIncrease(pCar.price, false);

        const p = await getPlayer(pid);
        if (p.balance < cost) return res.json({ success: false, error: `Yetersiz bakiye! Boyama: ${cost.toLocaleString('tr-TR')}₺` });

        await pool.query('UPDATE cars SET color=?, price=price+? WHERE id=?', [color, valueIncrease, pCar.car_id]);
        await pool.query('UPDATE player_cars SET buy_price = buy_price + ?, expenses = expenses + ? WHERE id = ?', [cost, cost, pCar.id]);
        await pool.query('UPDATE player SET balance=balance-?, xp=xp+8 WHERE id=?', [cost, pid]);
        await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"buy",?,?)',
            [pid, cost, `Boyama: ${color}`]);
        await pool.query('INSERT INTO profit_history (player_id,type,amount,description) VALUES (?,"expense",?,?)',
            [pid, cost, `Boyama: ${color}`]);

        res.json({
            success: true,
            message: `Araç ${color} rengine boyandı! <i class="fa-solid fa-palette"></i> +${valueIncrease.toLocaleString('tr-TR')}₺`,
            cost, valueIncrease,
            player: await getPlayer(pid)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== YIKAMA ===================
router.post('/wash/:playerCarId', async (req, res) => {
    try {
        const pid = req.playerId;

        // İlan kontrolü
        const [listing] = await pool.query('SELECT id FROM listings WHERE player_car_id = ? AND status = "active"', [req.params.playerCarId]);
        if (listing.length > 0) return res.json({ success: false, error: 'İlandaki aracı yıkayamazsınız. Önce ilanı kaldırın.' });

        const [pCars] = await pool.query(
            `SELECT pc.*, c.price, c.cleanliness, b.name as brand_name, m.name as model_name
             FROM player_cars pc JOIN cars c ON pc.car_id=c.id
             JOIN brands b ON c.brand_id=b.id JOIN models m ON c.model_id=m.id
             WHERE pc.id=? AND pc.player_id=?`, [req.params.playerCarId, pid]
        );
        if (pCars.length === 0) return res.json({ success: false, error: 'Araç bulunamadı' });
        const pCar = pCars[0];

        if (pCar.cleanliness >= 95) return res.json({ success: false, error: 'Araç zaten temiz!' });

        const cost = calculateWashCost(pCar.price);
        const p = await getPlayer(pid);
        if (p.balance < cost) return res.json({ success: false, error: `Yetersiz bakiye! Yıkama: ${cost.toLocaleString('tr-TR')}₺` });

        const newCleanliness = 100;
        const valueIncrease = Math.round(pCar.price * 0.01);

        await pool.query('UPDATE cars SET cleanliness=?, price=price+? WHERE id=?', [newCleanliness, valueIncrease, pCar.car_id]);
        await pool.query('UPDATE player_cars SET buy_price = buy_price + ?, expenses = expenses + ? WHERE id = ?', [cost, cost, pCar.id]);
        await pool.query('UPDATE player SET balance=balance-?, xp=xp+3 WHERE id=?', [cost, pid]);
        await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"buy",?,?)',
            [pid, cost, `Yıkama: ${pCar.brand_name} ${pCar.model_name}`]);

        res.json({
            success: true,
            message: `Araç yıkandı! <i class="fa-solid fa-shower"></i> Temizlik: ${newCleanliness}% | +${valueIncrease.toLocaleString('tr-TR')}₺`,
            cost, newCleanliness, valueIncrease,
            player: await getPlayer(pid)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== KREDİ SİSTEMİ ===================
router.get('/loans', async (req, res) => {
    try {
        const p = await getPlayer(req.playerId);
        const loanLimit = calculateLoanLimit(p.level, p.has_gallery);
        const interestRate = calculateInterestRate(p.level);

        const [settings] = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'loan_approval_threshold'");
        const loanApprovalThreshold = settings.length > 0 ? parseFloat(settings[0].setting_value) : 1000000;

        const [installments] = await pool.query(
            `SELECT listing_id, 
                    MAX(car_name) as car_name, 
                    MAX(total_installments) as total_months, 
                    SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_months,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as remaining_months,
                    SUM(amount) as total_revenue,
                    SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as remaining_revenue,
                    MAX(amount) as monthly_payment
             FROM installment_payments 
             WHERE seller_id = ? 
             GROUP BY listing_id
             HAVING remaining_months > 0
             ORDER BY MAX(due_day) ASC`,
            [p.id]
        );

        const [activeRequests] = await pool.query('SELECT * FROM loan_requests WHERE player_id=? AND status IN ("pending", "counter_offer") LIMIT 1', [p.id]);
        const activeLoanRequest = activeRequests.length > 0 ? activeRequests[0] : null;

        res.json({
            success: true,
            data: {
                loanLimit, interestRate, loanApprovalThreshold,
                currentLoan: {
                    amount: p.loan_amount, remaining: p.loan_remaining,
                    monthlyPayment: p.loan_monthly_payment, monthsLeft: p.loan_months_left,
                    missedPayments: p.loan_missed_payments
                },
                isSeized: p.is_seized,
                level: p.level,
                incomingInstallments: installments,
                activeLoanRequest
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/loan', async (req, res) => {
    try {
        const pid = req.playerId;
        const { amount, months, reason } = req.body;
        if (!amount || !months || amount <= 0 || months <= 0 || months > 24) {
            return res.json({ success: false, error: 'Geçerli tutar ve vade girin! (Maks 24 ay)' });
        }

        const p = await getPlayer(pid);
        if (p.is_seized) return res.json({ success: false, error: 'Hesabınız hacizli!' });
        if (p.loan_remaining > 0) return res.json({ success: false, error: 'Mevcut kredinizi ödeyin önce!' });
        if (p.level < 3) return res.json({ success: false, error: 'Minimum seviye 3 gerekli!' });

        const loanLimit = calculateLoanLimit(p.level, p.has_gallery);
        if (amount > loanLimit) return res.json({ success: false, error: `Kredi limitiniz: ${loanLimit.toLocaleString('tr-TR')}₺` });

        // Onay Miktarisini Kontrol Et (SYSTEM SETTINGS)
        const [settings] = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'loan_approval_threshold'");
        const threshold = settings.length > 0 ? parseFloat(settings[0].setting_value) : 1000000;

        if (amount >= threshold) {
            if (!reason || reason.trim().length < 10) {
                return res.json({ success: false, error: `${threshold.toLocaleString('tr-TR')}₺ ve üzeri krediler için onay gereklidir. Lütfen en az 10 karakter uzunluğunda geçerli bir neden belirtin.` });
            }

            // Check for previous active pending
            const [existing] = await pool.query("SELECT id FROM loan_requests WHERE player_id=? AND status IN ('pending','counter_offer')", [pid]);
            if (existing.length > 0) return res.json({ success: false, error: 'Zaten bekleyen bir kredi isteğiniz veya karşı teklifiniz bulunuyor!' });

            await pool.query("INSERT INTO loan_requests (player_id, amount, months, reason) VALUES (?, ?, ?, ?)", [pid, amount, months, reason]);
            return res.json({ success: true, message: 'Kredi isteğiniz Merkez Bankasına iletildi. Onay veya karşı teklif aldığınızda bildirim gelecektir.' });
        }

        // Under threshold: automatic grant
        const interestRate = calculateInterestRate(p.level);
        const totalInterest = Math.round(amount * (interestRate / 100) * months);
        const totalAmount = amount + totalInterest;
        const monthlyPayment = Math.round(totalAmount / months);

        await pool.query(
            'UPDATE player SET balance=balance+?, loan_amount=?, loan_remaining=?, loan_monthly_payment=?, loan_months_left=?, loan_missed_payments=0 WHERE id=?',
            [amount, totalAmount, totalAmount, monthlyPayment, months, pid]
        );
        await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"loan",?,?)',
            [pid, amount, `Kredi: ${months} ay, %${interestRate.toFixed(1)} faiz`]);

        res.json({
            success: true,
            message: `${amount.toLocaleString('tr-TR')}₺ kredi çekildi! <i class="fa-solid fa-building-columns"></i> Taksit: ${monthlyPayment.toLocaleString('tr-TR')}₺ × ${months} ay`,
            player: await getPlayer(pid)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/pay-loan', async (req, res) => {
    try {
        const pid = req.playerId;
        const p = await getPlayer(pid);

        if (p.loan_remaining <= 0) return res.json({ success: false, error: 'Ödenmemiş krediniz yok!' });

        const payment = Math.min(p.loan_monthly_payment, p.loan_remaining);
        if (p.balance < payment) return res.json({ success: false, error: `Yetersiz bakiye! Taksit: ${payment.toLocaleString('tr-TR')}₺` });

        const newRemaining = Math.max(0, p.loan_remaining - payment);
        const newMonths = Math.max(0, p.loan_months_left - 1);
        const extra = newRemaining === 0 ? ', loan_amount=0, loan_monthly_payment=0, is_seized=0' : '';

        await pool.query(
            `UPDATE player SET balance=balance-?, loan_remaining=?, loan_months_left=?, loan_missed_payments=0 ${extra} WHERE id=?`,
            [payment, newRemaining, newMonths, pid]
        );

        const { addTreasuryIncome } = require('../services/treasury');
        await addTreasuryIncome(pool, payment, `Kredi Erken Kapatma / Taksit (${p.username})`);

        await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"loan_payment",?,?)',
            [pid, payment, newRemaining > 0 ? `Kredi ödemesi(Kalan: ${newRemaining.toLocaleString('tr-TR')}₺)` : 'Kredi kapandı!']);
        await pool.query('INSERT INTO profit_history (player_id,type,amount,description) VALUES (?,"expense",?,?)',
            [pid, payment, 'Kredi ödemesi']);
        res.json({
            success: true,
            message: newRemaining === 0 ? 'Kredi tamamen ödendi! <i class="fa-solid fa-champagne-glasses"></i>' : `Taksit ödendi! Kalan: ${newRemaining.toLocaleString('tr-TR')}₺`,
            remaining: newRemaining,
            missed: newMonths
        });

        const io = getIO();
        if (io) io.to(`player_${pid}`).emit('player_update', { playerId: pid });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/loan-counter/:id/action', async (req, res) => {
    try {
        const pid = req.playerId;
        const reqId = req.params.id;
        const { action } = req.body; // 'accept' veya 'reject'

        const [requests] = await pool.query('SELECT * FROM loan_requests WHERE id=? AND player_id=?', [reqId, pid]);
        if (requests.length === 0) return res.json({ success: false, error: 'Talep bulunamadı.' });
        const request = requests[0];

        if (request.status !== 'counter_offer') return res.json({ success: false, error: 'Bu talebe şu anda işlem yapamazsınız.' });

        if (action === 'accept') {
            const amount = request.counter_amount;
            const months = request.months;
            const p = await getPlayer(pid);
            if (p.is_seized) return res.json({ success: false, error: 'Hesabınız hacizli!' });
            if (p.loan_remaining > 0) return res.json({ success: false, error: 'Önce mevcut kredinizi kapatın!' });

            const interestRate = calculateInterestRate(p.level);
            const totalInterest = Math.round(amount * (interestRate / 100) * months);
            const totalAmount = amount + totalInterest;
            const monthlyPayment = Math.round(totalAmount / months);

            await pool.query(
                'UPDATE player SET balance=balance+?, loan_amount=?, loan_remaining=?, loan_monthly_payment=?, loan_months_left=?, loan_missed_payments=0 WHERE id=?',
                [amount, totalAmount, totalAmount, monthlyPayment, months, pid]
            );
            await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"loan",?,?)',
                [pid, amount, `MB Kredi Karşı Teklif Kabulü: ${months} ay, % ${interestRate.toFixed(1)} faiz`]);
            await pool.query('UPDATE loan_requests SET status="accepted" WHERE id=?', [reqId]);

            const { addTreasuryExpense } = require('../services/treasury');
            await addTreasuryExpense(pool, amount, `MB Kredi Karşı Teklif Onayı(${p.username})`);

            res.json({ success: true, message: `Karşı teklif kabul edildi! ${amount.toLocaleString('tr-TR')}₺ hesabınıza aktarıldı.` });
        } else if (action === 'reject') {
            await pool.query('UPDATE loan_requests SET status="rejected", admin_message="Oyuncu karşı teklifi reddetti" WHERE id=?', [reqId]);
            res.json({ success: true, message: 'Karşı teklif reddedildi ve talep iptal edildi.' });
        } else {
            res.json({ success: false, error: 'Geçersiz işlem.' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== TEMA ===================
router.post('/theme', async (req, res) => {
    try {
        const { theme } = req.body;
        if (!['dark', 'light'].includes(theme)) return res.json({ success: false, error: 'Geçersiz tema' });
        await pool.query('UPDATE player SET theme=? WHERE id=?', [theme, req.playerId]);
        res.json({ success: true, theme });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== KÂR/ZARAR ===================
router.get('/profit-chart', async (req, res) => {
    try {
        const pid = req.playerId;
        const [history] = await pool.query(
            'SELECT type,amount,description,created_at FROM profit_history WHERE player_id=? ORDER BY created_at DESC LIMIT 50',
            [pid]
        );

        const dailySummary = {};
        for (const h of history) {
            const date = new Date(h.created_at).toISOString().split('T')[0];
            if (!dailySummary[date]) dailySummary[date] = { income: 0, expense: 0, net: 0 };
            if (h.type === 'income') {
                dailySummary[date].income += parseFloat(h.amount);
                dailySummary[date].net += parseFloat(h.amount);
            } else {
                dailySummary[date].expense += parseFloat(h.amount);
                dailySummary[date].net -= parseFloat(h.amount);
            }
        }

        let totalIncome = 0, totalExpense = 0;
        history.forEach(h => {
            if (h.type === 'income') totalIncome += parseFloat(h.amount);
            else totalExpense += parseFloat(h.amount);
        });

        res.json({
            success: true,
            data: {
                history: history.reverse(), dailySummary,
                totals: { income: totalIncome, expense: totalExpense, net: totalIncome - totalExpense }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== İŞLEMLER ===================
router.get('/transactions', async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const [transactions] = await pool.query(
            'SELECT * FROM transactions WHERE player_id=? ORDER BY created_at DESC LIMIT ?',
            [req.playerId, parseInt(limit)]
        );
        res.json({ success: true, data: transactions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== ÖZEL ARAÇ ===================
router.get('/custom-options', async (req, res) => {
    try {
        const [options] = await pool.query('SELECT * FROM custom_options ORDER BY category, price_multiplier');
        res.json({ success: true, data: options });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/custom-build', async (req, res) => {
    try {
        const pid = req.playerId;
        const { model_id, options = [] } = req.body;
        const p = await getPlayer(pid);

        if (!p.can_custom_build) return res.json({ success: false, error: 'Seviye 40 gerekli!' });
        if (p.is_seized) return res.json({ success: false, error: 'Hesabınız hacizli!' });

        const [models] = await pool.query(
            'SELECT m.*, b.name as brand_name, b.prestige, b.logo_emoji FROM models m JOIN brands b ON m.brand_id=b.id WHERE m.id=?',
            [model_id]
        );
        if (models.length === 0) return res.json({ success: false, error: 'Model bulunamadı' });
        const model = models[0];

        if (model.prestige < 7) {
            return res.json({ success: false, error: 'Sadece 7 ve üzeri prestiji olan lüks araçlar baştan tasarlanabilir!' });
        }

        if (p.car_count >= p.max_car_slots) return res.json({ success: false, error: 'Araç slotunuz dolu!' });

        let totalMultiplier = 1;
        if (options.length > 0) {
            const [opts] = await pool.query('SELECT * FROM custom_options WHERE id IN (?)', [options]);
            opts.forEach(o => totalMultiplier *= o.price_multiplier);
        }

        const price = Math.round(model.base_price * totalMultiplier);
        if (p.balance < price) return res.json({ success: false, error: `Yetersiz bakiye! Maliyet: ${price.toLocaleString('tr-TR')}₺` });

        const carData = {
            brand_id: model.brand_id, model_id: model.id, year: 2026, km: 0, price,
            color: 'Özel', interior: 'Premium Deri', interior_color: 'Özel',
            fuel_type: 'Benzin', transmission: 'Otomatik', engine_size: 2.0, horsepower: 200,
            top_speed: model.top_speed || 250, torque: model.torque || 400, motor_health: 100,
            damage_status: 'Hasarsız', engine_status: 'Mükemmel', body_type: model.body_type,
            seller_type: 'Özel Üretim', owner_type: 'player', is_available: 0, cleanliness: 100,
            description: 'Özel olarak üretilen araç'
        };

        const [carResult] = await pool.query('INSERT INTO cars SET ?', [carData]);
        const carId = carResult.insertId;

        const partNames = ['Ön Tampon', 'Arka Tampon', 'Ön Kaput', 'Bagaj Kapağı', 'Sol Ön Çamurluk', 'Sağ Ön Çamurluk', 'Sol Ön Kapı', 'Sağ Ön Kapı', 'Tavan', 'Motor', 'Şanzıman', 'Fren Sistemi'];
        for (const part of partNames) {
            await pool.query('INSERT INTO car_parts (car_id,part_name,status,quality) VALUES (?,?,"Orijinal",100)', [carId, part]);
        }

        await pool.query('INSERT INTO player_cars (player_id,car_id,buy_price) VALUES (?,?,?)', [pid, carId, price]);
        await pool.query('UPDATE player SET balance=balance-?, total_buys=total_buys+1, xp=xp+? WHERE id=?', [price, Math.round(price / 300), pid]);
        await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"buy",?,?)', [pid, price, `Özel: ${model.brand_name} ${model.name}`]);
        await pool.query('INSERT INTO profit_history (player_id,type,amount,description) VALUES (?,"expense",?,?)', [pid, price, `Özel üretim: ${model.brand_name} ${model.name}`]);

        await checkLevelUp(pid);
        res.json({ success: true, message: `${model.brand_name} ${model.name} özel üretildi! < i class= "fa-solid fa-palette" ></i > `, player: await getPlayer(pid) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== İLLEGAL GARAJ ===================
router.get('/illegal-mods', (req, res) => {
    const grouped = {};
    ILLEGAL_MODS.forEach(m => {
        if (!grouped[m.type]) grouped[m.type] = [];
        grouped[m.type].push(m);
    });
    res.json({ success: true, data: grouped, all: ILLEGAL_MODS });
});

router.get('/illegal-mods/:playerCarId', async (req, res) => {
    try {
        const pid = req.playerId;
        const [mods] = await pool.query(
            'SELECT im.* FROM illegal_mods im JOIN player_cars pc ON im.player_car_id=pc.id WHERE pc.id=? AND pc.player_id=?',
            [req.params.playerCarId, pid]
        );
        res.json({ success: true, data: mods });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/illegal-mod/:playerCarId', async (req, res) => {
    try {
        const pid = req.playerId;
        const pcId = req.params.playerCarId;

        // İlan kontrolü
        const [listing] = await pool.query('SELECT id FROM listings WHERE player_car_id = ? AND status = "active"', [pcId]);
        if (listing.length > 0) return res.json({ success: false, error: 'İlandaki araç üzerinde illegal işlem yapamazsınız. Önce ilanı kaldırın.' });

        const { mod_index } = req.body;
        const mod = ILLEGAL_MODS[mod_index];
        if (!mod) return res.json({ success: false, error: 'Geçersiz modifikasyon!' });

        // Check if this type of mod is already applied (Özel: Yazılım kilit mekanizması)
        const [existingMods] = await pool.query('SELECT mod_name FROM illegal_mods WHERE player_car_id = ? AND mod_type = ?', [pcId, mod.type]);

        if (existingMods.length > 0) {
            if (mod.type === 'yazilim') {
                const hasStage3 = existingMods.some(m => m.mod_name.includes('Stage 3'));
                const alreadyHasThisMod = existingMods.some(m => m.mod_name === mod.name);

                if (hasStage3) {
                    return res.json({ success: false, error: 'Bu araca Stage 3 Pro Yazılım uygulanmış. Diğer yazılımlar kilitli!' });
                }
                if (alreadyHasThisMod) {
                    return res.json({ success: false, error: 'Bu yazılım zaten araca uygulanmış!' });
                }
                // Stage 3 değilse ve aynısı değilse izin ver (üstüne eklenebilir)
            } else {
                return res.json({ success: false, error: 'Bu araca zaten bu türde bir illegal işlem uygulanmış!' });
            }
        }

        const [pCars] = await pool.query(
            `SELECT pc.*, c.price, c.horsepower, c.top_speed, c.torque, c.km,
            b.name as brand_name, m.name as model_name
             FROM player_cars pc JOIN cars c ON pc.car_id = c.id
             JOIN brands b ON c.brand_id = b.id JOIN models m ON c.model_id = m.id
             WHERE pc.id =? AND pc.player_id =? `, [pcId, pid]
        );
        if (pCars.length === 0) return res.json({ success: false, error: 'Araç bulunamadı' });
        const pCar = pCars[0];

        const cost = Math.round(pCar.price * mod.costMult);
        const p = await getPlayer(pid);
        if (p.balance < cost) return res.json({ success: false, error: `Yetersiz bakiye! Maliyet: ${cost.toLocaleString('tr-TR')}₺` });

        // Risk kontrolü
        const newRisk = Math.min(100, parseFloat(p.risk_level || 0) + mod.riskPercent);
        if (newRisk >= 100) return res.json({ success: false, error: 'Risk seviyeniz çok yüksek! Biraz bekleyin.' });

        // KM düşürme özel işlem
        if (mod.type === 'km_dusurme') {
            let newKm;
            if (mod.kmReduce === -1) newKm = 0;
            else newKm = Math.max(0, pCar.km - mod.kmReduce);
            await pool.query('UPDATE cars SET km=? WHERE id=?', [newKm, pCar.car_id]);
        }

        // Değer artışı
        const priceBonus = Math.round(pCar.price * (mod.hpBonus * 50 + mod.torqueBonus * 30 + mod.speedBonus * 100) / 100000) || Math.round(pCar.price * 0.02);

        await pool.query(
            'INSERT INTO illegal_mods (player_car_id,mod_type,mod_name,mod_tier,hp_bonus,torque_bonus,speed_bonus,price_bonus,risk_percent,cost) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [pcId, mod.type, mod.name, mod.tier, mod.hpBonus, mod.torqueBonus, mod.speedBonus, priceBonus, mod.riskPercent, cost]
        );
        await pool.query('UPDATE cars SET horsepower=horsepower+?, top_speed=top_speed+?, torque=torque+?, price=price+? WHERE id=?',
            [mod.hpBonus, mod.speedBonus, mod.torqueBonus, priceBonus, pCar.car_id]);
        await pool.query('UPDATE player_cars SET buy_price = buy_price + ?, expenses = expenses + ? WHERE id = ?', [cost, cost, pcId]);
        await pool.query('UPDATE player SET balance=balance-?, risk_level=?, xp=xp+15 WHERE id=?', [cost, newRisk, pid]);
        await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"buy",?,?)',
            [pid, cost, `İllegal: ${mod.name}`]);
        await pool.query('INSERT INTO profit_history (player_id,type,amount,description) VALUES (?,"expense",?,?)',
            [pid, cost, `İllegal mod: ${mod.name}`]);

        res.json({
            success: true,
            message: `${mod.name} uygulandı! Risk: %${newRisk.toFixed(0)} | +${priceBonus.toLocaleString('tr-TR')}₺ değer`,
            risk: newRisk, cost, priceBonus,
            player: await getPlayer(pid)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== HURDALIK ===================
router.get('/junkyard', async (req, res) => {
    try {
        // Hurdalık seviye kısıtlaması kaldırıldı

        const [cars] = await pool.query(
            `SELECT c.*, b.name as brand_name, b.logo_emoji, b.prestige,
            m.name as model_name, m.tier, m.body_type
             FROM cars c JOIN brands b ON c.brand_id = b.id JOIN models m ON c.model_id = m.id
             WHERE c.owner_type = 'junkyard' AND c.is_available = 1
             ORDER BY c.price ASC`
        );
        res.json({ success: true, data: cars });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/junkyard-buy/:carId', async (req, res) => {
    try {
        const pid = req.playerId;
        const carId = req.params.carId;

        // Hurdalık seviye kısıtlaması kaldırıldı, ancak oyuncu verisi bakiye/slot kontrolü için gerekli
        const p = await getPlayer(pid);

        const [cars] = await pool.query(
            "SELECT c.*, b.name as brand_name, m.name as model_name FROM cars c JOIN brands b ON c.brand_id=b.id JOIN models m ON c.model_id=m.id WHERE c.id=? AND c.owner_type='junkyard' AND c.is_available=1",
            [carId]
        );
        if (cars.length === 0) return res.json({ success: false, error: 'Araç bulunamadı veya satılmış' });
        const car = cars[0];

        if (p.is_seized) return res.json({ success: false, error: 'Hesabınız hacizli!' });
        if (p.balance < car.price) return res.json({ success: false, error: 'Yetersiz bakiye!' });
        if (p.car_count >= p.max_car_slots) return res.json({ success: false, error: 'Araç slotunuz dolu!' });

        await pool.query("UPDATE cars SET is_available=0, owner_type='player' WHERE id=?", [carId]);
        await pool.query('INSERT INTO player_cars (player_id,car_id,buy_price) VALUES (?,?,?)', [pid, carId, car.price]);
        await pool.query('UPDATE player SET balance=balance-?, total_buys=total_buys+1, xp=xp+? WHERE id=?',
            [car.price, Math.round(car.price / 1250), pid]);
        await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"buy",?,?)',
            [pid, car.price, `Hurdalık: ${car.brand_name} ${car.model_name}`]);
        await pool.query('INSERT INTO profit_history (player_id,type,amount,description) VALUES (?,"expense",?,?)',
            [pid, car.price, `Hurdalık alımı: ${car.brand_name} ${car.model_name}`]);

        await checkLevelUp(pid);
        res.json({ success: true, message: `${car.brand_name} ${car.model_name} hurdalıktan alındı! <i class="fa-solid fa-gear"></i>`, player: await getPlayer(pid) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Motor değişimi (hurdalık araçlar için)
router.post('/engine-swap/:playerCarId', async (req, res) => {
    try {
        const pid = req.playerId;
        const pcId = req.params.playerCarId;

        // İlan kontrolü
        const [listing] = await pool.query('SELECT id FROM listings WHERE player_car_id = ? AND status = "active"', [pcId]);
        if (listing.length > 0) return res.json({ success: false, error: 'İlandaki aracın motorunu değiştiremezsiniz. Önce ilanı kaldırın.' });

        const { engine_type } = req.body; // basic, performance, authorized

        const [pCars] = await pool.query(
            `SELECT pc.*, c.price, c.motor_health, c.engine_status, c.horsepower,
            b.name as brand_name, m.name as model_name,
            m.base_price as model_base_price, m.top_speed as base_speed, m.torque as base_torque
             FROM player_cars pc JOIN cars c ON pc.car_id = c.id
             JOIN brands b ON c.brand_id = b.id JOIN models m ON c.model_id = m.id
             WHERE pc.id =? AND pc.player_id =? `, [pcId, pid]
        );
        if (pCars.length === 0) return res.json({ success: false, error: 'Araç bulunamadı' });
        const pCar = pCars[0];

        // Motor Yenileme (Sağlık ve Piyasa Değerine Göre)
        const cost = calculateMotorRepairCost(pCar.price, pCar.motor_health || 0);
        const newHealth = 100;
        const newEngineStatus = 'Mükemmel';
        const baseHp = pCar.horsepower || 100;
        const newHp = baseHp;

        const p = await getPlayer(pid);
        if (p.balance < cost) return res.json({ success: false, error: `Yetersiz bakiye! Motor: ${cost.toLocaleString('tr-TR')}₺` });

        const oldHealth = pCar.motor_health || 0;
        const valueDiff = Math.round(pCar.price * (newHealth - oldHealth) / 100);

        await pool.query('UPDATE cars SET motor_health=?, engine_status=?, horsepower=?, price=price+? WHERE id=?',
            [newHealth, newEngineStatus, newHp, Math.max(valueDiff, 0), pCar.car_id]);
        await pool.query('UPDATE player_cars SET buy_price = buy_price + ?, expenses = expenses + ? WHERE id = ?', [cost, cost, pcId]);
        await pool.query('UPDATE player SET balance=balance-?, xp=xp+20 WHERE id=?', [cost, pid]);

        await pool.query('INSERT INTO transactions (player_id,type,amount,description) VALUES (?,"buy",?,?)',
            [pid, cost, `Motor değişimi: ${pCar.brand_name} ${pCar.model_name}`]);
        await pool.query('INSERT INTO profit_history (player_id,type,amount,description) VALUES (?,"expense",?,?)',
            [pid, cost, `Motor değişimi: ${pCar.brand_name} ${pCar.model_name}`]);

        // Bildirim ekle (Persistence)
        await pool.query('INSERT INTO notifications (player_id, type, title, message) VALUES (?, "system", "Motor Yenileme", ?)',
            [pid, `${pCar.brand_name} ${pCar.model_name} aracınızın motoru yetkili serviste sıfırlandı! <i class="fa-solid fa-engine"></i>`]);

        // Motor parçasını güncelle
        await pool.query("UPDATE car_parts SET status='Orijinal', quality=? WHERE car_id=? AND part_name='Motor'",
            [newHealth, pCar.car_id]);

        res.json({
            success: true,
            message: `Motor değiştirildi! <i class="fa-solid fa-wrench"></i> Sağlık: %${newHealth} | Durum: ${newEngineStatus}`,
            cost,
            player: await getPlayer(pid)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== OYUNU SIFIRLA ===================
router.post('/reset', async (req, res) => {
    try {
        const pid = req.playerId;
        await pool.query('SET FOREIGN_KEY_CHECKS = 0');
        await pool.query('DELETE FROM offers WHERE listing_id IN (SELECT id FROM listings WHERE player_id=?)', [pid]);
        await pool.query('DELETE FROM listings WHERE player_id=?', [pid]);
        await pool.query('DELETE FROM illegal_mods WHERE player_car_id IN (SELECT id FROM player_cars WHERE player_id=?)', [pid]);
        await pool.query('DELETE FROM player_cars WHERE player_id=?', [pid]);
        await pool.query('DELETE FROM inspections WHERE player_id=?', [pid]);
        await pool.query('DELETE FROM favorites WHERE player_id=?', [pid]);
        await pool.query('DELETE FROM transactions WHERE player_id=?', [pid]);
        await pool.query('DELETE FROM profit_history WHERE player_id=?', [pid]);
        await pool.query('DELETE FROM factory_orders WHERE player_id=?', [pid]);
        await pool.query('DELETE FROM player_achievements WHERE player_id=?', [pid]);
        await pool.query('SET FOREIGN_KEY_CHECKS = 1');

        await pool.query(`UPDATE player SET 
            balance = 50000, level = 1, xp = 0, xp_needed = 100,
            prestige_score = 0, total_sales = 0, total_buys = 0,
            total_profit = 0, total_loss = 0,
            has_gallery = 0, max_car_slots = 3,
            has_factory_deal = 0, can_custom_build = 0,
            personal_car_id = NULL, risk_level = 0,
            loan_amount = 0, loan_remaining = 0, loan_monthly_payment = 0,
            loan_months_left = 0, loan_missed_payments = 0, is_seized = 0,
            special_porsche_bought = 0, theme = 'dark'
            WHERE id =? `, [pid]
        );

        res.json({ success: true, message: 'Oyun sıfırlandı! <i class="fa-solid fa-rotate-right"></i>' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== BAŞARIMLAR ===================
router.get('/achievements', async (req, res) => {
    try {
        const pid = req.playerId;
        await checkAndUnlockAchievements(pid);

        // Tüm başarımları getir
        const [achievements] = await pool.query('SELECT * FROM achievements ORDER BY category, id');

        // Oyuncunun açtığı başarımları getir
        const [unlocked] = await pool.query(
            'SELECT * FROM player_achievements WHERE player_id = ?', [pid]
        );

        // Toplam ödül istatistikleri
        const [stats] = await pool.query(`
            SELECT 
                COALESCE(SUM(a.reward_money), 0) as totalRewards,
            COALESCE(SUM(a.reward_xp), 0) as totalXP
            FROM player_achievements pa
            JOIN achievements a ON pa.achievement_id = a.id
            WHERE pa.player_id = ? AND pa.is_claimed = 1
            `, [pid]);

        res.json({
            success: true,
            data: {
                achievements,
                unlocked,
                stats: stats[0] || { totalRewards: 0, totalXP: 0 }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== BAŞARIM ÖDÜLÜ TOPLA ===================
router.post('/achievements/claim/:id', async (req, res) => {
    try {
        const achievementId = req.params.id;
        const [achRecord] = await pool.query('SELECT * FROM player_achievements WHERE player_id = ? AND achievement_id = ?', [req.playerId, achievementId]);

        if (achRecord.length === 0) return res.json({ success: false, error: 'Bu başarımı henüz kazanmadınız!' });
        if (achRecord[0].is_claimed === 1) return res.json({ success: false, error: 'Ödülü zaten topladınız!' });

        const [achievement] = await pool.query('SELECT * FROM achievements WHERE id = ?', [achievementId]);
        if (achievement.length === 0) return res.json({ success: false, error: 'Başarım bulunamadı!' });

        const ach = achievement[0];

        await pool.query('UPDATE player_achievements SET is_claimed = 1 WHERE player_id = ? AND achievement_id = ?', [req.playerId, ach.id]);
        await pool.query('UPDATE player SET balance = balance + ?, xp = xp + ? WHERE id = ?', [ach.reward_money, ach.reward_xp, req.playerId]);
        await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "income", ?, ?)', [req.playerId, ach.reward_money, `Başarım Ödülü: ${ach.name}`]);
        await pool.query('INSERT INTO profit_history (player_id, type, amount, description) VALUES (?, "income", ?, ?)', [req.playerId, ach.reward_money, `Başarım Ödülü: ${ach.name}`]);

        await checkLevelUp(req.playerId);
        await pool.query('INSERT INTO notifications (player_id, type, title, message) VALUES (?, "system", "Başarım Ödülü Alındı!", ?)', [req.playerId, `Tebrikler, '${ach.name}' başarımını tamamladınız ve ${ach.reward_money.toLocaleString('tr-TR')}₺ ile ${ach.reward_xp} XP kazandınız.`]);


        res.json({ success: true, message: `Ödül toplandı: ${ach.reward_money.toLocaleString('tr-TR')}₺ | +${ach.reward_xp} XP` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Başarım kontrolü ve ödül verme helper
async function checkAndUnlockAchievements(playerId) {
    try {
        const [player] = await pool.query('SELECT * FROM player WHERE id = ?', [playerId]);
        if (!player.length) return;
        const p = player[0];

        const [achievements] = await pool.query('SELECT * FROM achievements');
        const [unlocked] = await pool.query('SELECT achievement_id FROM player_achievements WHERE player_id = ?', [playerId]);
        const unlockedIds = unlocked.map(u => u.achievement_id);

        for (const ach of achievements) {
            if (unlockedIds.includes(ach.id)) continue;

            let shouldUnlock = false;

            switch (ach.condition_type) {
                case 'total_sales':
                    shouldUnlock = p.total_sales >= ach.condition_value;
                    break;
                case 'total_buys':
                    shouldUnlock = p.total_buys >= ach.condition_value;
                    break;
                case 'total_profit':
                    shouldUnlock = p.total_profit >= ach.condition_value;
                    break;
                case 'level':
                    shouldUnlock = p.level >= ach.condition_value;
                    break;
                case 'prestige':
                    shouldUnlock = p.prestige_score >= ach.condition_value;
                    break;
                case 'balance':
                    shouldUnlock = p.balance >= ach.condition_value;
                    break;
                case 'has_gallery':
                    shouldUnlock = p.has_gallery === 1;
                    break;
                case 'has_factory':
                    shouldUnlock = p.has_factory_deal === 1;
                    break;
                case 'car_count':
                    const [carCount] = await pool.query('SELECT COUNT(*) as cnt FROM player_cars WHERE player_id = ?', [playerId]);
                    shouldUnlock = carCount[0].cnt >= ach.condition_value;
                    break;
            }

            if (shouldUnlock) {
                await pool.query('INSERT INTO player_achievements (player_id, achievement_id, is_claimed) VALUES (?, ?, 0)', [playerId, ach.id]);
            }
        }
    } catch (err) {
        console.error('Achievement check error:', err);
    }
}

// =================== YARIŞLAR / ORGANİZATÖR ===================
router.get('/races', async (req, res) => {
    try {
        const [races] = await pool.query(`
            SELECT r.*,
            (SELECT COUNT(*) FROM race_participants WHERE race_id = r.id) as current_participants 
            FROM races r 
            WHERE r.status = 'pending' 
            ORDER BY r.starts_at ASC
            `);
        res.json({ success: true, races });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/race/join', async (req, res) => {
    try {
        const playerId = req.playerId;
        const { raceId, carId } = req.body;

        if (!raceId || !carId) return res.json({ success: false, error: 'Yarış ve araç seçilmeli.' });

        const [races] = await pool.query('SELECT * FROM races WHERE id = ? AND status = "pending"', [raceId]);
        if (races.length === 0) return res.json({ success: false, error: 'Yarış bulunamadı veya çoktan başladı.' });
        const race = races[0];

        // Kayıtlı kişi sayısı kontrolü
        const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM race_participants WHERE race_id = ?', [raceId]);
        if (count >= race.max_participants) return res.json({ success: false, error: 'Bu yarışın kontenjanı dolmuş!' });

        // Oyuncu kaydı var mı?
        const [existing] = await pool.query('SELECT * FROM race_participants WHERE race_id = ? AND player_id = ?', [raceId, playerId]);
        if (existing.length > 0) return res.json({ success: false, error: 'Bu yarışa zaten katıldınız!' });

        // Aracın kontrolü
        const [cars] = await pool.query('SELECT * FROM player_cars WHERE id = ? AND player_id = ?', [carId, playerId]);
        if (cars.length === 0) return res.json({ success: false, error: 'Geçersiz araç!' });

        // Bakiye kontrolü
        const [players] = await pool.query('SELECT balance FROM player WHERE id = ?', [playerId]);
        if (players[0].balance < race.entry_fee) return res.json({ success: false, error: 'Bu yarışa girmek için bakiyeniz yetersiz.' });

        // Ücreti al ve katılımcı olarak ekle
        await pool.query('UPDATE player SET balance = balance - ? WHERE id = ?', [race.entry_fee, playerId]);
        await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES (?, "expense", ?, "Yarış Katılım Ücreti")', [playerId, race.entry_fee]);
        await pool.query('INSERT INTO race_participants (race_id, player_id, car_id) VALUES (?, ?, ?)', [raceId, playerId, carId]);

        res.json({ success: true, message: 'Yarışa başarıyla kayıt oldunuz!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================== İSİM DEĞİŞTİRME ===================
router.put('/change-name', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.json({ success: false, error: 'İsim boş olamaz!' });
        }
        if (name.length > 50) {
            return res.json({ success: false, error: 'İsim maksimum 50 karakter olabilir.' });
        }

        // HTML taglerini temizle
        const sanitized = name.replace(/<[^>]*>?/gm, '').trim();

        await pool.query('UPDATE player SET name = ? WHERE id = ?', [sanitized, req.playerId]);

        res.json({ success: true, message: 'Profil isminiz başarıyla güncellendi!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
module.exports.checkAndUnlockAchievements = checkAndUnlockAchievements;
