const {pool,transaction}=require('./booking-db.cjs');
const {fail,lockedBooking,cancelLocked,queueRefund}=require('./booking-engine.cjs');
const {text,email,integer,mediaUrl,permissions,passwordHash,audit,requirePermission}=require('./operations-auth.cjs');

const records={
    partners:{states:['pending','active','suspended'],label:'Hotel partner'},
    cabs:{states:['pending','active','suspended'],label:'Cab partner'},
    restaurants:{states:['pending','active','suspended'],label:'Restaurant'},
    groups:{states:['open','in progress','closed'],label:'Group enquiry'},
    agents:{states:['pending','active','suspended'],label:'Agent'},
    support:{states:['open','in progress','closed'],label:'Support ticket'},
    cms:{states:['draft','published','archived'],label:'Content'}
};
const cmsTypes=['Homepage banner','Featured hotel','Blog post','FAQ','Kumbh information','Website announcement'];
function recordArea(area){if(!Object.hasOwn(records,area))throw fail(404,'Module not found.');return records[area]}
async function recordList(user,area,query,offset,limit){
    if(user.role==='host'){if(area!=='support')throw fail(403,'This section is unavailable.')}
    else requirePermission(user,area);
    recordArea(area);
    const args=[area];
    const where=['area=?'];
    if(user.role==='host'){where.push('owner_id=?');args.push(user.id)}
    if(query){where.push('title LIKE ?');args.push('%'+query+'%')}
    const [rows]=await pool.query(`SELECT r.*, (
        SELECT CASE WHEN b.status='confirmed' THEN 'Booked' WHEN b.status='held' AND b.expires_at>UTC_TIMESTAMP() THEN 'Payment pending'
            WHEN b.status='cancelled' AND b.payment_id IS NOT NULL THEN 'Cancelled' WHEN q.replaced=0 AND q.expires_at>UTC_TIMESTAMP() THEN 'Quoted' END
        FROM mks_bulk_quotes q LEFT JOIN mks_bookings b ON b.reference=q.reference WHERE q.record_id=r.id ORDER BY q.id DESC LIMIT 1
    ) AS quote_status, EXISTS(SELECT 1 FROM mks_bulk_enquiries e WHERE e.record_id=r.id) AS structured FROM mks_ops_records r WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`,[...args,limit,offset]);
    return rows;
}
async function saveRecord(user,area,id,input){
    const descriptor=recordArea(area);
    if(user.role==='host'){if(area!=='support'||id)throw fail(403,'Hosts can create support tickets.')}
    else requirePermission(user,area);
    const title=text(input.title,180),details=text(input.details,12000),contact=input.email?email(input.email):(user.role==='host'?user.email:null);
    const state=user.role==='host'?'open':input.state;
    if(!descriptor.states.includes(state))throw fail(400,'Select a valid status.');
    const listing=input.listingId?integer(input.listingId,1,4294967295):null;
    const category=area==='cms'?text(input.category,50):null;
    if(category&&!cmsTypes.includes(category))throw fail(400,'Select a valid content type.');
    if(category==='Featured hotel'&&!listing)throw fail(400,'Choose a property ID to feature.');
    return transaction(async db=>{
        if(listing){
            const [[item]]=await db.execute(`SELECT l.id FROM mks_listings l LEFT JOIN mks_property_workflow w ON w.listing_id=l.id
                WHERE l.id=? AND l.demo=0 AND (?=0 OR w.owner_id=?)`,[listing,user.role==='host'?1:0,user.id]);
            if(!item)throw fail(400,'Property not found.');
        }
        const stored=category?JSON.stringify({category,body:details,image:mediaUrl(input.image)}):details;
        if(id){
            const [[prior]]=await db.execute('SELECT title,state FROM mks_ops_records WHERE id=? AND area=? FOR UPDATE',[id,area]);
            if(!prior)throw fail(404,'Record not found.');
            await db.execute('UPDATE mks_ops_records SET title=?,email=?,details=?,state=?,listing_id=? WHERE id=?',[title,contact,stored,state,listing,id]);
            await audit(db,user,area+'.edit',id,{from:prior,to:{title,state}});
        }else{
            const [row]=await db.execute('INSERT INTO mks_ops_records(area,title,email,details,state,listing_id,owner_id) VALUES (?,?,?,?,?,?,?)',
                [area,title,contact,stored,state,listing,user.role==='host'?user.id:null]);
            id=row.insertId;
            await audit(db,user,area+'.create',id,{title,state});
        }
        return {id};
    });
}
async function publicContent(){
    const [rows]=await pool.query(`SELECT r.id,r.area,r.title,r.details,r.listing_id,l.name AS property_name FROM mks_ops_records r
        LEFT JOIN mks_listings l ON l.id=r.listing_id AND l.demo=0
        LEFT JOIN mks_property_workflow w ON w.listing_id=l.id
        WHERE r.area='cms' AND r.state='published' AND (r.listing_id IS NULL OR (l.id IS NOT NULL AND COALESCE(w.state,'approved')='approved'))
        ORDER BY r.id DESC LIMIT 150`);
    return rows.map(row=>({...row,...JSON.parse(row.details)}));
}
async function publicEnquiry(input){
    const area=input.area==='groups'?'groups':'support';
    const address=email(input.email);
    const title=text(input.title,180),details=text(input.details,3000);
    const listing=area==='groups'&&input.listingId?integer(input.listingId,1,4294967295):null;
    return transaction(async db=>{
        if(listing){
            const [[live]]=await db.execute(`SELECT l.id FROM mks_listings l JOIN mks_property_workflow w ON w.listing_id=l.id
                JOIN mks_hotel_partners h ON h.user_id=w.owner_id WHERE l.id=? AND l.demo=0 AND w.state='approved'`,[listing]);
            if(!live)throw fail(404,'This hotel is not accepting property-specific enquiries.');
        }
        const key=require('./booking-engine.cjs').hash('enquiry:'+address);
        await db.execute(`INSERT INTO mks_ops_login_limits(identity_hash,attempts,expires) VALUES (?,0,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE))
            ON DUPLICATE KEY UPDATE attempts=IF(expires<=UTC_TIMESTAMP(),0,attempts),expires=IF(expires<=UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),expires)`,[key]);
        const [[limit]]=await db.execute('SELECT attempts FROM mks_ops_login_limits WHERE identity_hash=? FOR UPDATE',[key]);
        if(limit.attempts>=5)throw fail(429,'Too many enquiries. Please try again later.');
        await db.execute('UPDATE mks_ops_login_limits SET attempts=attempts+1 WHERE identity_hash=?',[key]);
        const [row]=await db.execute("INSERT INTO mks_ops_records(area,title,email,details,state,listing_id) VALUES (?,?,?,?,'open',?)",[area,title,address,details,listing]);
        return {id:row.insertId};
    });
}
const balanceSql=`WITH earnings AS (
    SELECT b.listing_id, SUM(p.amount-COALESCE(p.refund_amount,0)) AS net,
      SUM(ROUND((p.amount-COALESCE(p.refund_amount,0))*COALESCE(c.commission_bps,0)/10000)) AS commission
    FROM mks_bookings b JOIN mks_payments p ON p.id=b.payment_id LEFT JOIN mks_ops_commissions c ON c.reference=b.reference GROUP BY b.listing_id
), paid AS (SELECT listing_id,SUM(amount) AS paid FROM mks_ops_payouts GROUP BY listing_id)
SELECT l.id,l.name,COALESCE(e.net,0) AS net,COALESCE(e.commission,0) AS commission,COALESCE(p.paid,0) AS paid,
  COALESCE(e.net-e.commission,0)-COALESCE(p.paid,0) AS due
FROM mks_listings l LEFT JOIN earnings e ON e.listing_id=l.id LEFT JOIN paid p ON p.listing_id=l.id`;
async function accounts(user){
    const host=user.role==='host';
    if(!host)requirePermission(user,'finance');
    const where=host?' WHERE l.id IN (SELECT listing_id FROM mks_property_workflow WHERE owner_id=?)':' WHERE l.demo=0';
    const params=host?[user.id]:[];
    const [balances]=await pool.execute(balanceSql+where+' ORDER BY l.name LIMIT 200',params);
    const [payouts]=await pool.execute('SELECT p.id,p.listing_id,l.name,p.amount,p.external_reference,p.created_at FROM mks_ops_payouts p JOIN mks_listings l ON l.id=p.listing_id'+
        where+' ORDER BY p.id DESC LIMIT 200',params);
    return {balances,payouts};
}
async function recordPayout(user,input){
    requirePermission(user,'finance');
    const id=integer(input.listingId,1,4294967295),amount=integer(input.amount,1,4294967295),reference=text(input.reference,100);
    return transaction(async db=>{
        const [[p]]=await db.execute('SELECT id FROM mks_listings WHERE id=? AND demo=0 FOR UPDATE',[id]);
        if(!p)throw fail(404,'Property not found.');
        const [[existing]]=await db.execute('SELECT listing_id,amount FROM mks_ops_payouts WHERE external_reference=?',[reference]);
        if(existing){
            if(existing.listing_id===id&&existing.amount===amount)return {recorded:true};
            throw fail(409,'That payout reference is already in use.');
        }
        const [[balance]]=await db.execute(balanceSql+' WHERE l.id=?',[id]);
        if(balance.due<amount)throw fail(409,'Payout exceeds the current amount due.');
        await db.execute('INSERT INTO mks_ops_payouts(listing_id,amount,external_reference,recorded_by) VALUES (?,?,?,?)',[id,amount,reference,user.id]);
        await audit(db,user,'payout.record',id,{amount,reference});
        return {recorded:true};
    });
}
async function overview(user){
    requirePermission(user,'overview');
    const queries=[
        `SELECT COUNT(*) AS registered,COALESCE(SUM(l.verified AND COALESCE(w.state,'approved')='approved'),0) AS verified
         FROM mks_listings l LEFT JOIN mks_property_workflow w ON w.listing_id=l.id WHERE l.demo=0`,
        `SELECT COALESCE(SUM(status='confirmed' AND checkout>=CURRENT_DATE),0) AS active,
          COALESCE(SUM(status='held' AND expires_at>UTC_TIMESTAMP()),0) AS pending,
          COALESCE(SUM(IF(payment_id IS NOT NULL,total,0)),0) AS gross FROM mks_bookings`,
        `SELECT COUNT(*) AS refunds FROM mks_payments WHERE refund_status IN ('queued','pending','failed')`,
        `SELECT COALESCE(SUM(commission),0) AS commission,COALESCE(SUM(GREATEST(due,0)),0) AS pendingPayouts FROM (${balanceSql}) b`,
        `SELECT DATE(created_at) AS date,COUNT(*) AS count,SUM(total) AS value FROM mks_bookings
          WHERE payment_id IS NOT NULL AND created_at>=CURRENT_DATE-INTERVAL 29 DAY GROUP BY DATE(created_at) ORDER BY date`,
        `SELECT type AS category,COUNT(*) AS count FROM mks_listings WHERE demo=0 GROUP BY type ORDER BY count DESC`
    ];
    const [[properties],[bookings],[refunds],[finance],[trend],[distribution]]=await Promise.all(queries.map(q=>pool.query(q)));
    return {...properties[0],...bookings[0],...refunds[0],...finance[0],trend,distribution};
}
async function bookingList(user,request,paymentOnly=false,report=false){
    if(user.role!=='host')requirePermission(user,report?'reports':paymentOnly?'payments':'bookings');
    const where=[],args=[];
    if(user.role==='host'){where.push("b.status IN ('confirmed','cancelled') AND b.payment_id IS NOT NULL AND b.listing_id IN (SELECT listing_id FROM mks_property_workflow WHERE owner_id=?)");args.push(user.id)}
    if(paymentOnly)where.push('p.id IS NOT NULL');
    if(request.q){const term='%'+request.q+'%';where.push('(b.reference LIKE ? OR l.name LIKE ? OR b.guest_email LIKE ?)');args.push(term,term,term)}
    if(request.status){
        if(!['held','confirmed','expired','cancelled'].includes(request.status))throw fail(400,'Select a valid booking status.');
        where.push(request.status==='expired'?"(b.status='expired' OR (b.status='held' AND b.expires_at<=UTC_TIMESTAMP()))":
            request.status==='held'?"(b.status='held' AND b.expires_at>UTC_TIMESTAMP())":'b.status=?');
        if(['confirmed','cancelled'].includes(request.status))args.push(request.status);
    }
    const join=paymentOnly?'p.reference=b.reference':'p.id=b.payment_id';
    const guest=report?'':',b.guest_name,b.guest_email,b.guest_phone';
    const [rows]=await pool.query(`SELECT b.reference,l.name AS property,t.name AS room,b.checkin,b.checkout,b.rooms,b.guests,b.total,
        IF(b.status='held' AND b.expires_at<=UTC_TIMESTAMP(),'expired',b.status) AS status,p.id AS payment,p.amount,p.refund_amount,p.refund_status,s.checked_in,s.checked_out${guest}
        FROM mks_bookings b JOIN mks_listings l ON l.id=b.listing_id JOIN mks_room_types t ON t.id=b.room_type_id
        LEFT JOIN mks_payments p ON ${join} LEFT JOIN mks_hotel_guest_stays s ON s.reference=b.reference ${where.length?'WHERE '+where.join(' AND '):''}
        ORDER BY b.created_at DESC,b.reference DESC LIMIT ? OFFSET ?`,[...args,request.limit,request.offset]);
    return rows;
}
async function intervene(user,reference,input){
    const action=input.action;
    requirePermission(user,action==='cancel'?'bookings':'payments');
    const reason=text(input.reason,1000);
    return transaction(async db=>{
        const booking=await lockedBooking(db,reference);
        if(!booking)throw fail(404,'Booking not found.');
        if(action==='cancel')await cancelLocked(db,booking);
        else if(action==='refund'){
            const id=text(input.payment,80);
            const [[p]]=await db.execute('SELECT * FROM mks_payments WHERE id=? AND reference=? FOR UPDATE',[id,reference]);
            if(!p||!['cancelled','expired'].includes(booking.status))throw fail(409,'Cancel the reservation before requesting a refund.');
            const amount=integer(input.amount,1,p.amount);
            if(p.refund_status&&p.refund_amount!==amount)throw fail(409,'A refund for a different amount is already recorded.');
            if(!p.refund_status)await queueRefund(db,id,amount);
        }else throw fail(400,'Unsupported booking action.');
        await audit(db,user,'booking.'+action,reference,{reason,payment:input.payment||null,amount:input.amount||null});
        return {saved:true};
    });
}
async function customers(user,query,offset,limit){
    requirePermission(user,'customers');
    const [rows]=await pool.query(`SELECT guest_email AS email,MAX(guest_name) AS name,MAX(guest_phone) AS phone,COUNT(*) AS bookings,MAX(created_at) AS latest
        FROM mks_bookings WHERE guest_email LIKE ? OR guest_name LIKE ? GROUP BY guest_email ORDER BY latest DESC LIMIT ? OFFSET ?`,
        ['%'+query+'%','%'+query+'%',limit,offset]);
    return rows;
}
async function staff(user,offset,limit){
    requirePermission(user,'staff');
    const [rows]=await pool.query("SELECT id,name,email,role,permissions,active FROM mks_ops_users WHERE role<>'host' ORDER BY id LIMIT ? OFFSET ?",[limit,offset]);
    return rows;
}
async function saveStaff(user,id,input){
    if(user.role!=='superadmin')throw fail(403,'Only a super admin can change staff access.');
    const allowed=[...new Set(Array.isArray(input.permissions)?input.permissions:[])];
    if(allowed.some(p=>!permissions.includes(p)))throw fail(400,'Select valid permissions.');
    const name=text(input.name,120),address=email(input.email),password=input.password?await passwordHash(input.password):null;
    return transaction(async db=>{
        if(id){
            const [[existing]]=await db.execute('SELECT role FROM mks_ops_users WHERE id=? FOR UPDATE',[id]);
            if(existing?.role!=='staff')throw fail(403,'Only staff accounts can be changed here.');
            await db.execute('UPDATE mks_ops_users SET name=?,email=?,permissions=?,active=?,password_hash=COALESCE(?,password_hash) WHERE id=?',
                [name,address,JSON.stringify(allowed),input.active===true,password,id]);
            await db.execute('DELETE FROM mks_ops_sessions WHERE user_id=?',[id]);
        }else{
            if(!password)throw fail(400,'Enter an initial staff password.');
            const [row]=await db.execute("INSERT INTO mks_ops_users(email,name,password_hash,role,permissions) VALUES (?,?,?,'staff',?)",
                [address,name,password,JSON.stringify(allowed)]);
            id=row.insertId;
        }
        await audit(db,user,'staff.save',id,{permissions:allowed,active:input.active===true});
        return {id};
    });
}
async function settings(user,input){
    requirePermission(user,'settings');
    if(!input){const [[row]]=await pool.query('SELECT commission_bps FROM mks_ops_settings WHERE id=1');return row}
    const bps=integer(input.commissionBps,0,10000);
    return transaction(async db=>{
        const [[previous]]=await db.query('SELECT commission_bps FROM mks_ops_settings WHERE id=1 FOR UPDATE');
        await db.execute('UPDATE mks_ops_settings SET commission_bps=? WHERE id=1',[bps]);
        await audit(db,user,'settings.commission',1,{before:previous.commission_bps,after:bps});
        return {commission_bps:bps};
    });
}
module.exports={records,cmsTypes,recordList,saveRecord,publicContent,publicEnquiry,accounts,recordPayout,overview,bookingList,intervene,customers,staff,saveStaff,settings};
