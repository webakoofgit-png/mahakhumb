const fs = require('node:fs');
const path = require('node:path');
const initSql = require('sql.js');
const { pool } = require('./booking-db.cjs');
const { properties, parseStaySearch, validSearchDate, destinationLocations } = require('./dist/stay-catalog.js');

const pageSize = 6;
const dayMs = 86400000;
const schema = fs.readFileSync(path.join(__dirname, 'stays-schema.sql'), 'utf8');
const databaseFile = process.env.MAHAKUMBH_STAYS_DB;
const sqlReady = initSql();
let database;
let modified;

async function loadDatabase() {
    const SQL = await sqlReady;
    if (!databaseFile) {
        if (database) return database;
        database = new SQL.Database();
        database.run(schema);
        for (const p of properties) {
            database.run('INSERT INTO listings (id,name,location,type,price,capacity,image,demo) VALUES (?,?,?,?,?,?,?,1)',
                [p.id, p.name, p.location, p.type, p.price, p.capacity, p.image]);
            for (const amenity of p.amenities) database.run('INSERT INTO listing_amenities VALUES (?,?)', [p.id, amenity]);
            const landmark = p.location === 'Trimbakeshwar' ? 'Trimbakeshwar temple' : 'Ramkund';
            database.run('INSERT INTO listing_distances VALUES (?,?,?)', [p.id, landmark, p.distance]);
        }
        return database;
    }
    const stat = fs.statSync(databaseFile);
    if (!database || modified !== stat.mtimeMs) {
        const next = new SQL.Database(fs.readFileSync(databaseFile));
        try {
            next.run(schema);
        } catch (error) {
            next.close();
            throw error;
        }
        database?.close();
        database = next;
        modified = stat.mtimeMs;
    }
    return database;
}

function rows(db, sql, parameters = []) {
    const statement = db.prepare(sql);
    try {
        statement.bind(parameters);
        const results = [];
        while (statement.step()) results.push(statement.getAsObject());
        return results;
    } finally {
        statement.free();
    }
}

function publicListing(row) {
    return {
        id: row.id, name: row.name, type: row.type, location: row.location, image: row.image,
        description: row.description, price: row.price, capacity: row.capacity, landmark: row.landmark,
        distanceKm: row.distanceKm, nightlyPrice: row.nightlyPrice, stayPrice: row.stayPrice,
        amenities: typeof row.amenities === 'string' ? JSON.parse(row.amenities) : row.amenities, verified: row.verified === 1 && row.demo === 0, demo: row.demo === 1,
        rating: row.rating, reviewCount: row.reviewCount, latitude: row.latitude, longitude: row.longitude
    };
}

async function catalogReader() {
    if (pool) {
        const [[available]] = await pool.query("SELECT EXISTS(SELECT 1 FROM mks_listings l WHERE l.demo=0 AND NOT EXISTS (SELECT 1 FROM mks_property_workflow w WHERE w.listing_id=l.id AND w.state<>'approved')) AS present");
        if (available.present) {
            const read = async (sql, parameters) => {
            const query = sql
                .replace(/\b(listings|listing_amenities|listing_distances|room_types|room_nights|guest_reviews)\b/g, 'mks_$1')
                .replace('json_group_array(amenity)', 'COALESCE(JSON_ARRAYAGG(amenity), JSON_ARRAY())')
                .replace('name COLLATE NOCASE', 'LOWER(name)')
                .replace(/FROM mks_listings l/g,"FROM (SELECT a.* FROM mks_listings a WHERE NOT EXISTS (SELECT 1 FROM mks_property_workflow w WHERE w.listing_id=a.id AND w.state<>'approved')) l");
            const [result] = await pool.query(query, parameters);
            return result;
            };
            read.mysql=true;
            return read;
        }
    }
    const db = await loadDatabase();
    return (sql, parameters) => rows(db, sql, parameters);
}

const amenitiesColumn = "(SELECT json_group_array(amenity) FROM listing_amenities WHERE listing_id = l.id) AS amenities";
const publishedReviews = 'verified_stay = 1 AND published = 1';
const ordering = {
    recommended: '(verified = 1 AND demo = 0) DESC, (nightlyPrice IS NULL), name COLLATE NOCASE, id',
    price: 'displayPrice ASC, id',
    'price-desc': 'displayPrice DESC, id',
    distance: '(distanceKm IS NULL), distanceKm ASC, id',
    rating: '(rating IS NULL), rating DESC, reviewCount DESC, id'
};

async function search(params) {
    const query = parseStaySearch(params);
    const start = params.get('checkin');
    const end = params.get('checkout');
    if ((params.has('checkin') || params.has('checkout')) &&
        (!validSearchDate(start) || !validSearchDate(end) || end <= start)) {
        return { status: 400, body: { error: 'Choose a valid check-in and a later check-out.' } };
    }
    const nights = (Date.parse(query.checkout) - Date.parse(query.checkin)) / dayMs;
    if (nights > 90 || query.min > query.max) {
        return { status: 400, body: { error: nights > 90 ? 'Search for a stay of up to 90 nights.' : 'Maximum price must be at least the minimum price.' } };
    }
    const read = await catalogReader();
    const filters = ['l.capacity >= ?'];
    if (query.rooms > 4) filters.push('l.demo = 0');
    const capacity = Math.max(query.capacity, Math.ceil(query.guests / query.rooms));
    const args = [capacity];
    const destinations = destinationLocations(query.destination);
    if (destinations.length) {
        filters.push('l.location IN (' + destinations.map(() => '?').join(',') + ')');
        args.push(...destinations);
    }
    if (query.type !== 'All stays') {
        const types = {
            Hotels: ['Hotels', 'Budget Hotels', 'Premium Hotels & Resorts'],
            Resorts: ['Resorts', 'Premium Hotels & Resorts'],
            'Budget Hotels': ['Hotels', 'Budget Hotels'],
            'Premium Hotels & Resorts': ['Resorts', 'Premium Hotels & Resorts']
        }[query.type] || [query.type];
        filters.push('l.type IN (' + types.map(() => '?').join(',') + ')');
        args.push(...types);
    }
    if (query.verified) filters.push('l.verified = 1 AND l.demo = 0');
    for (const amenity of new Set(query.amenities)) {
        filters.push('EXISTS (SELECT 1 FROM listing_amenities WHERE listing_id = l.id AND amenity = ?)');
        args.push(amenity);
    }
    const distanceFilter = query.minDistance || query.distance !== 250;
    const cte = `WITH candidates AS (
        SELECT l.* FROM listings l WHERE ${filters.join(' AND ')}
    ), room_quotes AS (
        SELECT t.listing_id, SUM(n.rate_minor) AS total_minor
        FROM candidates c JOIN room_types t ON t.listing_id = c.id
        JOIN room_nights n ON n.room_type_id = t.id
        WHERE n.date >= ? AND n.date < ? AND t.capacity >= ? AND n.remaining >= ?
        ${read.mysql?`AND NOT EXISTS (SELECT 1 FROM mks_hotel_blocked_nights h WHERE h.room_type_id=n.room_type_id AND h.date=n.date)
          AND NOT EXISTS (SELECT 1 FROM mks_hotel_stay_rules v WHERE v.listing_id=c.id AND ? NOT BETWEEN v.min_nights AND v.max_nights)`:''}
        GROUP BY t.id HAVING COUNT(*) = ?
    ), quotes AS (
        SELECT listing_id, MIN(total_minor) AS total_minor FROM room_quotes GROUP BY listing_id
    ), ratings AS (
        SELECT r.listing_id, AVG(r.rating) AS rating, COUNT(*) AS reviewCount
        FROM candidates c JOIN guest_reviews r ON r.listing_id = c.id
        WHERE c.demo = 0 AND ${publishedReviews} GROUP BY r.listing_id
    ), matches AS (
        SELECT l.*, d.distance_km AS distanceKm, d.landmark, q.total_minor / (100.0 * ?) AS nightlyPrice,
            q.total_minor * ? / 100.0 AS stayPrice,
            COALESCE(q.total_minor / (100.0 * ?), l.price) AS displayPrice, r.rating, r.reviewCount,
            ${amenitiesColumn}
        FROM candidates l LEFT JOIN quotes q ON q.listing_id = l.id
        LEFT JOIN ratings r ON r.listing_id = l.id
        LEFT JOIN listing_distances d ON d.listing_id = l.id
            AND d.landmark = COALESCE(NULLIF(?, ''), (
                SELECT nearest.landmark FROM listing_distances nearest
                WHERE nearest.listing_id = l.id ORDER BY nearest.distance_km, nearest.landmark LIMIT 1
            ))
        WHERE (l.demo = 1 OR q.total_minor IS NOT NULL)
    ), filtered AS (
        SELECT * FROM matches WHERE displayPrice BETWEEN ? AND ?
        ${distanceFilter ? 'AND distanceKm BETWEEN ? AND ?' : ''}
    )`;
    args.push(query.checkin, query.checkout, capacity, query.rooms);
    if(read.mysql)args.push(nights);
    args.push(nights, nights, query.rooms, nights,
        query.landmark, query.min, query.max);
    if (distanceFilter) args.push(query.minDistance, query.distance);
    const [summary] = await read(cte + ' SELECT COUNT(*) AS total, COUNT(rating) AS ratedCount FROM filtered', args);
    const totalPages = Math.max(1, Math.ceil(summary.total / pageSize));
    const page = Math.min(query.page, totalPages);
    const sort = query.sort === 'rating' && !summary.ratedCount ? 'recommended' : query.sort;
    const pageRows = await read(cte + ' SELECT * FROM filtered ORDER BY ' + ordering[sort] + ' LIMIT ? OFFSET ?',
        [...args, pageSize, (page - 1) * pageSize]);
    const items = pageRows.map(publicListing);
    return { status: 200, body: { items, total: summary.total, page, totalPages, ratedCount: summary.ratedCount, sort } };
}

async function getListing(id) {
    const read = await catalogReader();
    const [item] = await read( `SELECT l.*, ${amenitiesColumn} FROM listings l WHERE l.id = ? AND l.demo = 0`, [id]);
    return item
        ? { status: 200, body: publicListing(item) }
        : { status: 404, body: { error: 'This property could not be found.' } };
}

module.exports = { search, getListing };
