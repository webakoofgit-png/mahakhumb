const {scrypt,randomBytes,timingSafeEqual}=require('node:crypto');
const {promisify}=require('node:util');
const {pool,transaction}=require('./booking-db.cjs');
const {fail,hash,json}=require('./booking-engine.cjs');
const derive=promisify(scrypt);
const permissions=['overview','properties','inventory','bookings','customers','partners','cabs','restaurants','groups','agents','payments','finance','cms','support','reports','staff','settings'];
const dummy='0'.repeat(32)+':'+ '0'.repeat(128);
function text(value,max,required=true){
    if(typeof value!=='string'||value.length>max||value.includes('\0')||(required&&!value.trim()))throw fail(400,'Enter valid values for all required fields.');
    return value.trim();
}
function email(value){const address=text(value,254).toLowerCase();if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address))throw fail(400,'Enter a valid email address.');return address}
function integer(value,min,max){const n=Number(value);if(value===null||value===''||!Number.isSafeInteger(n)||n<min||n>max)throw fail(400,'Enter a number in the allowed range.');return n}
function mediaUrl(value){
    if(!value)return null;
    const url=text(value,1024);
    if(!/^https:\/\/[^\s]+$/.test(url)&&!/^\/media\/property\/\d+$/.test(url))throw fail(400,'Use an HTTPS image URL or an uploaded property photograph.');
    return url;
}
async function passwordHash(value){
    const secret=value;
    if(typeof secret!=='string'||secret.length<12||secret.length>128||!secret.trim())throw fail(400,'Passwords must have at least 12 characters.');
    const salt=randomBytes(16).toString('hex');
    return salt+':'+(await derive(secret,salt,64)).toString('hex');
}
async function passwordMatches(value,encoded){
    const [salt,expected]=encoded.split(':');
    const actual=await derive(value.slice(0,128),salt,64);
    return timingSafeEqual(actual,Buffer.from(expected,'hex'));
}
async function audit(db,user,action,subject,details={}){
    await db.execute('INSERT INTO mks_ops_audit(actor_id,action,subject,change_details) VALUES (?,?,?,?)',[user.id,action,String(subject),JSON.stringify(details)]);
}
async function limitLogin(req,address){
    const keys=[hash('email:'+address),hash('ip:'+req.socket.remoteAddress)].sort();
    await transaction(async db=>{
        for(const key of keys){
            await db.execute(`INSERT INTO mks_ops_login_limits(identity_hash,attempts,expires) VALUES (?,0,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE))
                ON DUPLICATE KEY UPDATE attempts=IF(expires<=UTC_TIMESTAMP(),0,attempts),expires=IF(expires<=UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),expires)`,[key]);
            const [[row]]=await db.execute('SELECT attempts FROM mks_ops_login_limits WHERE identity_hash=? FOR UPDATE',[key]);
            if(row.attempts>=(key===hash('email:'+address)?10:100))throw fail(429,'Too many attempts. Try again in 15 minutes.');
            await db.execute('UPDATE mks_ops_login_limits SET attempts=attempts+1 WHERE identity_hash=?',[key]);
        }
    });
}
function operationsCookie(res,token,age){
    const secure=process.env.NODE_ENV==='production'||process.env.COOKIE_SECURE==='true';
    res.setHeader('Set-Cookie','mks_ops='+token+'; HttpOnly; SameSite=Strict; Path=/api/operations; Max-Age='+age+(secure?'; Secure':''));
}
function token(req){return req.headers.cookie?.match(/(?:^|;\s*)mks_ops=([a-f0-9]{64})(?:;|$)/)?.[1]}
function businessPhone(value){
    const phone=text(value,30);
    if(!/^\+?[\d(). -]+$/.test(phone)||phone.replace(/\D/g,'').length<8)throw fail(400,'Enter a valid business phone number.');
    return phone;
}
function businessContact(input){
    return {name:text(input.businessName,160),email:email(input.businessEmail),phone:businessPhone(input.businessPhone)};
}
async function session(req){
    const key=token(req);
    if(!key)return null;
    const [[user]]=await pool.execute(`SELECT u.id,u.email,u.name,u.role,u.permissions,s.csrf,(h.user_id IS NOT NULL) AS partner,(c.user_id IS NOT NULL) AS cab,dp.driver_id,(dp.verification_state='verified') AS driver_verified,dp.online AS driver_online FROM mks_ops_sessions s
        JOIN mks_ops_users u ON u.id=s.user_id LEFT JOIN mks_hotel_partners h ON h.user_id=u.id LEFT JOIN mks_cab_partners c ON c.user_id=u.id LEFT JOIN mks_cab_driver_profiles dp ON dp.user_id=u.id WHERE s.token_hash=? AND s.expires>UTC_TIMESTAMP() AND u.active=1`,[hash(key)]);
    if(user)user.permissions=user.role==='superadmin'?permissions:json(user.permissions);
    return user||null;
}
async function signIn(req,res,input,register=false){
    const address=email(input.email);
    await limitLogin(req,address);
    const value=typeof input.password==='string'?input.password:'';
    if(register){
        const encoded=await passwordHash(value);
        const name=text(input.name,120);
        const business=['hotel-partner','cab-partner'].includes(input.workspace)?businessContact(input):null;
        const serviceAreas=input.workspace==='cab-partner'?text(input.serviceAreas,1000):null;
        try{
            await transaction(async db=>{
                const [created]=await db.execute("INSERT INTO mks_ops_users(email,name,password_hash,role,permissions) VALUES (?,?,?,'host',JSON_ARRAY())",
                    [address,name,encoded]);
                if(business&&serviceAreas)await db.execute('INSERT INTO mks_cab_partners(user_id,business_name,business_email,business_phone,service_areas) VALUES (?,?,?,?,?)',
                    [created.insertId,business.name,business.email,business.phone,serviceAreas]);
                else if(business)await db.execute('INSERT INTO mks_hotel_partners(user_id,business_name,business_email,business_phone) VALUES (?,?,?,?)',
                    [created.insertId,business.name,business.email,business.phone]);
            });
        }catch(error){if(error.code==='ER_DUP_ENTRY')throw fail(409,'An account already uses that email. Sign in instead.');throw error}
    }
    const [[user]]=await pool.execute('SELECT * FROM mks_ops_users WHERE email=?',[address]);
    const matches=await passwordMatches(value,user?.password_hash||dummy);
    if(!matches||!user?.active)throw fail(401,'Email or password is incorrect.');
    const key=randomBytes(32).toString('hex');
    const csrf=randomBytes(24).toString('hex');
    await transaction(async db=>{
        await db.execute('DELETE FROM mks_ops_sessions WHERE expires<=UTC_TIMESTAMP() LIMIT 100');
        if(token(req))await db.execute('DELETE FROM mks_ops_sessions WHERE token_hash=?',[hash(token(req))]);
        await db.execute('INSERT INTO mks_ops_sessions VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))',[hash(key),user.id,csrf]);
        await audit(db,user,register?'host.register':'session.login',user.id);
    });
    operationsCookie(res,key,28800);
    return {id:user.id,name:user.name,role:user.role,csrf,permissions:user.role==='superadmin'?permissions:json(user.permissions)};
}
async function signOut(req,res,user){
    await transaction(async db=>{
        await db.execute('DELETE FROM mks_ops_sessions WHERE token_hash=?',[hash(token(req))]);
        await audit(db,user,'session.logout',user.id);
    });
    operationsCookie(res,'',0);
}
function requirePermission(user,permission){
    if(user.role==='host'||!user.permissions.includes(permission))throw fail(403,'You do not have permission for this action.');
}
function requireCsrf(req,user){
    const supplied=req.headers['x-csrf-token'];
    if(typeof supplied!=='string'||! /^[a-f0-9]{48}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(user.csrf)))throw fail(403,'Your session changed. Reload and try again.');
}
async function bootstrap(){
    const address=email(process.env.ADMIN_EMAIL);
    const encoded=await passwordHash(process.env.ADMIN_PASSWORD);
    await pool.execute("INSERT INTO mks_ops_users(email,name,password_hash,role,permissions) VALUES (?, 'Super Admin',?,'superadmin',JSON_ARRAY())",[address,encoded]);
    console.log('Super admin account created.');
}
if(require.main===module)bootstrap().catch(error=>{console.error(error.code||error.message);process.exitCode=1}).finally(()=>pool?.end());
module.exports={businessPhone,businessContact,permissions,text,email,integer,mediaUrl,passwordHash,audit,session,signIn,signOut,requirePermission,requireCsrf};
