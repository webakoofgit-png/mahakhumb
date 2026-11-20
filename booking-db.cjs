const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const mysql = require('mysql2/promise');
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (err) { if (err.code !== 'ENOENT') throw err; }

const configured = Boolean(process.env.MYSQL_DATABASE);
const pool = configured ? mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
    connectionLimit: 10, dateStrings: true, timezone: 'Z', decimalNumbers: true
}) : null;

async function transaction(work) {
    const db = await pool.getConnection();
    try {
        await db.query("SET time_zone = '+00:00'");
        await db.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await db.beginTransaction();
        const value = await work(db);
        await db.commit();
        return value;
    } catch (error) {
        await db.rollback();
        throw error;
    } finally { db.release(); }
}

async function migrate() {
    if (!pool) throw new Error('Configure MYSQL_DATABASE before running migrations.');
    await pool.query(`CREATE TABLE IF NOT EXISTS mks_schema_migrations (
        version VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    for (const file of ['booking-schema.sql','operations-schema.sql','migrations/001-platform.sql','migrations/002-transport-platform.sql','migrations/003-cab-customer-features.sql','migrations/004-driver-dashboard.sql','migrations/005-ride-engine.sql']) {
        const schema = fs.readFileSync(path.join(__dirname, file), 'utf8');
        const version = file.replaceAll('\\','/');
        const [done] = await pool.execute('SELECT 1 FROM mks_schema_migrations WHERE version=?',[version]);
        if (done.length) continue;
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            for (const query of schema.split(';').map(part => part.trim()).filter(Boolean)) await connection.query(query);
            await connection.execute('INSERT INTO mks_schema_migrations(version) VALUES (?)',[version]);
            await connection.commit();
        } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    }
    for(const entry of require('./pilgrim-seed.cjs')){
        await pool.execute(`INSERT IGNORE INTO mks_pilgrim_entries(id,section,translations,date_value,phone,source_url,reviewed_on,state)
            VALUES (?,?,?,?,?,?,?,'published')`,[entry.id,entry.section,JSON.stringify(entry.translations),entry.date||null,entry.phone||null,entry.source,entry.reviewed]);
    }
}
async function command(){
    if(process.argv[2]==='hotel-token'){
        const id=Number(process.argv[3]);
        if(!Number.isSafeInteger(id)||id<1)throw new Error('Supply a valid property ID.');
        const token=randomBytes(32).toString('hex');
        const hash=createHash('sha256').update(token).digest('hex');
        await pool.execute('INSERT INTO mks_hotel_access (listing_id,token_hash) VALUES (?,?)',[id,hash]);
        console.log('Hotel access token (store securely): '+token);
        return;
    }
    await migrate();
    console.log('Booking schema is ready.');
}
if (require.main === module) command().catch(error => {
    console.error(error.code || error.message);
    process.exitCode = 1;
}).finally(() => pool?.end());

module.exports = { pool, transaction };
