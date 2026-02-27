-- ############################################################
-- ## KRİTİK GÜVENLİ MİGRASYON (v3)                          ##
-- ## BU SCRIPT MEVCUT VERİLERİ SİLMEZ, SADECE EKLEME YAPAR. ##
-- ############################################################

-- 1. ADIM: Yeni fatura tablosunu oluştur (Eğer daha önce eklenmediyse)
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. ADIM: Player tablosuna 'is_seized' yetkisi/durumu ekle
-- Sütun zaten varsa hata vermemesi için prosedür kullanıyoruz (MySQL 5.7+ / 8.0+)
DROP PROCEDURE IF EXISTS AddIsSeizedColumn;
DELIMITER //
CREATE PROCEDURE AddIsSeizedColumn()
BEGIN
    -- Sütun var mı kontrol et
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'player'
        AND COLUMN_NAME = 'is_seized'
    ) THEN
        -- Sütun yoksa ekle
        ALTER TABLE player ADD COLUMN is_seized TINYINT(1) DEFAULT 0 AFTER loan_missed_payments;
    END IF;
END //
DELIMITER ;

-- Prosedürü çalıştır
CALL AddIsSeizedColumn();

-- Prosedürü temizle
DROP PROCEDURE IF EXISTS AddIsSeizedColumn;

-- ############################################################
-- ## MİGRASYON TAMAMLANDI.                                  ##
-- ############################################################
