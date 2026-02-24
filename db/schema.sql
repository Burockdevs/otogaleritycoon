-- ============================================
-- ARAÇ GALERİSİ SİMÜLATÖR - Veritabanı Şeması
-- Tüm tablolar birleşik (v2 dahil)
-- ============================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS installment_payments;
DROP TABLE IF EXISTS staff;
DROP TABLE IF EXISTS gallery_upgrades;
DROP TABLE IF EXISTS market_trends;
DROP TABLE IF EXISTS player_achievements;
DROP TABLE IF EXISTS achievements;
DROP TABLE IF EXISTS profit_history;
DROP TABLE IF EXISTS inspections;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS custom_options;
DROP TABLE IF EXISTS factory_orders;
DROP TABLE IF EXISTS factory_deals;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS offers;
DROP TABLE IF EXISTS listings;
DROP TABLE IF EXISTS illegal_mods;
DROP TABLE IF EXISTS player_cars;
DROP TABLE IF EXISTS car_parts;
DROP TABLE IF EXISTS cars;
DROP TABLE IF EXISTS models;
DROP TABLE IF EXISTS brands;
DROP TABLE IF EXISTS treasury_logs;
DROP TABLE IF EXISTS treasury;
DROP TABLE IF EXISTS npc_buyers;
DROP TABLE IF EXISTS feedbacks;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS player;

-- FOREIGN_KEY_CHECKS = 1 dosyanın sonunda

-- =================== MARKALAR ===================
CREATE TABLE brands (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    country VARCHAR(100),
    prestige INT DEFAULT 5,
    logo_emoji VARCHAR(255) DEFAULT '/img/logo1.png',
    factory_country VARCHAR(100) DEFAULT 'Türkiye',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =================== MODELLER ===================
CREATE TABLE models (
    id INT AUTO_INCREMENT PRIMARY KEY,
    brand_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    body_type VARCHAR(50) DEFAULT 'Sedan',
    tier INT DEFAULT 2,
    base_price DECIMAL(15,2),
    popularity_multiplier DECIMAL(4,2) DEFAULT 1.00,
    lansoman_color VARCHAR(50) DEFAULT 'Beyaz',
    fuel_type VARCHAR(30) DEFAULT 'Benzin',
    transmission VARCHAR(30) DEFAULT 'Manuel',
    engine_size DECIMAL(3,1) DEFAULT 1.6,
    horsepower INT DEFAULT 120,
    top_speed INT DEFAULT 180,
    torque INT DEFAULT 200,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id) REFERENCES brands(id)
);

-- =================== ARAÇLAR ===================
CREATE TABLE cars (
    id INT AUTO_INCREMENT PRIMARY KEY,
    brand_id INT NOT NULL,
    model_id INT NOT NULL,
    year INT NOT NULL,
    km INT DEFAULT 0,
    price DECIMAL(15,2) NOT NULL,
    color VARCHAR(50),
    interior VARCHAR(50) DEFAULT 'Kumaş',
    interior_color VARCHAR(50) DEFAULT 'Siyah',
    fuel_type VARCHAR(30),
    transmission VARCHAR(30),
    engine_size DECIMAL(3,1),
    horsepower INT DEFAULT 100,
    top_speed INT DEFAULT 180,
    torque INT DEFAULT 200,
    motor_health INT DEFAULT 100,
    damage_status ENUM('Hasarsız','Çizik','Boyalı','Değişen','Hasarlı','Pert') DEFAULT 'Hasarsız',
    damage_details TEXT,
    engine_status ENUM('Mükemmel','İyi','Orta','Kötü','Ölü') DEFAULT 'İyi',
    body_type VARCHAR(50) DEFAULT 'Sedan',
    seller_type VARCHAR(50) DEFAULT 'Galeri',
    owner_type ENUM('market','player','junkyard') DEFAULT 'market',
    is_available TINYINT(1) DEFAULT 1,
    cleanliness INT DEFAULT 80,
    tint_level INT DEFAULT 0,
    description TEXT,
    is_special_series TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id) REFERENCES brands(id),
    FOREIGN KEY (model_id) REFERENCES models(id)
);

-- =================== ARAÇ PARÇALARI ===================
CREATE TABLE car_parts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    car_id INT NOT NULL,
    part_name VARCHAR(100),
    status ENUM('Orijinal','Çizik','Boyalı','Değişen','Hasarlı','Yok') DEFAULT 'Orijinal',
    quality INT DEFAULT 100,
    is_original TINYINT(1) DEFAULT 1,
    part_type VARCHAR(50) DEFAULT 'body',
    FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
);

-- =================== OYUNCU ===================
CREATE TABLE player (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) DEFAULT 'Oyuncu',
    balance DECIMAL(15,2) DEFAULT 50000.00,
    level INT DEFAULT 1,
    xp INT DEFAULT 0,
    xp_needed INT DEFAULT 100,
    prestige_score INT DEFAULT 0,
    total_sales INT DEFAULT 0,
    total_buys INT DEFAULT 0,
    total_profit DECIMAL(15,2) DEFAULT 0,
    total_loss DECIMAL(15,2) DEFAULT 0,
    has_gallery TINYINT(1) DEFAULT 0,
    gallery_name VARCHAR(100) DEFAULT NULL,
    max_car_slots INT DEFAULT 3,
    has_factory_deal TINYINT(1) DEFAULT 0,
    can_custom_build TINYINT(1) DEFAULT 0,
    personal_car_id INT DEFAULT NULL,
    risk_level DECIMAL(5,2) DEFAULT 0,
    loan_amount DECIMAL(15,2) DEFAULT 0,
    loan_remaining DECIMAL(15,2) DEFAULT 0,
    loan_monthly_payment DECIMAL(15,2) DEFAULT 0,
    loan_months_left INT DEFAULT 0,
    loan_missed_payments INT DEFAULT 0,
    is_seized TINYINT(1) DEFAULT 0,
    special_porsche_bought TINYINT(1) DEFAULT 0,
    theme VARCHAR(10) DEFAULT 'dark',
    avatar VARCHAR(255) DEFAULT '/img/logo2.png',
    reputation INT DEFAULT 50,
    review_count INT DEFAULT 0,
    gallery_floor_level INT DEFAULT 1,
    gallery_lighting_level INT DEFAULT 1,
    gallery_lounge_level INT DEFAULT 0,
    last_daily_reset TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tos_accepted TINYINT(1) DEFAULT 0,
    tos_accepted_at TIMESTAMP NULL,
    -- v2 eklenen sütunlar
    daily_instant_sells INT DEFAULT 0,
    last_instant_sell_reset DATE DEFAULT NULL,
    is_admin TINYINT(1) DEFAULT 0,
    is_banned TINYINT(1) DEFAULT 0,
    ban_until TIMESTAMP NULL,
    trade_ban_until TIMESTAMP NULL,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =================== OYUNCU ARAÇLARI ===================
CREATE TABLE player_cars (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    car_id INT NOT NULL,
    buy_price DECIMAL(15,2),
    expenses DECIMAL(15,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (car_id) REFERENCES cars(id),
    FOREIGN KEY (player_id) REFERENCES player(id)
);

-- =================== İLLEGAL MODİFİKASYONLAR ===================
CREATE TABLE illegal_mods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_car_id INT NOT NULL,
    mod_type VARCHAR(100) NOT NULL,
    mod_name VARCHAR(150) NOT NULL,
    mod_tier VARCHAR(20) DEFAULT 'ucuz',
    hp_bonus INT DEFAULT 0,
    torque_bonus INT DEFAULT 0,
    speed_bonus INT DEFAULT 0,
    price_bonus DECIMAL(15,2) DEFAULT 0,
    risk_percent DECIMAL(5,2) DEFAULT 20,
    cost DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_car_id) REFERENCES player_cars(id) ON DELETE CASCADE
);

-- =================== İLANLAR ===================
CREATE TABLE listings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    car_id INT NOT NULL,
    player_car_id INT NOT NULL,
    listing_type ENUM('normal') DEFAULT 'normal',
    asking_price DECIMAL(15,2),
    market_value DECIMAL(15,2),
    suggested_price DECIMAL(15,2),
    offer_count INT DEFAULT 0,
    max_offers INT DEFAULT 20,
    installment_months INT DEFAULT 0,
    installment_rate DECIMAL(5,2) DEFAULT 0,
    total_with_interest DECIMAL(15,2) DEFAULT 0,
    status ENUM('active','sold','cancelled') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (car_id) REFERENCES cars(id),
    FOREIGN KEY (player_car_id) REFERENCES player_cars(id)
);

-- =================== NPC ALICILAR ===================
CREATE TABLE npc_buyers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    type ENUM('pazarlikci','normal','comert') DEFAULT 'normal',
    avatar VARCHAR(10) DEFAULT '👤',
    wealth_level INT DEFAULT 1 -- 1: Fakir, 2: Orta, 3: Zengin, 4: Milyoner
);

-- =================== TEKLİFLER ===================
CREATE TABLE offers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    listing_id INT NOT NULL,
    npc_id INT,
    offer_price DECIMAL(15,2),
    message VARCHAR(255) DEFAULT NULL,
    status ENUM('pending','accepted','rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- FOREIGN KEY (listing_id) removed to prevent constraint issues,
    FOREIGN KEY (npc_id) REFERENCES npc_buyers(id)
);

-- =================== PERSONEL ===================
CREATE TABLE staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    name VARCHAR(100),
    role ENUM('sales','mechanic','detailer','security') NOT NULL,
    level INT DEFAULT 1,
    salary DECIMAL(10,2),
    efficiency DECIMAL(5,2) DEFAULT 1.0,
    hired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE
);

-- =================== GALERİ GELİŞTİRMELERİ ===================
CREATE TABLE gallery_upgrades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    upgrade_type VARCHAR(50),
    level INT DEFAULT 1,
    prestige_bonus INT DEFAULT 0,
    cost DECIMAL(15,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE
);

-- =================== SİSTEM AYARLARI ===================
CREATE TABLE IF NOT EXISTS system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value VARCHAR(255) NOT NULL,
    description TEXT
);

-- =================== KREDİ İSTEKLERİ ===================
CREATE TABLE IF NOT EXISTS loan_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    months INT NOT NULL DEFAULT 12,
    reason TEXT,
    status ENUM('pending', 'approved', 'rejected', 'counter_offer', 'accepted') DEFAULT 'pending',
    counter_amount DECIMAL(15,2) DEFAULT NULL,
    admin_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES player(id)
);


-- =================== PİYASA TRENDLERİ ===================
CREATE TABLE market_trends (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_name VARCHAR(100),
    name VARCHAR(100),
    type VARCHAR(50) DEFAULT 'neutral',
    description TEXT,
    affected_type VARCHAR(50),
    multiplier DECIMAL(5,2),
    effect VARCHAR(255),
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    is_active TINYINT(1) DEFAULT 1
);

-- =================== İŞLEMLER ===================
CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    type VARCHAR(50),
    amount DECIMAL(15,2),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =================== HAZİNE (TREASURY) ===================
CREATE TABLE treasury (
    id INT AUTO_INCREMENT PRIMARY KEY,
    balance DECIMAL(15,2) DEFAULT 0,
    total_income DECIMAL(15,2) DEFAULT 0,
    total_expense DECIMAL(15,2) DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- İlk kayıt
INSERT INTO treasury (balance, total_income, total_expense) VALUES (0, 0, 0);

CREATE TABLE treasury_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('income', 'expense') NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =================== FABRİKA ANLAŞMALARI ===================
CREATE TABLE factory_deals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    brand_id INT,
    discount_rate DECIMAL(5,2) DEFAULT 15.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =================== FABRİKA SİPARİŞLERİ ===================
CREATE TABLE factory_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    brand_id INT NOT NULL,
    model_id INT NOT NULL,
    quantity INT DEFAULT 1,
    unit_price DECIMAL(15,2),
    shipping_cost DECIMAL(15,2) DEFAULT 0,
    tax_cost DECIMAL(15,2) DEFAULT 0,
    total_cost DECIMAL(15,2),
    status ENUM('pending','shipped','delivered') DEFAULT 'pending',
    delivery_time INT DEFAULT 60,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP NULL
);

-- =================== ÖZEL SEÇENEKLERİ ===================
CREATE TABLE custom_options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(100),
    name VARCHAR(100),
    description TEXT,
    price_multiplier DECIMAL(5,2) DEFAULT 1.0
);

-- =================== FAVORİLER ===================
CREATE TABLE favorites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    car_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_favorite (player_id, car_id),
    FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
);

-- =================== EXPERTİZ ===================
CREATE TABLE inspections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    car_id INT NOT NULL,
    score INT DEFAULT 0,
    verdict VARCHAR(50),
    issues JSON,
    cost DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
);

-- =================== KÂR/ZARAR GEÇMİŞİ ===================
CREATE TABLE profit_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    type ENUM('income','expense') DEFAULT 'expense',
    amount DECIMAL(15,2),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =================== BAŞARIMLAR ===================
CREATE TABLE achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(10) DEFAULT '🎖️',
    category VARCHAR(50) DEFAULT 'trading',
    condition_type VARCHAR(50) NOT NULL,
    condition_value INT DEFAULT 0,
    reward_money DECIMAL(15,2) DEFAULT 0,
    reward_xp INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =================== OYUNCU BAŞARIMLARI ===================
CREATE TABLE player_achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    achievement_id INT NOT NULL,
    is_claimed TINYINT(1) DEFAULT 0,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_player_achievement (player_id, achievement_id),
    FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE,
    FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
);

-- =================== GERİ BİLDİRİMLER ===================
CREATE TABLE feedbacks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    type ENUM('bug','suggestion','complaint','other') DEFAULT 'other',
    subject VARCHAR(200),
    message TEXT NOT NULL,
    status ENUM('open','in_progress','resolved','closed') DEFAULT 'open',
    admin_reply TEXT DEFAULT NULL,
    replied_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE
);

-- =================== İŞLETME YORUMLARI ===================
CREATE TABLE business_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    reviewer_name VARCHAR(100) NOT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 10),
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE,
    INDEX idx_player_reviews (player_id, created_at DESC)
);

-- =================== BİLDİRİMLER ===================
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    title VARCHAR(200),
    message TEXT,
    details TEXT,
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE
);

-- =================== TAKSİT ÖDEMELERİ ===================
CREATE TABLE installment_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    listing_id INT NOT NULL,
    seller_id INT NOT NULL,
    buyer_npc_id INT,
    installment_number INT NOT NULL,
    total_installments INT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    status ENUM('pending','paid','overdue') DEFAULT 'pending',
    due_day INT DEFAULT 0,
    paid_at TIMESTAMP NULL,
    car_name VARCHAR(255) DEFAULT 'Belirsiz Araç',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES player(id) ON DELETE CASCADE
);

-- =================== PERFORMANS İNDEKSLERİ ===================
CREATE INDEX idx_cars_owner ON cars(owner_type, is_available);
CREATE INDEX idx_cars_brand ON cars(brand_id);
CREATE INDEX idx_cars_model ON cars(model_id);
CREATE INDEX idx_cars_price ON cars(price);
CREATE INDEX idx_listings_status ON listings(status, player_id);
CREATE INDEX idx_listings_player ON listings(player_id);
CREATE INDEX idx_player_cars_player ON player_cars(player_id);
CREATE INDEX idx_offers_listing ON offers(listing_id);
CREATE INDEX idx_transactions_player ON transactions(player_id);
CREATE INDEX idx_profit_history_player ON profit_history(player_id);
CREATE INDEX idx_favorites_player ON favorites(player_id);
CREATE INDEX idx_player_prestige ON player(prestige_score);
CREATE INDEX idx_player_level ON player(level);
CREATE INDEX idx_feedbacks_player ON feedbacks(player_id);
CREATE INDEX idx_feedbacks_status ON feedbacks(status);
CREATE INDEX idx_notifications_player ON notifications(player_id, is_read);
CREATE INDEX idx_installment_seller ON installment_payments(seller_id, status);

-- =================== BAŞLANGIÇ VERİLERİ ===================

-- NPC Alıcılar (100 NPC - zenginlik seviyeleri dahil)
INSERT INTO npc_buyers (name, type, avatar, wealth_level) VALUES
-- Pazarlıkçılar (30)
('Ahmet K.', 'pazarlikci', 'avatar-m-1', 1),
('Ali R.', 'pazarlikci', 'avatar-m-3', 1),
('Mustafa D.', 'pazarlikci', 'avatar-m-5', 2),
('Yusuf Ö.', 'pazarlikci', 'avatar-m-7', 1),
('Kemal G.', 'pazarlikci', 'avatar-m-9', 2),
('Hakan U.', 'pazarlikci', 'avatar-m-12', 1),
('Burak İ.', 'pazarlikci', 'avatar-m-13', 3),
('Serkan V.', 'pazarlikci', 'avatar-m-15', 1),
('Volkan A.', 'pazarlikci', 'avatar-m-16', 2),
('Cem D.', 'pazarlikci', 'avatar-m-18', 1),
('Baran F.', 'pazarlikci', 'avatar-m-19', 2),
('Kaan J.', 'pazarlikci', 'avatar-m-21', 3),
('Deniz L.', 'pazarlikci', 'avatar-m-22', 1),
('Arda P.', 'pazarlikci', 'avatar-m-24', 2),
('Murat S.', 'pazarlikci', 'avatar-m-25', 1),
('Ferhat Y.', 'pazarlikci', 'avatar-m-27', 1),
('İlker A.', 'pazarlikci', 'avatar-m-28', 2),
('Tarık B.', 'pazarlikci', 'avatar-m-29', 1),
('Rıza C.', 'pazarlikci', 'avatar-m-30', 3),
('Nedim D.', 'pazarlikci', 'avatar-m-31', 1),
('Polat E.', 'pazarlikci', 'avatar-m-32', 2),
('Uğur F.', 'pazarlikci', 'avatar-m-33', 1),
('Yılmaz G.', 'pazarlikci', 'avatar-m-34', 4),
('Zafer H.', 'pazarlikci', 'avatar-m-35', 1),
('Orhan İ.', 'pazarlikci', 'avatar-m-36', 2),
('Selçuk J.', 'pazarlikci', 'avatar-m-37', 1),
('Turgut K.', 'pazarlikci', 'avatar-m-38', 2),
('Vedat L.', 'pazarlikci', 'avatar-m-39', 1),
('Cengiz M.', 'pazarlikci', 'avatar-m-40', 3),
('Adem N.', 'pazarlikci', 'avatar-m-41', 1),
-- Normal (40)
('Mehmet Y.', 'normal', 'avatar-m-2', 2),
('Hüseyin E.', 'normal', 'avatar-m-4', 1),
('Emre S.', 'normal', 'avatar-m-6', 2),
('İbrahim C.', 'normal', 'avatar-m-8', 3),
('Osman Ç.', 'normal', 'avatar-m-10', 1),
('Nermin F.', 'normal', 'avatar-f-6', 2),
('Turan M.', 'normal', 'avatar-m-14', 1),
('Ebru Z.', 'normal', 'avatar-f-9', 2),
('Tolga B.', 'normal', 'avatar-m-17', 3),
('Nalan E.', 'normal', 'avatar-f-12', 1),
('Oğuz H.', 'normal', 'avatar-m-20', 2),
('Leyla K.', 'normal', 'avatar-f-15', 1),
('Erdem N.', 'normal', 'avatar-m-23', 2),
('Gülay R.', 'normal', 'avatar-f-18', 1),
('Cenk U.', 'normal', 'avatar-m-26', 3),
('Gamze Z.', 'normal', 'avatar-f-21', 2),
('Halil Ö.', 'normal', 'avatar-m-42', 1),
('Sevim P.', 'normal', 'avatar-f-23', 2),
('Recep R.', 'normal', 'avatar-m-43', 1),
('Naciye S.', 'normal', 'avatar-f-24', 3),
('Kadir T.', 'normal', 'avatar-m-44', 2),
('Hatice U.', 'normal', 'avatar-f-25', 1),
('Şükrü V.', 'normal', 'avatar-m-45', 2),
('Filiz Y.', 'normal', 'avatar-f-26', 4),
('Bayram Z.', 'normal', 'avatar-m-46', 1),
('Gönül A.', 'normal', 'avatar-f-27', 2),
('Hamza B.', 'normal', 'avatar-m-47', 1),
('Nurhan C.', 'normal', 'avatar-f-28', 2),
('Savaş D.', 'normal', 'avatar-m-48', 3),
('Perihan E.', 'normal', 'avatar-f-29', 1),
('Yıldırım F.', 'normal', 'avatar-m-49', 2),
('Aysun G.', 'normal', 'avatar-f-30', 1),
('Doğan H.', 'normal', 'avatar-m-50', 4),
('Müge İ.', 'normal', 'avatar-f-31', 2),
('Ercan J.', 'normal', 'avatar-m-51', 1),
('Şerife K.', 'normal', 'avatar-f-32', 2),
('Nihat L.', 'normal', 'avatar-m-52', 1),
('Seher M.', 'normal', 'avatar-f-33', 3),
('Coşkun N.', 'normal', 'avatar-m-53', 2),
('Birsen Ö.', 'normal', 'avatar-f-34', 1),
-- Cömertler (30)
('Fatma H.', 'comert', 'avatar-f-1', 3),
('Ayşe T.', 'comert', 'avatar-f-2', 2),
('Zeynep B.', 'comert', 'avatar-f-3', 3),
('Gül A.', 'comert', 'avatar-f-4', 4),
('Derya N.', 'comert', 'avatar-f-5', 2),
('Selim P.', 'comert', 'avatar-m-11', 3),
('Canan L.', 'comert', 'avatar-f-7', 2),
('Elif Ş.', 'comert', 'avatar-f-8', 4),
('Sibel K.', 'comert', 'avatar-f-10', 3),
('Melek C.', 'comert', 'avatar-f-11', 2),
('Hülya İ.', 'comert', 'avatar-f-14', 3),
('Pınar M.', 'comert', 'avatar-f-16', 4),
('Sevgi Ö.', 'comert', 'avatar-f-17', 2),
('Aslı T.', 'comert', 'avatar-f-19', 3),
('Dilek V.', 'comert', 'avatar-f-20', 2),
('Jale B.', 'comert', 'avatar-f-22', 4),
('Burcu Ç.', 'comert', 'avatar-f-35', 3),
('Esra D.', 'comert', 'avatar-f-36', 2),
('Tuğba E.', 'comert', 'avatar-f-37', 3),
('Özge F.', 'comert', 'avatar-f-38', 4),
('Rana G.', 'comert', 'avatar-f-39', 2),
('Selin H.', 'comert', 'avatar-f-40', 3),
('Yasemin İ.', 'comert', 'avatar-f-41', 2),
('Bahar J.', 'comert', 'avatar-f-42', 3),
('Defne K.', 'comert', 'avatar-f-43', 4),
('İpek L.', 'comert', 'avatar-f-44', 3),
('Nehir M.', 'comert', 'avatar-f-45', 2),
('Cansu N.', 'comert', 'avatar-f-46', 3),
('Dilara Ö.', 'comert', 'avatar-f-47', 2),
('Melisa P.', 'comert', 'avatar-f-48', 4);

-- Özel Araç Seçenekleri
INSERT INTO custom_options (category, name, description, price_multiplier) VALUES
('Motor', 'Turbo Şarj', 'Güçlendirilmiş motor, +50HP', 1.25),
('Motor', 'Çift Turbo', 'Çift turbo sistem, +100HP', 1.50),
('Motor', 'Süper Şarj', 'Süper şarj, +150HP', 1.80),
('Motor', 'Nitro Sistemi', 'NOS sistemi, +80HP anlık güç', 1.35),
('İç Mekan', 'Alcantara Döşeme', 'Premium Alcantara iç döşeme', 1.10),
('İç Mekan', 'Full Deri', 'Tam deri döşeme', 1.15),
('İç Mekan', 'Karbon İç Trim', 'Karbon fiber iç aksamlar', 1.20),
('İç Mekan', 'Sedef Koltuk', 'Sedef işlemeli özel koltuk', 1.30),
('İç Mekan', 'Altın Detay Trim', 'Altın kaplama iç detaylar', 1.45),
('Dış Görünüm', 'Wide Body Kit', 'Geniş gövde kiti', 1.15),
('Dış Görünüm', 'Aero Paket', 'Aerodinamik gövde kiti', 1.12),
('Dış Görünüm', 'Karbon Fiber Detaylar', 'Karbon fiber dış parçalar', 1.18),
('Dış Görünüm', 'Altın Kaplama', 'Full altın kaplama dış', 2.50),
('Dış Görünüm', 'Krom Paket', 'Full krom detay paketi', 1.22),
('Süspansiyon', 'Spor Süspansiyon', 'Sportif süspansiyon ayarları', 1.08),
('Süspansiyon', 'Hava Süspansiyonu', 'Tam ayarlanabilir hava süspansiyonu', 1.20),
('Süspansiyon', 'Coilover Kit', 'Ayarlanabilir coilover seti', 1.12),
('Teknoloji', 'Premium Ses Sistemi', 'Bang & Olufsen ses sistemi', 1.08),
('Teknoloji', 'Head-Up Display', 'Ön cam bilgi yansıtma', 1.06),
('Teknoloji', 'Full Otonom Paket', 'Seviye 3 otonom sürüş', 1.25),
('Teknoloji', 'Gece Görüş Kamerası', 'İnfrared gece görüş sistemi', 1.10),
('Jant', 'Forged Jant 19"', 'Özel dövme alaşım jant', 1.08),
('Jant', 'Forged Jant 21"', 'Büyük özel dövme jant', 1.14),
('Jant', 'Karbon Jant', 'Karbon fiber jant seti', 1.22),
('Fren', 'Seramik Fren', 'Karbon-seramik fren sistemi', 1.15),
('Fren', 'Büyük Fren Kiti', '6 pistonlu büyük fren kiti', 1.10);

-- Başarımlar
INSERT INTO achievements (name, description, icon, category, condition_type, condition_value, reward_money, reward_xp) VALUES
-- Ticaret Başarımları
('İlk Satış', 'İlk aracını sat', 'icon-first-sale', 'trading', 'total_sales', 1, 1000, 50),
('Acemi Satıcı', '5 araç sat', 'icon-beginner-seller', 'trading', 'total_sales', 5, 5000, 100),
('Deneyimli Satıcı', '25 araç sat', 'icon-experienced-seller', 'trading', 'total_sales', 25, 25000, 250),
('Usta Satıcı', '100 araç sat', 'icon-master-seller', 'trading', 'total_sales', 100, 100000, 500),
('Efsane Satıcı', '500 araç sat', 'icon-legend-seller', 'trading', 'total_sales', 500, 500000, 1000),
('İlk Alış', 'İlk aracını al', 'icon-first-buy', 'trading', 'total_buys', 1, 500, 25),
('Koleksiyoner', '50 araç satın al', 'icon-collector', 'trading', 'total_buys', 50, 50000, 300),

-- Zenginlik Başarımları
('İlk Kâr', '10.000₺ kâr et', 'icon-first-profit', 'wealth', 'total_profit', 10000, 2000, 50),
('Başarılı İş İnsanı', '100.000₺ kâr et', 'icon-business', 'wealth', 'total_profit', 100000, 20000, 200),
('Milyoner', '1.000.000₺ kâr et', 'icon-millionaire', 'wealth', 'total_profit', 1000000, 100000, 500),
('Multi-Milyoner', '10.000.000₺ kâr et', 'icon-multi-millionaire', 'wealth', 'total_profit', 10000000, 500000, 1000),
('Zengin', 'Bakiyeniz 500.000₺ olsun', 'icon-rich', 'wealth', 'balance', 500000, 10000, 100),
('Çok Zengin', 'Bakiyeniz 5.000.000₺ olsun', 'icon-very-rich', 'wealth', 'balance', 5000000, 100000, 500),

-- Deneyim Başarımları
('Çaylak', 'Seviye 5 ol', 'icon-rookie', 'experience', 'level', 5, 2500, 0),
('Tecrübeli', 'Seviye 10 ol', 'icon-experienced', 'experience', 'level', 10, 10000, 0),
('Uzman', 'Seviye 25 ol', 'icon-expert', 'experience', 'level', 25, 50000, 0),
('Usta', 'Seviye 40 ol', 'icon-master', 'experience', 'level', 40, 200000, 0),
('Efsane', 'Seviye 50 ol', 'icon-legend', 'experience', 'level', 50, 500000, 0),
('Prestij Başlangıcı', '100 prestij puanı kazan', 'icon-prestige-start', 'experience', 'prestige', 100, 5000, 100),
('Prestij Ustası', '1000 prestij puanı kazan', 'icon-prestige-master', 'experience', 'prestige', 1000, 50000, 500),

-- Koleksiyon Başarımları
('Mini Garaj', 'Aynı anda 3 araca sahip ol', 'icon-mini-garage', 'collection', 'car_count', 3, 3000, 50),
('Büyük Garaj', 'Aynı anda 5 araca sahip ol', 'icon-big-garage', 'collection', 'car_count', 5, 10000, 100),
('Mega Garaj', 'Aynı anda 10 araca sahip ol', 'icon-mega-garage', 'collection', 'car_count', 10, 50000, 250);

-- Özel Başarımlar
INSERT INTO achievements (name, description, icon, category, condition_type, condition_value, reward_money, reward_xp) VALUES
('Galeri Sahibi', 'Kendi galerini aç', 'icon-gallery-owner', 'special', 'has_gallery', 1, 25000, 200),
('Fabrika Ortağı', 'Fabrika anlaşması yap', 'icon-factory-partner', 'special', 'has_factory', 1, 100000, 500);

-- Başlangıç Market Trends
INSERT INTO market_trends (event_name, name, type, description, affected_type, multiplier, effect, is_active) VALUES
('ÖTV Zamı', 'ÖTV Zamı', 'negative', 'Hükümet ÖTV oranlarını artırdı! Araç fiyatları yükseliyor.', 'all', 1.15, 'Tüm araç fiyatlarında %15 artış', 1),
('Döviz Krizi', 'Döviz Krizi', 'negative', 'Dolar/Euro yükseldi! İthal araçlar pahalandı.', 'import', 1.25, 'İthal araçlarda %25 fiyat artışı', 0),
('Ekonomik Teşvik', 'Ekonomik Teşvik', 'positive', 'Hükümet otomotiv sektörüne teşvik paketi açıkladı!', 'all', 0.90, 'Tüm araçlarda %10 fiyat düşüşü', 0),
('Bayram İndirimi', 'Bayram İndirimi', 'positive', 'Kurban bayramı indirimleri başladı!', 'domestic', 0.85, 'Yerli araçlarda %15 indirim', 0),
('Yakıt Krizi', 'Yakıt Zamı', 'mixed', 'Benzin ve motorin fiyatları rekor kırdı!', 'fuel_efficient', 1.20, 'Dizel ve hibrit araçlara talep %20 arttı', 0),
('SUV Trendi', 'SUV Modası', 'positive', 'SUV araçlara talep patlaması!', 'SUV', 1.18, 'SUV fiyatlarında %18 artış', 0),
('Elektrik Devrimi', 'Elektrikli Araç Teşviki', 'positive', 'Elektrikli araçlara ÖTV muafiyeti!', 'electric', 0.70, 'Elektrikli araçlarda %30 indirim', 0),
('Kış Sezonu', 'Kış Geldi', 'mixed', '4x4 ve SUV araçlara talep arttı!', '4x4', 1.12, '4x4 araçlarda %12 fiyat artışı', 0),
('Yaz Tatili', 'Yaz Sezonu', 'positive', 'Tatil sezonu başladı, cabrio ve aile araçlarına talep!', 'convertible', 1.15, 'Cabrio araçlarda %15 artış', 0),
('Faiz İndirimi', 'Merkez Bankası Faiz İndirdi', 'positive', 'Kredi faizleri düştü, araç alımı kolaylaştı!', 'all', 0.92, 'Tüm fiyatlarda %8 düşüş', 0),
('Çip Krizi', 'Global Çip Kıtlığı', 'negative', 'Yarı iletken krizi devam ediyor! Yeni araç üretimi yavaşladı.', 'new', 1.30, 'Sıfır araç fiyatlarında %30 artış', 0),
('İkinci El Patlaması', 'İkinci El Altın Çağı', 'positive', 'İkinci el araç piyasası canlı!', 'used', 1.10, 'İkinci el araçlarda %10 değer artışı', 0),
('Hurda Teşviki', 'Hurda İndirimi', 'positive', 'Eski aracını ver, yenisinde indirim kazan!', 'trade_in', 0.88, 'Takas ile alımlarda %12 indirim', 0),
('Lüks Vergi', 'Lüks Araç Vergisi', 'negative', 'Lüks araç vergisi 2 katına çıktı!', 'luxury', 1.35, 'Lüks araçlarda %35 fiyat artışı', 0),
('Yerli Otomobil', 'TOGG Çılgınlığı', 'positive', 'Yerli otomobil furyası! Yerli markalara ilgi arttı.', 'domestic', 1.08, 'Yerli araçlarda %8 değer artışı', 0),
('Deprem Etkisi', 'Doğal Afet Sonrası', 'negative', 'Deprem bölgesinde araç talebi değişti.', 'all', 0.95, 'Genel piyasada %5 daralma', 0),
('Euro 7 Normu', 'Emisyon Düzenlemesi', 'mixed', 'Euro 7 emisyon normları yürürlükte! Eski dizel araçlar değer kaybediyor.', 'diesel_old', 0.80, 'Eski dizel araçlarda %20 değer kaybı', 0),
('Klasik Araç Fuarı', 'Klasik Otomobil Festivali', 'positive', 'Klasik araç fuarı açıldı! Vintage araçlara ilgi arttı.', 'classic', 1.25, 'Klasik araçlarda %25 değer artışı', 0);

SET FOREIGN_KEY_CHECKS = 1;

-- =================== ORGANİZATÖR YARIŞLARI ===================
CREATE TABLE races (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    entry_fee DECIMAL(15,2) DEFAULT 0,
    max_participants INT DEFAULT 10,
    starts_at DATETIME NOT NULL,
    status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
    is_illegal TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE race_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    race_id INT NOT NULL,
    player_id INT NOT NULL,
    car_id INT NOT NULL,
    status ENUM('registered', 'finished', 'disqualified', 'crashed') DEFAULT 'registered',
    score INT DEFAULT 0,
    reward DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES player(id),
    FOREIGN KEY (car_id) REFERENCES player_cars(id)
);
