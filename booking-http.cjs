const { randomBytes } = require('node:crypto');
const { pool } = require('./booking-db.cjs');
const engine = require('./booking-engine.cjs');
const { startPayment, webhook, startWorker } = require('./booking-payments.cjs');
const { fail, hash } = engine;

const tokenPattern = /^[a-f0-9]{64}$/;
const referencePattern = /^MKS-[A-F0-9]{24}$/;
function cookie(req, key) {
    return (req.headers.cookie || '').split(';').map(item=>item.trim()).find(item=>item.startsWith(key+'='))?.slice(key.length+1);
}
function storeCookie(res, key, token, seconds) {
    const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
    res.setHeader('Set-Cookie', `${key}=${token}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${seconds}${secure?'; Secure':''}`);
}
function rawBody(req) {
    return new Promise((resolve,reject) => {
        const chunks=[];
        let size=0;
        req.on('data',chunk=>{
            size+=chunk.length;
            if(size<=65536)chunks.push(chunk);
        });
        req.on('end',()=>size<=65536?resolve(Buffer.concat(chunks)):reject(fail(413,'Request body too large.')));
        req.on('error',reject);
    });
}
async function body(req) {
    if (req.headers['sec-fetch-site'] === 'cross-site' || (process.env.APP_ORIGIN && req.headers.origin && req.headers.origin !== process.env.APP_ORIGIN)) {
        throw fail(403,'Request origin is not allowed.');
    }
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw fail(415,'Send a JSON request.');
    const raw = await rawBody(req);
    let value;
    try { value=JSON.parse(raw); } catch { throw fail(400,'Invalid JSON request.'); }
    if (!value || typeof value!=='object' || Array.isArray(value)) throw fail(400,'Invalid JSON request.');
    return value;
}
function idempotency(req) {
    const key=req.headers['idempotency-key'];
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(key || '')) throw fail(400,'A valid idempotency key is required.');
    return key;
}
async function route(req,res,url) {
    if (!pool) throw fail(503,'The reservation database is not configured.');
    const segments=url.pathname.split('/').filter(Boolean).slice(1);
    const [area,id,action]=segments;
    const method=req.method;
    if (area==='razorpay-webhook' && !id && method==='POST') {
        await webhook(await rawBody(req),req.headers['x-razorpay-signature'],req.headers['x-razorpay-event-id']);
        return { received:true };
    }
    if (area==='properties' && /^\d+$/.test(id || '')) {
        if (!action && method==='GET') return engine.property(Number(id));
        if (action==='availability' && method==='GET') return engine.quote(pool,{...Object.fromEntries(url.searchParams),listingId:Number(id)});
    }
    if (area==='hotel-bookings' && !action) {
        if (id==='session' && method==='POST') {
            const { token }=await body(req);
            if (!tokenPattern.test(token || '')) throw fail(401,'Enter a valid hotel access token.');
            const [[result]]=await pool.execute('SELECT 1 FROM mks_hotel_access WHERE token_hash=? LIMIT 1',[hash(token)]);
            if (!result) throw fail(401,'The hotel access token was not recognized.');
            storeCookie(res,'mks_hotel',token,28800);
            return { signedIn:true };
        }
        if (!id && method==='GET') {
            const token=cookie(req,'mks_hotel');
            if (!tokenPattern.test(token || '')) throw fail(401,'Sign in with a hotel access token.');
            const [[result]]=await pool.execute('SELECT 1 FROM mks_hotel_access WHERE token_hash=? LIMIT 1',[hash(token)]);
            if (!result) throw fail(401,'Hotel access has expired.');
            return engine.listBookings(hash(token),true);
        }
    }
    if (area==='reservations') {
        const token=cookie(req,'mks_guest');
        if (id==='session' && !action && method==='GET') {
            if (!tokenPattern.test(token || '')) storeCookie(res,'mks_guest',randomBytes(32).toString('hex'),86400*365);
            return { ready:true };
        }
        if (!tokenPattern.test(token || '')) {
            if (!id && !action && method==='GET') return [];
            throw fail(401,'Open a reservation session and retry.');
        }
        const owner=hash(token);
        if (!id && method==='GET') return engine.listBookings(owner);
        if (!id && method==='POST') return engine.hold(await body(req),owner,idempotency(req));
        if (referencePattern.test(id || '')) {
            if (!action && method==='GET') return engine.ownedBooking(id,owner);
            if (action==='payment' && method==='POST') {
                await body(req);
                const payment=await startPayment(id,owner,idempotency(req));
                if (payment.expired) throw fail(409,'Your room hold expired. Search again.');
                return payment;
            }
            if (action==='cancel' && method==='POST') { await body(req); return engine.cancel(id,owner); }
        }
    }
    throw fail(404,'Endpoint not found.');
}
function guestOwner(req){
    const value=cookie(req,'mks_guest');
    return tokenPattern.test(value||'')?hash(value):null;
}
module.exports = { route,startWorker,guestOwner,idempotency };
