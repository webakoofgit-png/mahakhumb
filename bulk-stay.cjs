const {randomBytes,randomUUID}=require('node:crypto');
const {pool,transaction}=require('./booking-db.cjs');
const engine=require('./booking-engine.cjs');
const {text,email,integer,audit,requirePermission}=require('./operations-auth.cjs');
const {requirePartner}=require('./operations-partner.cjs');
const {validSearchDate,destinationLocations}=require('./dist/stay-catalog.js');
const {fail,hash,json,quote,hold,queue,gatewayConfigured}=engine;
const kinds=['Religious group','Tour operator','Travel agency','Pilgrimage organizer','Family group','Corporate or institutional group'];
const diets=['Pure Veg','Jain','Satvik'];
const today=()=>new Date(Date.now()+19800000).toISOString().slice(0,10);
const days=(start,end)=>(Date.parse(end)-Date.parse(start))/86400000;
const refState=`CASE WHEN b.status='confirmed' THEN 'booked' WHEN b.status='held' AND b.expires_at>UTC_TIMESTAMP() THEN 'payment pending'
    WHEN b.status='cancelled' AND b.payment_id IS NOT NULL THEN 'cancelled' WHEN q.replaced=1 THEN 'replaced' WHEN q.expires_at<=UTC_TIMESTAMP() THEN 'expired' ELSE 'offered' END`;
async function submit(input){
    const groupType=text(input.groupType,60);
    if(!kinds.includes(groupType))throw fail(400,'Select a group type.');
    const name=text(input.name,120),address=email(input.email),phone=text(input.phone,30);
    if(!/^\+?[\d(). -]+$/.test(phone)||phone.replace(/\D/g,'').length<8)throw fail(400,'Enter a valid contact phone number.');
    const {checkin,checkout}=input;
    if(!validSearchDate(checkin)||!validSearchDate(checkout)||checkin<today()||days(checkin,checkout)<1||days(checkin,checkout)>90)
        throw fail(400,'Choose valid travel dates for a stay of up to 90 nights.');
    const guests=integer(input.guests,10,5000);
    const destination=text(input.destination,120);
    const budget=input.budget?integer(input.budget,1,42949672)*100:null;
    const units=input.units?integer(input.units,1,5000):null;
    if(!['rooms','beds'].includes(input.unitType)||!Array.isArray(input.food)||input.food.some(item=>!diets.includes(item))||typeof input.transport!=='boolean')
        throw fail(400,'Select valid room, meal and transportation preferences.');
    const food=[...new Set(input.food)];
    const notes=text(input.notes||'',3000,false);
    const occupancy=text(input.occupancy||'',300,false);
    const accessibility=text(input.accessibility||'',1000,false);
    const listing=input.listingId?integer(input.listingId,1,4294967295):null;
    return transaction(async db=>{
        if(listing){
            const [[p]]=await db.execute(`SELECT l.id FROM mks_listings l JOIN mks_property_workflow w ON w.listing_id=l.id
                WHERE l.id=? AND l.demo=0 AND w.state='approved'`,[listing]);
            if(!p)throw fail(404,'This property is no longer accepting group enquiries.');
        }
        const key=hash('bulk-enquiry:'+address);
        await db.execute(`INSERT INTO mks_ops_login_limits(identity_hash,attempts,expires) VALUES (?,0,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE))
            ON DUPLICATE KEY UPDATE attempts=IF(expires<=UTC_TIMESTAMP(),0,attempts),expires=IF(expires<=UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),expires)`,[key]);
        const [[limit]]=await db.execute('SELECT attempts FROM mks_ops_login_limits WHERE identity_hash=? FOR UPDATE',[key]);
        if(limit.attempts>=5)throw fail(429,'Too many enquiries. Try again later.');
        await db.execute('UPDATE mks_ops_login_limits SET attempts=attempts+1 WHERE identity_hash=?',[key]);
        const [row]=await db.execute("INSERT INTO mks_ops_records(area,title,email,details,state,listing_id) VALUES ('groups',?,?,?,'open',?)",
            [groupType+' - '+guests+' guests',address,notes,listing]);
        await db.execute(`INSERT INTO mks_bulk_enquiries(record_id,group_type,guests,checkin,checkout,destination,budget_minor,units,unit_type,
            occupancy,food,transport,accessibility,contact_name,contact_phone) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [row.insertId,groupType,guests,checkin,checkout,destination,budget,units,input.unitType,occupancy,JSON.stringify(food),input.transport,accessibility,name,phone]);
        return {id:row.insertId};
    });
}
function gate(user){if(user.role==='host')requirePartner(user);else requirePermission(user,'groups')}
async function enquiry(db,user,id,lock=false){
    gate(user);
    const [[row]]=await db.execute(`SELECT r.id,r.title,r.email,r.details,r.state,r.listing_id,e.*,u.name AS assignee
        FROM mks_bulk_enquiries e JOIN mks_ops_records r ON r.id=e.record_id
        LEFT JOIN mks_ops_users u ON u.id=e.assigned_to WHERE e.record_id=?
        ${user.role==='host'?'AND EXISTS(SELECT 1 FROM mks_property_workflow w WHERE w.listing_id=r.listing_id AND w.owner_id=?)':''}
        ${lock?'FOR UPDATE':''}`,user.role==='host'?[id,user.id]:[id]);
    if(!row)throw fail(404,'Structured group enquiry not found.');
    return row;
}
async function matches(user,id){
    const e=await enquiry(pool,user,id);
    const nights=days(e.checkin,e.checkout);
    const destinations=destinationLocations(e.destination);
    const filters=['l.demo=0',"COALESCE(w.state,'approved')='approved'",'? BETWEEN COALESCE(v.min_nights,1) AND COALESCE(v.max_nights,90)'];
    const args=[e.guests,e.unit_type==='rooms'?(e.units||1):1,e.checkin,e.checkout,nights];
    if(user.role==='host'){filters.push('w.owner_id=? AND l.id=?');args.push(user.id,e.listing_id)}
    if(e.unit_type==='beds'&&e.units){filters.push('(w.beds IS NULL OR w.beds>=?)');args.push(e.units)}
    for(const item of json(e.food)){
        if(item==='Pure Veg')filters.push("(l.pure_veg=1 OR EXISTS(SELECT 1 FROM mks_listing_amenities a WHERE a.listing_id=l.id AND a.amenity='Pure veg restaurant'))");
        else {filters.push('EXISTS(SELECT 1 FROM mks_listing_amenities a WHERE a.listing_id=l.id AND (a.amenity=? OR a.amenity=?))');args.push(item,item+' food')}
    }
    const preferred=destinations.length?'(location IN ('+destinations.map(()=>'?').join(',')+')) DESC,':'';
    const [rows]=await pool.query(`WITH options AS (
        SELECT l.id,l.name,l.location,t.id AS room_id,t.name AS room,t.capacity,
            GREATEST(CEIL(?/t.capacity),?) AS rooms,COUNT(*) AS covered,MIN(n.remaining) AS remaining,
            SUM(n.rate_minor + n.rate_minor*n.tax_bps/10000) AS unit_estimate
        FROM mks_listings l JOIN mks_room_types t ON t.listing_id=l.id JOIN mks_room_nights n ON n.room_type_id=t.id
        LEFT JOIN mks_property_workflow w ON w.listing_id=l.id LEFT JOIN mks_hotel_stay_rules v ON v.listing_id=l.id
        WHERE n.date>=? AND n.date<? AND n.rate_minor>0 AND ${filters.join(' AND ')}
        AND NOT EXISTS(SELECT 1 FROM mks_hotel_blocked_nights b WHERE b.room_type_id=n.room_type_id AND b.date=n.date)
        GROUP BY l.id,l.name,l.location,t.id,t.name,t.capacity
    )
    SELECT id,name,location,room_id,room,capacity,rooms,remaining,ROUND(unit_estimate*rooms/?) AS estimate_per_person
    FROM options WHERE covered=? AND rooms<=LEAST(remaining,500)
    ORDER BY (id=?) DESC,${preferred}estimate_per_person,id,room_id LIMIT 30`,
    [...args,e.guests,nights,e.listing_id||0,...destinations]);
    return rows;
}
async function detail(user,id){
    const e=await enquiry(pool,user,id);
    const host=user.role==='host';
    const [quotes]=await pool.execute(`SELECT q.id,q.listing_id,q.rooms,q.expires_at,l.name AS property,t.name AS room,q.price_snapshot,q.reference,${refState} AS status FROM mks_bulk_quotes q
        JOIN mks_listings l ON l.id=q.listing_id JOIN mks_room_types t ON t.id=q.room_type_id LEFT JOIN mks_bookings b ON b.reference=q.reference
        WHERE q.record_id=? ${host?'AND q.listing_id=?':''} ORDER BY q.id DESC LIMIT 20`,host?[id,e.listing_id]:[id]);
    const [staff]=host?[[]]:await pool.query("SELECT id,name FROM mks_ops_users WHERE active=1 AND (role='superadmin' OR (role='staff' AND JSON_CONTAINS(permissions,JSON_QUOTE('groups')))) ORDER BY name");
    return {enquiry:{...e,food:json(e.food)},quotes:quotes.map(x=>({...x,price_snapshot:json(x.price_snapshot)})),staff};
}
async function assign(user,id,input){
    requirePermission(user,'groups');
    const assignee=input.assignee?integer(input.assignee,1,4294967295):null;
    const listing=input.listingId?integer(input.listingId,1,4294967295):null;
    const state=input.state;
    if(!['open','in progress','closed'].includes(state))throw fail(400,'Select a valid enquiry status.');
    return transaction(async db=>{
        const e=await enquiry(db,user,id,true);
        if(assignee){
            const [[staff]]=await db.execute("SELECT id FROM mks_ops_users WHERE id=? AND active=1 AND (role='superadmin' OR (role='staff' AND JSON_CONTAINS(permissions,JSON_QUOTE('groups'))))",[assignee]);
            if(!staff)throw fail(400,'Select a staff member with access to group enquiries.');
        }
        if(listing){
            const [[property]]=await db.execute("SELECT l.id FROM mks_listings l JOIN mks_property_workflow w ON w.listing_id=l.id WHERE l.id=? AND l.demo=0 AND w.state='approved'",[listing]);
            if(!property)throw fail(400,'Select an approved listing.');
        }
        if(e.listing_id!==listing){
            const [[reservation]]=await db.execute(`SELECT q.id FROM mks_bulk_quotes q JOIN mks_bookings b ON b.reference=q.reference
                WHERE q.record_id=? AND (b.status='confirmed' OR (b.status='held' AND b.expires_at>UTC_TIMESTAMP())) LIMIT 1`,[id]);
            if(reservation)throw fail(409,'This enquiry has an active reservation and cannot be moved to another property.');
            await db.execute('UPDATE mks_bulk_quotes SET replaced=1 WHERE record_id=? AND replaced=0',[id]);
        }
        await db.execute('UPDATE mks_bulk_enquiries SET assigned_to=? WHERE record_id=?',[assignee,id]);
        await db.execute('UPDATE mks_ops_records SET listing_id=?,state=? WHERE id=?',[listing,state,id]);
        await audit(db,user,'bulk.assign',id,{before:{assignee:e.assigned_to,listing:e.listing_id,state:e.state},after:{assignee,listing,state}});
        return {saved:true};
    });
}
async function makeQuote(user,id,input){
    const roomId=integer(input.roomId,1,4294967295),listingId=integer(input.listingId,1,4294967295),rooms=integer(input.rooms,1,500);
    const hours=integer(input.hours,1,168),terms=text(input.terms||'',3000,false);
    const token=randomBytes(32).toString('hex');
    return transaction(async db=>{
        const e=await enquiry(db,user,id,true);
        if(e.state==='closed')throw fail(409,'Reopen the enquiry before issuing a quote.');
        if(user.role==='host'&&e.listing_id!==listingId)throw fail(403,'Quote only for the assigned property.');
        if(rooms<(e.unit_type==='rooms'?e.units||1:1))throw fail(400,'The quote needs at least the requested number of rooms.');
        const [[active]]=await db.execute(`SELECT q.id FROM mks_bulk_quotes q JOIN mks_bookings b ON b.reference=q.reference WHERE q.record_id=?
            AND (b.status='confirmed' OR (b.status='held' AND b.expires_at>UTC_TIMESTAMP())) LIMIT 1`,[id]);
        if(active)throw fail(409,'This enquiry already has a booking or an active payment hold.');
        const amount=await quote(db,{listingId,roomId,rooms,guests:e.guests,checkin:e.checkin,checkout:e.checkout},false,true);
        if(!amount.available)throw fail(409,'This room category does not have enough inventory for every night.');
        await db.execute('UPDATE mks_bulk_quotes SET replaced=1 WHERE record_id=? AND replaced=0',[id]);
        const [result]=await db.execute(`INSERT INTO mks_bulk_quotes(record_id,listing_id,room_type_id,rooms,terms,price_snapshot,token_hash,expires_at,created_by)
            VALUES (?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? HOUR),?)`,[id,listingId,roomId,rooms,terms,JSON.stringify(amount),hash(token),hours,user.id]);
        await db.execute("UPDATE mks_ops_records SET state='in progress' WHERE id=?",[id]);
        if(process.env.APP_ORIGIN){
            const link=process.env.APP_ORIGIN.replace(/\/$/,'')+'/#/group-quote/'+token;
            await queue(db,'email','bulk-quote-'+result.insertId,{to:e.email,groupQuote:link,reference:id});
        }
        await audit(db,user,'bulk.quote',id,{quoteId:result.insertId,listingId,roomId,rooms,total:amount.total});
        return {token,quoteId:result.insertId};
    });
}
async function contact(user,id,input){
    const message=text(input.message,2500);
    if(!process.env.SMTP_URL||!process.env.SMTP_FROM)throw fail(503,'Email delivery is not configured. Use the recorded customer contact details.');
    return transaction(async db=>{
        const e=await enquiry(db,user,id,true);
        await queue(db,'email','bulk-message-'+randomUUID(),{to:e.email,reference:id,groupMessage:message});
        await audit(db,user,'bulk.contact',id,{message});
        return {queued:true};
    });
}
function privateHash(token){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw fail(404,'Quotation not found.');return hash(token)}
async function privateQuote(db,key,lock=false){
    const [[q]]=await db.execute(`SELECT q.*,l.name AS property,t.name AS room,e.contact_name,e.contact_phone,r.email,r.state,
        b.owner_hash,${refState} AS display_status FROM mks_bulk_quotes q JOIN mks_bulk_enquiries e ON e.record_id=q.record_id
        JOIN mks_ops_records r ON r.id=e.record_id JOIN mks_listings l ON l.id=q.listing_id JOIN mks_room_types t ON t.id=q.room_type_id
        LEFT JOIN mks_bookings b ON b.reference=q.reference WHERE q.token_hash=?${lock?' FOR UPDATE':''}`,[key]);
    if(!q)throw fail(404,'Quotation not found.');
    return q;
}
async function view(token,owner){
    const q=await privateQuote(pool,privateHash(token));
    const amount=json(q.price_snapshot);
    return {id:q.id,property:q.property,room:q.room,terms:q.terms,expiry:q.expires_at.replace(' ','T')+'Z',
        status:q.state==='closed'&&q.display_status==='offered'?'closed':q.display_status,
        quote:{checkin:amount.checkin,checkout:amount.checkout,rooms:amount.rooms,nights:amount.nights,guests:amount.guests,
            subtotal:amount.subtotal,tax:amount.tax,total:amount.total,cancelUntil:amount.cancelUntil,refundBps:amount.refundBps},
        reference:q.owner_hash&&q.owner_hash===owner?q.reference:null,paymentConfigured:gatewayConfigured()};
}
async function accept(token,owner,idempotency){
    if(!owner)throw fail(401,'Start a reservation session first.');
    if(!gatewayConfigured())throw fail(503,'Online payments are not configured.');
    const key=privateHash(token);
    const selected=await privateQuote(pool,key);
    const amount=json(selected.price_snapshot);
    return hold({...amount,name:selected.contact_name,email:selected.email,phone:selected.contact_phone},owner,idempotency,{
        async validate(db){
            await db.execute('SELECT record_id FROM mks_bulk_enquiries WHERE record_id=? FOR UPDATE',[selected.record_id]);
            const q=await privateQuote(db,key,true);
            if(['booked','payment pending'].includes(q.display_status)){
                if(q.owner_hash===owner)return q.reference;
                throw fail(409,'This quote already has an active reservation. Use the browser that accepted it.');
            }
            if(q.display_status!=='offered'||q.state==='closed')throw fail(409,'This quote is no longer available. Request an updated quote.');
            return null;
        },
        async attach(db,reference){
            await db.execute('INSERT INTO mks_bulk_reservation_attempts(reference,quote_id) VALUES (?,?)',[reference,selected.id]);
            await db.execute('UPDATE mks_bulk_quotes SET reference=? WHERE id=?',[reference,selected.id]);
        }
    });
}
module.exports={kinds,diets,submit,detail,matches,assign,makeQuote,contact,view,accept};
