const crypto = require('node:crypto');
const { pool } = require('./booking-db.cjs');

const memory = new Map();
function requestId() { return crypto.randomUUID(); }
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
async function rateLimit(key, limit=120, windowMs=60000) {
    const now=Date.now(), item=memory.get(key);
    if (!item || now-item.started>=windowMs) { memory.set(key,{started:now,count:1}); return true; }
    item.count++; return item.count<=limit;
}
async function idempotency(actor, key, body) {
    if (!key) return null;
    const requestHash=hash(JSON.stringify(body));
    if (!pool) return {requestHash};
    const [rows]=await pool.execute('SELECT request_hash,response_status,response_body FROM mks_idempotency_keys WHERE actor_key=? AND idempotency_key=? AND expires_at>UTC_TIMESTAMP()',[String(actor),key]);
    if (!rows.length) return {requestHash};
    if (rows[0].request_hash!==requestHash) { const e=new Error('Idempotency key was reused with different request data.'); e.status=409; throw e; }
    return {requestHash,replay:rows[0]};
}
async function saveIdempotency(actor,key,requestHash,status,body) {
    if (!pool||!key) return;
    await pool.execute(`INSERT INTO mks_idempotency_keys(actor_key,idempotency_key,request_hash,response_status,response_body,expires_at)
      VALUES (?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 24 HOUR))
      ON DUPLICATE KEY UPDATE response_status=VALUES(response_status),response_body=VALUES(response_body)`,[String(actor),key,requestHash,status,JSON.stringify(body)]);
}
function cacheGet(key) { const x=memory.get('cache:'+key); return x&&x.expires>Date.now()?x.value:null; }
function cacheSet(key,value,ttl=30000) { memory.set('cache:'+key,{value,expires:Date.now()+ttl}); return value; }
module.exports={requestId,rateLimit,idempotency,saveIdempotency,cacheGet,cacheSet};
