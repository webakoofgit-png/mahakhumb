ALTER TABLE mks_cab_trips MODIFY state ENUM('requested','searching','assigned','driver_assigned','driver_arriving','arrived','accepted','in_progress','completed','cancelled','expired','failed') NOT NULL DEFAULT 'requested';
ALTER TABLE mks_cab_trips ADD COLUMN cancel_reason VARCHAR(240), ADD COLUMN cancelled_by ENUM('customer','driver','admin','system'), ADD COLUMN started_at DATETIME, ADD COLUMN completed_at DATETIME, ADD COLUMN state_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
CREATE TABLE IF NOT EXISTS mks_cab_ride_offers (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, trip_id INT UNSIGNED NOT NULL, driver_id INT UNSIGNED NOT NULL,
 state ENUM('offered','accepted','rejected','expired','released') NOT NULL DEFAULT 'offered', offered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at DATETIME NOT NULL, responded_at DATETIME, distance_km DECIMAL(8,2), eta_minutes SMALLINT UNSIGNED,
 UNIQUE(trip_id,driver_id), INDEX(driver_id,state,expires_at), INDEX(trip_id,state),
 FOREIGN KEY(trip_id) REFERENCES mks_cab_trips(id) ON DELETE CASCADE, FOREIGN KEY(driver_id) REFERENCES mks_cab_drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_cab_ride_state_history (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, trip_id INT UNSIGNED NOT NULL, from_state VARCHAR(30), to_state VARCHAR(30) NOT NULL,
 actor_type ENUM('customer','driver','admin','system') NOT NULL, actor_id INT UNSIGNED, reason VARCHAR(240), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(trip_id) REFERENCES mks_cab_trips(id) ON DELETE CASCADE, INDEX(trip_id,created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mks_cab_support_tickets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, trip_id INT UNSIGNED, reporter_id INT UNSIGNED, category ENUM('driver_issue','fare','lost_item','dispute','safety','other') NOT NULL,
 description VARCHAR(2400) NOT NULL, state ENUM('open','assigned','resolved','closed') NOT NULL DEFAULT 'open', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(trip_id) REFERENCES mks_cab_trips(id) ON DELETE SET NULL, FOREIGN KEY(reporter_id) REFERENCES mks_ops_users(id) ON DELETE SET NULL, INDEX(state,created_at)
) ENGINE=InnoDB;
