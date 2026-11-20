CREATE TABLE IF NOT EXISTS mks_ops_users (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,email VARCHAR(254) NOT NULL UNIQUE,name VARCHAR(120) NOT NULL,
 password_hash VARCHAR(200) NOT NULL, role ENUM('superadmin','staff','host') NOT NULL, permissions JSON NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_ops_sessions (
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,user_id INT UNSIGNED NOT NULL,csrf CHAR(48) NOT NULL,
 expires DATETIME NOT NULL,INDEX(expires),FOREIGN KEY(user_id) REFERENCES mks_ops_users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_ops_login_limits (
 identity_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,attempts SMALLINT UNSIGNED NOT NULL,
 expires DATETIME NOT NULL,INDEX(expires)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_property_workflow (
 listing_id INT UNSIGNED PRIMARY KEY,owner_id INT UNSIGNED,kind VARCHAR(60) NOT NULL,
 state ENUM('draft','submitted','approved','rejected','suspended') NOT NULL DEFAULT 'draft',
 rooms SMALLINT UNSIGNED NOT NULL,beds SMALLINT UNSIGNED NOT NULL,bathrooms SMALLINT UNSIGNED NOT NULL,
 sanitation TEXT,review_note VARCHAR(1000),updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(listing_id) REFERENCES mks_listings(id),FOREIGN KEY(owner_id) REFERENCES mks_ops_users(id),INDEX(owner_id,state)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_property_files (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,listing_id INT UNSIGNED NOT NULL,kind VARCHAR(40) NOT NULL,
 filename VARCHAR(160) NOT NULL,mime VARCHAR(40) NOT NULL,contents MEDIUMBLOB NOT NULL,
 reviewed BOOLEAN NOT NULL DEFAULT FALSE,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(listing_id) REFERENCES mks_listings(id),INDEX(listing_id,kind)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_ops_records (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,area VARCHAR(40) NOT NULL,title VARCHAR(180) NOT NULL,
 email VARCHAR(254),details TEXT NOT NULL,state VARCHAR(30) NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 listing_id INT UNSIGNED,owner_id INT UNSIGNED,INDEX(area,state,id),
 FOREIGN KEY(listing_id) REFERENCES mks_listings(id),FOREIGN KEY(owner_id) REFERENCES mks_ops_users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_ops_audit (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,actor_id INT UNSIGNED NOT NULL,action VARCHAR(64) NOT NULL,
 subject VARCHAR(100) NOT NULL,change_details JSON NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(actor_id) REFERENCES mks_ops_users(id),INDEX(created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_ops_settings (
 id TINYINT PRIMARY KEY,commission_bps SMALLINT UNSIGNED NOT NULL DEFAULT 0,CHECK(commission_bps<=10000)
) ENGINE=InnoDB;
INSERT IGNORE INTO mks_ops_settings(id,commission_bps) VALUES (1,0);
CREATE TABLE IF NOT EXISTS mks_ops_commissions (
 reference VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,commission_bps SMALLINT UNSIGNED NOT NULL,
 FOREIGN KEY(reference) REFERENCES mks_bookings(reference)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_ops_payouts (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,listing_id INT UNSIGNED NOT NULL,amount INT UNSIGNED NOT NULL,external_reference VARCHAR(100) NOT NULL UNIQUE,
 recorded_by INT UNSIGNED NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(listing_id) REFERENCES mks_listings(id),FOREIGN KEY(recorded_by) REFERENCES mks_ops_users(id),INDEX(listing_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_hotel_partners (
 user_id INT UNSIGNED PRIMARY KEY,business_name VARCHAR(160) NOT NULL,business_email VARCHAR(254) NOT NULL,business_phone VARCHAR(30) NOT NULL,
 booking_notifications BOOLEAN NOT NULL DEFAULT TRUE,FOREIGN KEY(user_id) REFERENCES mks_ops_users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_hotel_stay_rules (
 listing_id INT UNSIGNED PRIMARY KEY,min_nights SMALLINT UNSIGNED NOT NULL,max_nights SMALLINT UNSIGNED NOT NULL,
 FOREIGN KEY(listing_id) REFERENCES mks_listings(id),CHECK(min_nights BETWEEN 1 AND 90 AND max_nights BETWEEN min_nights AND 90)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_hotel_blocked_nights (
 room_type_id INT UNSIGNED NOT NULL,date DATE NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(room_type_id,date),FOREIGN KEY(room_type_id) REFERENCES mks_room_types(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_hotel_guest_stays (
 reference VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,checked_in DATETIME,checked_out DATETIME,
 checked_in_by INT UNSIGNED,checked_out_by INT UNSIGNED,FOREIGN KEY(reference) REFERENCES mks_bookings(reference),
 FOREIGN KEY(checked_in_by) REFERENCES mks_ops_users(id),FOREIGN KEY(checked_out_by) REFERENCES mks_ops_users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_hotel_review_replies (
 review_id INT UNSIGNED PRIMARY KEY,reply VARCHAR(2000) NOT NULL,author_id INT UNSIGNED NOT NULL,
 updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(review_id) REFERENCES mks_guest_reviews(id),FOREIGN KEY(author_id) REFERENCES mks_ops_users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_bulk_enquiries (
 record_id INT UNSIGNED PRIMARY KEY,group_type VARCHAR(60) NOT NULL,guests SMALLINT UNSIGNED NOT NULL,
 checkin DATE NOT NULL,checkout DATE NOT NULL,destination VARCHAR(120) NOT NULL,budget_minor INT UNSIGNED,
 units SMALLINT UNSIGNED,unit_type ENUM('rooms','beds') NOT NULL,occupancy VARCHAR(300),food JSON NOT NULL,
 transport BOOLEAN NOT NULL,accessibility VARCHAR(1000),contact_name VARCHAR(120) NOT NULL,contact_phone VARCHAR(30) NOT NULL,
 assigned_to INT UNSIGNED,FOREIGN KEY(record_id) REFERENCES mks_ops_records(id),FOREIGN KEY(assigned_to) REFERENCES mks_ops_users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_bulk_quotes (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,record_id INT UNSIGNED NOT NULL,listing_id INT UNSIGNED NOT NULL,room_type_id INT UNSIGNED NOT NULL,
 rooms SMALLINT UNSIGNED NOT NULL,terms VARCHAR(3000) NOT NULL,price_snapshot JSON NOT NULL,token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin UNIQUE,
 expires_at DATETIME NOT NULL,replaced BOOLEAN NOT NULL DEFAULT FALSE,reference VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin,
 created_by INT UNSIGNED NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(record_id) REFERENCES mks_bulk_enquiries(record_id),FOREIGN KEY(listing_id) REFERENCES mks_listings(id),
 FOREIGN KEY(room_type_id) REFERENCES mks_room_types(id),FOREIGN KEY(reference) REFERENCES mks_bookings(reference),
 FOREIGN KEY(created_by) REFERENCES mks_ops_users(id),INDEX(record_id,id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_bulk_reservation_attempts (
 reference VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,quote_id INT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(reference) REFERENCES mks_bookings(reference),
 FOREIGN KEY(quote_id) REFERENCES mks_bulk_quotes(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_cab_partners (
 user_id INT UNSIGNED PRIMARY KEY,business_name VARCHAR(160) NOT NULL,business_email VARCHAR(254) NOT NULL,business_phone VARCHAR(30) NOT NULL,
 service_areas VARCHAR(1000) NOT NULL,state ENUM('pending','verified','suspended') NOT NULL DEFAULT 'pending',
 FOREIGN KEY(user_id) REFERENCES mks_ops_users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_cab_vehicles (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,partner_id INT UNSIGNED NOT NULL,registration VARCHAR(30) NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL,category VARCHAR(40) NOT NULL,seats SMALLINT UNSIGNED NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,
 FOREIGN KEY(partner_id) REFERENCES mks_cab_partners(user_id),INDEX(partner_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_cab_drivers (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,partner_id INT UNSIGNED NOT NULL,name VARCHAR(120) NOT NULL,phone VARCHAR(30) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,FOREIGN KEY(partner_id) REFERENCES mks_cab_partners(user_id),INDEX(partner_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_cab_docs (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,partner_id INT UNSIGNED NOT NULL,vehicle_id INT UNSIGNED,driver_id INT UNSIGNED,
 kind ENUM('permit','registration','insurance','license') NOT NULL,filename VARCHAR(160) NOT NULL,mime VARCHAR(40) NOT NULL,
 contents MEDIUMBLOB NOT NULL,reviewed BOOLEAN NOT NULL DEFAULT FALSE,expires DATE,
 FOREIGN KEY(partner_id) REFERENCES mks_cab_partners(user_id),FOREIGN KEY(vehicle_id) REFERENCES mks_cab_vehicles(id),
 FOREIGN KEY(driver_id) REFERENCES mks_cab_drivers(id),INDEX(partner_id,kind)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_cab_trips (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,code VARCHAR(28) NOT NULL UNIQUE,access_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 pickup VARCHAR(180) NOT NULL,dropoff VARCHAR(180) NOT NULL,departure DATETIME NOT NULL,duration SMALLINT UNSIGNED,
 category VARCHAR(40) NOT NULL,trip_type VARCHAR(50) NOT NULL,passengers SMALLINT UNSIGNED NOT NULL,
 guest_name VARCHAR(120) NOT NULL,guest_email VARCHAR(254) NOT NULL,guest_phone VARCHAR(30) NOT NULL,notes VARCHAR(2400),
 state ENUM('requested','assigned','accepted','completed','cancelled') NOT NULL DEFAULT 'requested',
 partner_id INT UNSIGNED,vehicle_id INT UNSIGNED,driver_id INT UNSIGNED,fare INT UNSIGNED,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(partner_id) REFERENCES mks_cab_partners(user_id),
 FOREIGN KEY(vehicle_id) REFERENCES mks_cab_vehicles(id),FOREIGN KEY(driver_id) REFERENCES mks_cab_drivers(id),
 INDEX(partner_id,state,departure),INDEX(state,departure)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_veg_restaurants (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,name VARCHAR(160) NOT NULL,location VARCHAR(120) NOT NULL,address VARCHAR(400) NOT NULL,
 latitude DECIMAL(9,6) NOT NULL,longitude DECIMAL(9,6) NOT NULL,opening_hours VARCHAR(400) NOT NULL,
 phone VARCHAR(30) NOT NULL,email VARCHAR(254),description VARCHAR(2000),
 jain BOOLEAN NOT NULL DEFAULT FALSE,satvik BOOLEAN NOT NULL DEFAULT FALSE,dining_capacity SMALLINT UNSIGNED NOT NULL,
 verified BOOLEAN NOT NULL DEFAULT FALSE,verification_note VARCHAR(1000),state ENUM('draft','approved','deleted') NOT NULL DEFAULT 'draft',
 INDEX(state,location)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_veg_distances (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,restaurant_id INT UNSIGNED NOT NULL,listing_id INT UNSIGNED,landmark VARCHAR(120),
 distance DECIMAL(8,2) UNSIGNED NOT NULL,FOREIGN KEY(restaurant_id) REFERENCES mks_veg_restaurants(id),
 FOREIGN KEY(listing_id) REFERENCES mks_listings(id),INDEX(restaurant_id),INDEX(listing_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_pilgrim_entries (
 id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 section ENUM('dates','locations','ghats','transport','emergency','accessibility','faq','advisories') NOT NULL,
 translations JSON NOT NULL, date_value DATE, phone VARCHAR(20), source_url VARCHAR(1024) NOT NULL, reviewed_on DATE NOT NULL,
 expires_on DATE, state ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
 INDEX(state,section,date_value)
) ENGINE=InnoDB;
