const {pool,transaction}=require('./booking-db.cjs');
const {fail}=require('./booking-engine.cjs');
const {text,integer,businessContact,audit}=require('./operations-auth.cjs');

function requirePartner(user){
    if(user.role!=='host'||!user.partner)throw fail(403,'Sign in with a hotel partner account.');
}
async function profile(user,input){
    requirePartner(user);
    if(!input){
        const [[p]]=await pool.execute(`SELECT h.*,u.name,u.email FROM mks_hotel_partners h JOIN mks_ops_users u ON u.id=h.user_id WHERE h.user_id=?`,[user.id]);
        return p;
    }
    const name=text(input.name,120);
    const business=businessContact(input);
    if(typeof input.notifications!=='boolean')throw fail(400,'Select a notification preference.');
    return transaction(async db=>{
        const [[before]]=await db.execute('SELECT business_name,business_email,business_phone,booking_notifications FROM mks_hotel_partners WHERE user_id=? FOR UPDATE',[user.id]);
        await db.execute('UPDATE mks_ops_users SET name=? WHERE id=?',[name,user.id]);
        await db.execute(`UPDATE mks_hotel_partners SET business_name=?,business_email=?,business_phone=?,booking_notifications=? WHERE user_id=?`,
            [business.name,business.email,business.phone,input.notifications,user.id]);
        await audit(db,user,'partner.profile',user.id,{before,after:business,notifications:input.notifications});
        return {saved:true};
    });
}
async function stats(user){
    requirePartner(user);
    const today=indiaDate();
    const [[properties]]=await pool.execute(`SELECT COUNT(*) AS properties,COALESCE(SUM(state='approved'),0) AS approved,
        COALESCE(SUM(state='submitted'),0) AS review FROM mks_property_workflow WHERE owner_id=?`,[user.id]);
    const [[bookings]]=await pool.execute(`SELECT
        COALESCE(SUM(b.status='confirmed' AND b.checkout>?),0) AS active,
        COALESCE(SUM(b.status='confirmed' AND b.checkin=? AND s.checked_in IS NULL),0) AS arrivals,
        COALESCE(SUM(b.status='confirmed' AND b.checkout=? AND s.checked_in IS NOT NULL AND s.checked_out IS NULL),0) AS departures,
        COALESCE(SUM(b.status='cancelled'),0) AS cancellations
        FROM mks_bookings b JOIN mks_property_workflow w ON w.listing_id=b.listing_id
        LEFT JOIN mks_hotel_guest_stays s ON s.reference=b.reference
        WHERE w.owner_id=? AND b.payment_id IS NOT NULL`,[today,today,today,user.id]);
    const [[groups]]=await pool.execute(`SELECT COUNT(*) AS enquiries FROM mks_ops_records r JOIN mks_property_workflow w ON w.listing_id=r.listing_id
        WHERE w.owner_id=? AND r.area='groups' AND r.state='open'`,[user.id]);
    return {...properties,...bookings,...groups};
}
function indiaDate(){return new Date(Date.now()+19800000).toISOString().slice(0,10)}
async function guestMovement(user,reference,action){
    requirePartner(user);
    if(!['check-in','check-out'].includes(action))throw fail(400,'Choose a valid guest action.');
    return transaction(async db=>{
        const [[b]]=await db.execute(`SELECT b.reference,b.status,b.payment_id,b.checkin,b.checkout FROM mks_bookings b
            JOIN mks_property_workflow w ON w.listing_id=b.listing_id WHERE b.reference=? AND w.owner_id=? FOR UPDATE`,[reference,user.id]);
        if(!b)throw fail(404,'Reservation not found.');
        if(b.status!=='confirmed'||!b.payment_id)throw fail(409,'Guest activity is available for confirmed reservations.');
        const [[stay]]=await db.execute('SELECT checked_in,checked_out FROM mks_hotel_guest_stays WHERE reference=? FOR UPDATE',[reference]);
        if((action==='check-in'&&stay?.checked_in)||(action==='check-out'&&stay?.checked_out))return {saved:true};
        if(action==='check-in'){
            const today=indiaDate();
            if(today<b.checkin||today>=b.checkout)throw fail(409,'Check-in must be during the reserved stay dates.');
            await db.execute('INSERT INTO mks_hotel_guest_stays(reference,checked_in,checked_in_by) VALUES (?,UTC_TIMESTAMP(),?)',[reference,user.id]);
        }else{
            if(!stay?.checked_in)throw fail(409,'Record check-in before check-out.');
            await db.execute('UPDATE mks_hotel_guest_stays SET checked_out=UTC_TIMESTAMP(),checked_out_by=? WHERE reference=?',[user.id,reference]);
        }
        await audit(db,user,'guest.'+action,reference);
        return {saved:true};
    });
}
async function groups(user,q,offset,limit){
    requirePartner(user);
    const [rows]=await pool.query(`SELECT r.id,r.title,r.email,r.details,r.state,r.created_at,l.name AS property,EXISTS(SELECT 1 FROM mks_bulk_enquiries e WHERE e.record_id=r.id) AS structured,
        (SELECT CASE WHEN b.status='confirmed' THEN 'Booked' WHEN b.status='held' AND b.expires_at>UTC_TIMESTAMP() THEN 'Payment pending'
            WHEN b.status='cancelled' AND b.payment_id IS NOT NULL THEN 'Cancelled' WHEN q.replaced=0 AND q.expires_at>UTC_TIMESTAMP() THEN 'Quoted' END
         FROM mks_bulk_quotes q LEFT JOIN mks_bookings b ON b.reference=q.reference WHERE q.record_id=r.id AND q.listing_id=r.listing_id
         ORDER BY q.id DESC LIMIT 1) AS quote_status
        FROM mks_ops_records r JOIN mks_property_workflow w ON w.listing_id=r.listing_id JOIN mks_listings l ON l.id=w.listing_id
        WHERE r.area='groups' AND w.owner_id=? AND (r.title LIKE ? OR l.name LIKE ?) ORDER BY r.id DESC LIMIT ? OFFSET ?`,
        [user.id,'%'+q+'%','%'+q+'%',limit,offset]);
    return rows;
}
async function changeGroup(user,id,state){
    requirePartner(user);
    if(!['open','in progress','closed'].includes(state))throw fail(400,'Choose a valid enquiry status.');
    return transaction(async db=>{
        const [[row]]=await db.execute(`SELECT r.id,r.state FROM mks_ops_records r JOIN mks_property_workflow w ON w.listing_id=r.listing_id
            WHERE r.area='groups' AND r.id=? AND w.owner_id=? FOR UPDATE`,[id,user.id]);
        if(!row)throw fail(404,'Enquiry not found.');
        await db.execute('UPDATE mks_ops_records SET state=? WHERE id=?',[state,id]);
        await audit(db,user,'partner.group.status',id,{before:row.state,after:state});
        return {saved:true};
    });
}
async function reviews(user,q,offset,limit){
    requirePartner(user);
    const [rows]=await pool.query(`SELECT r.id,r.rating,r.comment,l.name AS property,p.reply FROM mks_guest_reviews r
        JOIN mks_listings l ON l.id=r.listing_id JOIN mks_property_workflow w ON w.listing_id=r.listing_id
        LEFT JOIN mks_hotel_review_replies p ON p.review_id=r.id
        WHERE w.owner_id=? AND r.verified_stay=1 AND r.published=1 AND l.name LIKE ? ORDER BY r.id DESC LIMIT ? OFFSET ?`,
        [user.id,'%'+q+'%',limit,offset]);
    return rows;
}
async function reply(user,id,input){
    requirePartner(user);
    const response=text(input.reply,2000);
    return transaction(async db=>{
        const [[review]]=await db.execute(`SELECT r.id FROM mks_guest_reviews r JOIN mks_property_workflow w ON w.listing_id=r.listing_id
            WHERE r.id=? AND r.verified_stay=1 AND r.published=1 AND w.owner_id=? FOR UPDATE`,[id,user.id]);
        if(!review)throw fail(404,'Review not found.');
        await db.execute(`INSERT INTO mks_hotel_review_replies(review_id,reply,author_id) VALUES (?,?,?)
            ON DUPLICATE KEY UPDATE reply=VALUES(reply),author_id=VALUES(author_id)`,[id,response,user.id]);
        await audit(db,user,'partner.review.reply',id);
        return {saved:true};
    });
}
module.exports={requirePartner,profile,stats,guestMovement,groups,changeGroup,reviews,reply};
