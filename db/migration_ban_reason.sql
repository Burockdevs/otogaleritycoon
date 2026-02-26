-- OtoGaleri Tycoon - Migration: ban_reason sütunu ekleme
-- Bu script mevcut verilere dokunmaz, sadece yeni bir nullable sütun ekler.
-- Çalıştırma: mysql -u root -p galeri_simulator < db/migration_ban_reason.sql

ALTER TABLE player ADD COLUMN ban_reason VARCHAR(255) DEFAULT NULL AFTER ban_until;
