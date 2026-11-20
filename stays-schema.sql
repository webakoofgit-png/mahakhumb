CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  type TEXT NOT NULL,
  price REAL NOT NULL CHECK (price >= 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  image TEXT,
  description TEXT,
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  demo INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  latitude REAL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL CHECK (longitude BETWEEN -180 AND 180)
);
CREATE INDEX IF NOT EXISTS listings_location_type_price ON listings(location, type, price);
CREATE INDEX IF NOT EXISTS listings_type_price ON listings(type, price);

CREATE TABLE IF NOT EXISTS listing_amenities (
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  amenity TEXT NOT NULL,
  PRIMARY KEY (listing_id, amenity)
);
CREATE TABLE IF NOT EXISTS listing_distances (
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  landmark TEXT NOT NULL,
  distance_km REAL NOT NULL CHECK (distance_km >= 0),
  PRIMARY KEY (listing_id, landmark)
);
CREATE TABLE IF NOT EXISTS room_types (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  capacity INTEGER NOT NULL CHECK (capacity > 0)
);
CREATE INDEX IF NOT EXISTS room_types_listing ON room_types(listing_id);
CREATE TABLE IF NOT EXISTS room_nights (
  room_type_id INTEGER NOT NULL REFERENCES room_types(id),
  date TEXT NOT NULL,
  remaining INTEGER NOT NULL CHECK (remaining >= 0),
  rate_minor INTEGER NOT NULL CHECK (rate_minor >= 0),
  PRIMARY KEY (room_type_id, date)
);
CREATE INDEX IF NOT EXISTS room_nights_date ON room_nights(date, room_type_id);
CREATE TABLE IF NOT EXISTS guest_reviews (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  verified_stay INTEGER NOT NULL DEFAULT 0 CHECK (verified_stay IN (0, 1)),
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1))
);
CREATE INDEX IF NOT EXISTS guest_reviews_listing ON guest_reviews(listing_id) WHERE verified_stay = 1 AND published = 1;
