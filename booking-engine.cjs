const { createHash, randomBytes } = require('node:crypto');
const { pool, transaction } = require('./booking-db.cjs');
const { validSearchDate } = require('./dist/stay-catalog.js');

const day = 86400000;
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const todayInIndia = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const utc = value => value.replace(' ', 'T') + 'Z';
const gatewayConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET);

function selection(input,group=false) {
    const { checkin, checkout } = input;
    const listingId = Number(input.listingId), roomId = Number(input.roomId);
    const guests = Number(input.guests), rooms = Number(input.rooms);
    const nights = (Date.parse(checkout) - Date.parse(checkin)) / day;
    if (!validSearchDate(checkin) || !validSearchDate(checkout) || checkin < todayInIndia() || nights < 1 || nights > 90) {
        throw fail(400, 'Choose a current or future arrival and a stay of up to 90 nights.');
    }
    if (!Number.isSafeInteger(listingId) || listingId < 1 || !Number.isSafeInteger(roomId) || roomId < 1 ||
        !Number.isInteger(guests) || guests < 1 || guests > (group?5000:120) ||
        !Number.isInteger(rooms) || rooms < 1 || rooms > (group?500:30) || rooms > guests) {
        throw fail(400, 'Choose a valid property, room type, and number of guests and rooms.');
    }
    return { listingId, roomId, checkin, checkout, guests, rooms, nights };
}

async function property(id) {
    const [rows] = await pool.execute('SELECT * FROM mks_listings WHERE id=? AND demo=0 AND NOT EXISTS (SELECT 1 FROM mks_property_workflow w WHERE w.listing_id=mks_listings.id AND w.state<>\'approved\')', [id]);
    const listing = rows[0];
    if (!listing) throw fail(404, 'This property could not be found.');
    const queries = [
        'SELECT id,name,capacity,description,images FROM mks_room_types WHERE listing_id=? ORDER BY id',
        'SELECT amenity FROM mks_listing_amenities WHERE listing_id=? ORDER BY amenity',
        'SELECT landmark,distance_km FROM mks_listing_distances WHERE listing_id=? ORDER BY distance_km',
        `SELECT r.rating,r.comment,p.reply FROM mks_guest_reviews r LEFT JOIN mks_hotel_review_replies p ON p.review_id=r.id
            WHERE r.listing_id=? AND r.verified_stay=1 AND r.published=1 ORDER BY r.id DESC LIMIT 20`
    ];
    const [[rooms], [amenities], [distances], [reviews]] = await Promise.all(queries.map(query => pool.execute(query, [id])));
    const [[partner]]=await pool.execute(`SELECT h.user_id FROM mks_property_workflow w JOIN mks_hotel_partners h ON h.user_id=w.owner_id WHERE w.listing_id=?`,[id]);
    return { ...listing, acceptsGroupEnquiries:Boolean(partner), gallery: json(listing.gallery) || [], rooms: rooms.map(room => ({ ...room, images: json(room.images) || [] })),
        amenities: amenities.map(row => row.amenity), distances, reviews, paymentConfigured: gatewayConfigured() };
}

async function quote(db, input, lock = false, group=false) {
    const stay = selection(input,group);
    const [types] = await db.execute(`SELECT t.capacity,l.cancel_hours,l.cancel_refund_bps FROM mks_room_types t
        JOIN mks_listings l ON l.id=t.listing_id WHERE t.id=? AND l.id=? AND l.demo=0 AND NOT EXISTS (SELECT 1 FROM mks_property_workflow w WHERE w.listing_id=l.id AND w.state<>'approved')${lock?' FOR SHARE':''}`, [stay.roomId, stay.listingId]);
    const type = types[0];
    if (!type) throw fail(404, 'This room type could not be found.');
    const [[terms]] = await db.execute('SELECT min_nights,max_nights FROM mks_hotel_stay_rules WHERE listing_id=?',[stay.listingId]);
    if(terms&&(stay.nights<terms.min_nights||stay.nights>terms.max_nights)){
        throw fail(409,`This property accepts stays of ${terms.min_nights} to ${terms.max_nights} nights.`);
    }
    if (type.capacity * stay.rooms < stay.guests) throw fail(409, 'The selected rooms cannot accommodate this party.');
    const [inventory] = await db.execute(`SELECT date,remaining,rate_minor,tax_bps FROM mks_room_nights
        WHERE room_type_id=? AND date>=? AND date<? ORDER BY date${lock ? ' FOR UPDATE' : ''}`, [stay.roomId, stay.checkin, stay.checkout]);
    const [closures] = await db.execute('SELECT date FROM mks_hotel_blocked_nights WHERE room_type_id=? AND date>=? AND date<?',
        [stay.roomId,stay.checkin,stay.checkout]);
    const closed = new Set(closures.map(row=>row.date));
    const nights = new Map(inventory.map(row => [row.date, row]));
    const breakdown = Array.from({ length: stay.nights }, (_, i) => {
        const date = new Date(Date.parse(stay.checkin) + i * day).toISOString().slice(0, 10);
        const row = nights.get(date);
        const subtotal = row ? row.rate_minor * stay.rooms : null;
        return { date, available: closed.has(date)?0:(row?.remaining ?? 0), rate: row?.rate_minor ?? null, taxBps: row?.tax_bps ?? null,
            subtotal, tax: row ? Math.round(subtotal * row.tax_bps / 10000) : null };
    });
    const available = breakdown.every(row => row.available >= stay.rooms);
    const subtotal = available ? breakdown.reduce((sum, row) => sum + row.subtotal, 0) : null;
    const tax = available ? breakdown.reduce((sum, row) => sum + row.tax, 0) : null;
    const total = available ? subtotal + tax : null;
    if (available && (total < 1 || total > 4294967295)) throw fail(409, 'This room has no payable rate for the selected dates.');
    const cancelUntil = new Date(Date.parse(stay.checkin + 'T00:00:00+05:30') - type.cancel_hours * 3600000).toISOString();
    const details = { ...stay, breakdown, available, subtotal, tax, total, cancelUntil, refundBps: type.cancel_refund_bps };
    details.fingerprint = hash(JSON.stringify({ ...details, breakdown: breakdown.map(({ available, ...rate }) => rate) }));
    return details;
}

const bookingSelect = `SELECT b.*, p.refund_status, p.refund_amount,l.name AS property_name, t.name AS room_name,
    b.expires_at <= UTC_TIMESTAMP() AS expired
    FROM mks_bookings b JOIN mks_listings l ON l.id=b.listing_id JOIN mks_room_types t ON t.id=b.room_type_id
    LEFT JOIN mks_payments p ON p.id=COALESCE(b.payment_id,(SELECT MAX(extra.id) FROM mks_payments extra WHERE extra.reference=b.reference))`;
function display(row) {
    return { reference: row.reference, property: row.property_name, room: row.room_name, status: row.status === 'held' && row.expired ? 'expired' : row.status,
        expiresAt: utc(row.expires_at), quote: json(row.quote), refundStatus: row.refund_status, refundAmount: row.refund_amount,
        notification: row.status === 'confirmed' ? 'Your booking is confirmed.' : null };
}
async function ownedBooking(reference, owner) {
    const [[row]] = await pool.execute(bookingSelect + ' WHERE b.reference=? AND b.owner_hash=?', [reference, owner]);
    if (!row) throw fail(404, 'Reservation unavailable in this browser session.');
    return display(row);
}
async function previousHold(db, owner, key, requestHash) {
    const [[previous]] = await db.execute('SELECT reference,request_hash FROM mks_bookings WHERE owner_hash=? AND idempotency_key=?', [owner, key]);
    if (previous && previous.request_hash !== requestHash) throw fail(409, 'This request key was already used with different booking details.');
    return previous?.reference;
}
function guestDetails(input) {
    const name = String(input.name ?? '').trim();
    const email = String(input.email ?? '').trim().toLowerCase();
    const phone = String(input.phone ?? '').trim();
    if (!name || name.length > 120 || /[\r\n]/.test(name) || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
        !/^\+?[\d() .-]{8,24}$/.test(phone) || phone.replace(/\D/g, '').length < 8) throw fail(400, 'Enter a valid guest name, email address and phone number.');
    return { name, email, phone };
}
async function hold(input, owner, key, group) {
    const guest = guestDetails(input);
    const stay = selection(input,Boolean(group));
    const requestHash = hash(JSON.stringify({ guest, stay, fingerprint: input.fingerprint }));
    let reference;
    try {
        reference = await transaction(async db => {
            // Serialize holds per guest session so retries and hold limits cannot race.
            await db.execute('INSERT INTO mks_guest_booking_locks(owner_hash) VALUES (?) ON DUPLICATE KEY UPDATE owner_hash=owner_hash', [owner]);
            const attached = group?await group.validate(db):null;
            if(attached)return attached;
            const previous = await previousHold(db, owner, key, requestHash);
            if (previous) return previous;
            const [[{ active }]] = await db.execute("SELECT COUNT(*) AS active FROM mks_bookings WHERE owner_hash=? AND status='held' AND expires_at>UTC_TIMESTAMP()", [owner]);
            if (active>=3) throw fail(429,'You have three active room holds. Cancel an existing hold or let it expire.');
            const amount = await quote(db,input,true,Boolean(group));
            if (!amount.available) throw fail(409, 'These rooms are no longer available. Search again for current inventory.');
            if (amount.fingerprint !== input.fingerprint) throw fail(409, 'The price or cancellation terms changed. Refresh the quote before proceeding.');
            const ref = 'MKS-' + randomBytes(12).toString('hex').toUpperCase();
            await db.execute(`INSERT INTO mks_bookings
                (reference,listing_id,room_type_id,checkin,checkout,rooms,guests,owner_hash,idempotency_key,request_hash,
                 guest_name,guest_email,guest_phone,quote,total,cancel_until,refund_bps,status,expires_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'held',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE))`,
            [ref,stay.listingId,stay.roomId,stay.checkin,stay.checkout,stay.rooms,stay.guests,owner,key,requestHash,
                guest.name,guest.email,guest.phone,JSON.stringify(amount),amount.total,amount.cancelUntil.slice(0,19).replace('T',' '),amount.refundBps]);
            const [changed] = await db.execute(`UPDATE mks_room_nights SET remaining=remaining-?
                WHERE room_type_id=? AND date>=? AND date<? AND remaining>=? ORDER BY date`,
            [stay.rooms,stay.roomId,stay.checkin,stay.checkout,stay.rooms]);
            if (changed.affectedRows !== stay.nights) throw fail(409, 'These rooms are no longer available.');
            if(group)await group.attach(db,ref);
            return ref;
        });
    } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY') throw error;
        reference = await previousHold(pool, owner, key, requestHash);
        if (!reference) throw error;
    }
    return ownedBooking(reference, owner);
}
async function lockedBooking(db, ref) {
    const [[row]] = await db.execute('SELECT *, expires_at<=UTC_TIMESTAMP() AS expired FROM mks_bookings WHERE reference=? FOR UPDATE', [ref]);
    return row;
}
async function release(db, row, status) {
    await db.execute('UPDATE mks_room_nights SET remaining=remaining+? WHERE room_type_id=? AND date>=? AND date<? ORDER BY date',
        [row.rooms,row.room_type_id,row.checkin,row.checkout]);
    await db.execute('UPDATE mks_bookings SET status=? WHERE reference=?', [status,row.reference]);
}
async function expireHolds() {
    const [rows] = await pool.query("SELECT reference FROM mks_bookings WHERE status='held' AND expires_at<=UTC_TIMESTAMP() ORDER BY expires_at LIMIT 100");
    for (const { reference } of rows) await transaction(async db => {
        const row = await lockedBooking(db, reference);
        if (row?.status === 'held' && row.expired) await release(db, row, 'expired');
    });
}
async function queue(db, kind, key, payload) {
    await db.execute('INSERT INTO mks_booking_jobs(kind,dedupe_key,payload) VALUES (?,?,?) ON DUPLICATE KEY UPDATE id=id',
        [kind,key,JSON.stringify(payload)]);
}
async function queueRefund(db, id, amount) {
    if (!amount) return;
    await db.execute("UPDATE mks_payments SET refund_amount=?,refund_status='queued' WHERE id=? AND refund_status IS NULL", [amount,id]);
    await queue(db, 'refund', id, { id, amount });
}
async function cancelLocked(db,row){
    if (row.status === 'cancelled' || row.status === 'expired') return;
    if (row.status === 'confirmed' && row.checkin <= todayInIndia()) throw fail(409, 'This booking cannot be cancelled on or after check-in.');
    await release(db,row,'cancelled');
    if (row.payment_id) {
        await queueRefund(db,row.payment_id,Date.now() <= Date.parse(utc(row.cancel_until)) ? Math.round(row.total * row.refund_bps / 10000) : 0);
        const [[hotel]]=await db.execute(`SELECT h.business_email FROM mks_hotel_partners h JOIN mks_property_workflow w ON w.owner_id=h.user_id
            WHERE w.listing_id=? AND h.booking_notifications=1`,[row.listing_id]);
        if(hotel)await queue(db,'email','hotel-cancelled-'+row.reference,{reference:row.reference,to:hotel.business_email,status:'cancelled',partner:true});
        await queue(db,'email','cancelled-'+row.reference,{reference:row.reference,to:row.guest_email,status:'cancelled'});
    }
}
async function cancel(reference, owner) {
    await transaction(async db => {
        const row = await lockedBooking(db, reference);
        if (!row || row.owner_hash !== owner) throw fail(404, 'Reservation not found.');
        await cancelLocked(db,row);
    });
    return ownedBooking(reference,owner);
}
async function listBookings(owner, hotel = false) {
    const clause = hotel ? "b.status IN ('confirmed','cancelled') AND b.payment_id IS NOT NULL AND EXISTS (SELECT 1 FROM mks_hotel_access a WHERE a.listing_id=b.listing_id AND a.token_hash=?)" : 'b.owner_hash=?';
    const [rows] = await pool.execute(bookingSelect + ' WHERE ' + clause + ' ORDER BY b.created_at DESC LIMIT 100', [owner]);
    return rows.map(row => ({ ...display(row), ...(hotel ? { guest: row.guest_name, email: row.guest_email, phone: row.guest_phone } : {}) }));
}
module.exports = { fail, hash, json, gatewayConfigured, property, quote, hold, ownedBooking, lockedBooking, release, expireHolds, cancel, queue, queueRefund, listBookings, cancelLocked };
