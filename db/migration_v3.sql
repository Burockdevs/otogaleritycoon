-- ============================================
-- MIGRATION: Banka ve Fatura Sistemi (v3)
-- ============================================

-- Yeni fatura tablosu
CREATE TABLE IF NOT EXISTS player_bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    type ENUM('tax', 'bill', 'fine') DEFAULT 'bill',
    amount DECIMAL(15,2) NOT NULL,
    description VARCHAR(255),
    due_date DATETIME NOT NULL,
    status ENUM('pending', 'paid', 'overdue') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP NULL,
    FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE
);

-- Player tablosuna haciz bayrağı ekleme (Eğer yoksa)
-- Not: Bazı veritabanı sürümlerinde 'IF NOT EXISTS' sütun ekleme desteği olmayabilir.
-- Hata almamak için sütun kontrolü yapılabilir ancak basitlik için ALTER komutu veriyoruz.
-- Eğer sütun zaten varsa script hata verebilir, bu normaldir.
ALTER TABLE player ADD COLUMN is_seized TINYINT(1) DEFAULT 0;
