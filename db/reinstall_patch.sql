-- ============================================
-- OtoGaleri Tycoon - Reinstallation Schema Patch
-- Purpose: Adds elements missing from full_backup.sql
-- ============================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Create player_bills table (Missing in backup)
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

-- 2. Add ban_reason to player if not exists (Safety check)
-- Note: MySQL 8.0.19+ supports IF NOT EXISTS for ADD COLUMN
-- If using older MySQL, we use a procedure for safety.
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DELIMITER //
CREATE PROCEDURE AddColumnIfNotExists()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'player' 
        AND COLUMN_NAME = 'ban_reason'
    ) THEN
        ALTER TABLE player ADD COLUMN ban_reason VARCHAR(255) DEFAULT NULL AFTER ban_until;
    END IF;
END //
DELIMITER ;
CALL AddColumnIfNotExists();
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;

SET FOREIGN_KEY_CHECKS = 1;
