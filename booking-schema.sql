CREATE TABLE IF NOT EXISTS mks_listings (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, name VARCHAR(160) NOT NULL, location VARCHAR(120) NOT NULL, type VARCHAR(80) NOT NULL,
 price DECIMAL(12,2) NOT NULL DEFAULT 0, capacity SMALLINT UNSIGNED NOT NULL, image VARCHAR(1024), description TEXT,
 verified BOOLEAN NOT NULL DEFAULT FALSE, demo BOOLEAN NOT NULL DEFAULT FALSE,
 latitude DECIMAL(9,6), longitude DECIMAL(9,6), address VARCHAR(400), gallery JSON, rules TEXT,
 pure_veg BOOLEAN, cancel_hours SMALLINT UNSIGNED NOT NULL DEFAULT 0, cancel_refund_bps SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 INDEX location_type(location,type), CHECK(cancel_refund_bps <= 10000)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_listing_amenities (
 listing_id INT UNSIGNED NOT NULL, amenity VARCHAR(120) NOT NULL, PRIMARY KEY(listing_id,amenity),
 FOREIGN KEY(listing_id) REFERENCES mks_listings(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_listing_distances (
 listing_id INT UNSIGNED NOT NULL, landmark VARCHAR(120) NOT NULL, distance_km DECIMAL(8,2) UNSIGNED NOT NULL, PRIMARY KEY(listing_id,landmark),
 FOREIGN KEY(listing_id) REFERENCES mks_listings(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_room_types (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, listing_id INT UNSIGNED NOT NULL, name VARCHAR(120) NOT NULL, capacity SMALLINT UNSIGNED NOT NULL,
 description TEXT, images JSON, FOREIGN KEY(listing_id) REFERENCES mks_listings(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_room_nights (
 room_type_id INT UNSIGNED NOT NULL, date DATE NOT NULL, remaining SMALLINT UNSIGNED NOT NULL, rate_minor INT UNSIGNED NOT NULL,
 tax_bps SMALLINT UNSIGNED NOT NULL, PRIMARY KEY(room_type_id,date), FOREIGN KEY(room_type_id) REFERENCES mks_room_types(id),
 CHECK(tax_bps <= 10000)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_guest_reviews (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, listing_id INT UNSIGNED NOT NULL, rating TINYINT UNSIGNED NOT NULL, comment TEXT,
 verified_stay BOOLEAN NOT NULL DEFAULT FALSE, published BOOLEAN NOT NULL DEFAULT FALSE,
 INDEX(listing_id,verified_stay,published), FOREIGN KEY(listing_id) REFERENCES mks_listings(id), CHECK(rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_guest_booking_locks (
 owner_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_bookings (
 reference VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, listing_id INT UNSIGNED NOT NULL,
 room_type_id INT UNSIGNED NOT NULL, checkin DATE NOT NULL, checkout DATE NOT NULL, rooms SMALLINT UNSIGNED NOT NULL, guests SMALLINT UNSIGNED NOT NULL,
 owner_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, idempotency_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, guest_name VARCHAR(120) NOT NULL, guest_email VARCHAR(254) NOT NULL, guest_phone VARCHAR(30) NOT NULL,
 quote JSON NOT NULL, total INT UNSIGNED NOT NULL, cancel_until DATETIME NOT NULL, refund_bps SMALLINT UNSIGNED NOT NULL,
 status ENUM('held','confirmed','expired','cancelled') NOT NULL, expires_at DATETIME NOT NULL,
 gateway_order VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin UNIQUE, payment_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin,
 payment_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin UNIQUE, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(owner_hash,idempotency_key), INDEX(status,expires_at), INDEX(listing_id,created_at),
 FOREIGN KEY(listing_id) REFERENCES mks_listings(id), FOREIGN KEY(room_type_id) REFERENCES mks_room_types(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_payments (
 id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, reference VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 amount INT UNSIGNED NOT NULL, refund_amount INT UNSIGNED, refund_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin UNIQUE,
 refund_status ENUM('queued','pending','processed','failed'), FOREIGN KEY(reference) REFERENCES mks_bookings(reference)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_webhook_events (
 id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_booking_jobs (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, kind ENUM('email','refund') NOT NULL,
 dedupe_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, payload JSON NOT NULL,
 attempts INT UNSIGNED NOT NULL DEFAULT 0, run_after DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, lease CHAR(36),
 done BOOLEAN NOT NULL DEFAULT FALSE, UNIQUE(kind,dedupe_key), INDEX(kind,done,run_after)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_hotel_access (
 listing_id INT UNSIGNED NOT NULL, token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(listing_id,token_hash), INDEX(token_hash), FOREIGN KEY(listing_id) REFERENCES mks_listings(id)
) ENGINE=InnoDB;
