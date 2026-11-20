CREATE TABLE IF NOT EXISTS mks_cab_fare_rules (
 category VARCHAR(40) PRIMARY KEY, base_minor INT UNSIGNED NOT NULL, per_km_minor INT UNSIGNED NOT NULL,
 per_minute_minor INT UNSIGNED NOT NULL, tax_bps SMALLINT UNSIGNED NOT NULL DEFAULT 500,
 commission_bps SMALLINT UNSIGNED NOT NULL DEFAULT 1000, active BOOLEAN NOT NULL DEFAULT TRUE,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CHECK(tax_bps<=10000 AND commission_bps<=10000)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_cab_ride_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, trip_id INT UNSIGNED NOT NULL,
 state ENUM('requested','searching','assigned','arriving','in_progress','completed','cancelled') NOT NULL,
 actor_id INT UNSIGNED, metadata JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(trip_id) REFERENCES mks_cab_trips(id) ON DELETE CASCADE, FOREIGN KEY(actor_id) REFERENCES mks_ops_users(id) ON DELETE SET NULL,
 INDEX(trip_id,created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_cab_service_zones (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, polygon_json JSON NOT NULL,
 state ENUM('draft','published','archived') NOT NULL DEFAULT 'draft', restriction_note VARCHAR(1000), source_url VARCHAR(1024),
 updated_by INT UNSIGNED, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(updated_by) REFERENCES mks_ops_users(id) ON DELETE SET NULL, INDEX(state)
) ENGINE=InnoDB;
INSERT IGNORE INTO mks_cab_fare_rules(category,base_minor,per_km_minor,per_minute_minor,tax_bps,commission_bps) VALUES
 ('Bike Taxi',300,900,100,500,1000),('Auto Rickshaw',500,1200,150,500,1000),('Mini Cab',800,1600,220,500,1000),
 ('Sedan',1000,1900,250,500,1000),('SUV',1400,2500,320,500,1000),('Tempo Traveller',2500,4000,500,500,1000),('Luxury Cab',3000,5000,600,500,1200);
