ALTER TABLE mks_cab_trips ADD COLUMN start_otp_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin, ADD COLUMN start_otp_expires DATETIME;
CREATE TABLE IF NOT EXISTS mks_cab_driver_profiles (
 driver_id INT UNSIGNED PRIMARY KEY, user_id INT UNSIGNED UNIQUE, photo_url VARCHAR(1024),
 license_number VARCHAR(80), license_expires DATE, verification_state ENUM('pending','verified','rejected','suspended') NOT NULL DEFAULT 'pending',
 online BOOLEAN NOT NULL DEFAULT FALSE, last_lat DECIMAL(9,6), last_lon DECIMAL(9,6), last_accuracy DECIMAL(8,2), last_location_at DATETIME,
 payout_account JSON, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(driver_id) REFERENCES mks_cab_drivers(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES mks_ops_users(id) ON DELETE SET NULL,
 INDEX(verification_state,online), INDEX(last_location_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_cab_driver_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, driver_id INT UNSIGNED NOT NULL, trip_id INT UNSIGNED,
 event_type VARCHAR(40) NOT NULL, metadata JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(driver_id) REFERENCES mks_cab_drivers(id) ON DELETE CASCADE, FOREIGN KEY(trip_id) REFERENCES mks_cab_trips(id) ON DELETE SET NULL,
 INDEX(driver_id,created_at)
) ENGINE=InnoDB;
INSERT IGNORE INTO mks_cab_driver_profiles(driver_id) SELECT id FROM mks_cab_drivers;
