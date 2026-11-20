ALTER TABLE mks_cab_trips
 ADD COLUMN booking_mode ENUM('now','scheduled') NOT NULL DEFAULT 'scheduled', ADD COLUMN luggage_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 ADD COLUMN passenger_name VARCHAR(120), ADD COLUMN passenger_phone VARCHAR(30), ADD COLUMN passenger_relation ENUM('self','family','senior','child','other') NOT NULL DEFAULT 'self',
 ADD COLUMN companion_name VARCHAR(120), ADD COLUMN companion_phone VARCHAR(30), ADD COLUMN emergency_contact VARCHAR(30), ADD COLUMN consent_share_details BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN assistance VARCHAR(120), ADD COLUMN accessibility_notes VARCHAR(1000), ADD COLUMN extra_boarding_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 ADD COLUMN hotel_booking_reference VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin, ADD COLUMN hotel_direction ENUM('to_hotel','from_hotel'),
 ADD COLUMN return_trip_id INT UNSIGNED, ADD COLUMN return_pickup VARCHAR(180), ADD COLUMN return_dropoff VARCHAR(180), ADD COLUMN return_departure DATETIME,
 ADD INDEX(hotel_booking_reference), ADD INDEX(return_trip_id), ADD CONSTRAINT fk_cab_return_trip FOREIGN KEY(return_trip_id) REFERENCES mks_cab_trips(id) ON DELETE SET NULL;
