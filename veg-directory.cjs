const {pool,transaction}=require('./booking-db.cjs');
const {fail}=require('./booking-engine.cjs');
const {text,email,integer,businessPhone,audit,requirePermission}=require('./operations-auth.cjs');
function coordinate(value,range){
    if(value===''||value===null||value===undefined||!Number.isFinite(Number(value))||Math.abs(Number(value))>range)throw fail(400,'Enter valid map coordinates.');
    return Number(value);
}
async function restaurants(page,admin=false,filters={}){
    const clauses=[admin?"r.state<>'deleted'":"r.state='approved' AND r.verified=1"],args=[];
    if(page.q){clauses.push('(r.name LIKE ? OR r.location LIKE ?)');args.push('%'+page.q+'%','%'+page.q+'%')}
    if(filters.jain)clauses.push('r.jain=1');
    if(filters.satvik)clauses.push('r.satvik=1');
    if(filters.capacity){clauses.push('r.dining_capacity>=?');args.push(integer(filters.capacity,1,5000))}
    const nearby=filters.hotel?`JOIN (
        SELECT x.restaurant_id,MIN(x.distance) AS distance FROM mks_veg_distances x
        JOIN mks_listings l ON l.id=x.listing_id LEFT JOIN mks_property_workflow w ON w.listing_id=l.id
        WHERE x.listing_id=? AND l.demo=0 AND COALESCE(w.state,'approved')='approved' GROUP BY x.restaurant_id
    ) near_hotel ON near_hotel.restaurant_id=r.id`:'';
    const target=filters.hotel?[integer(filters.hotel,1,4294967295)]:[];
    const [rows]=await pool.query(`SELECT r.id,r.name,r.location,r.address,r.latitude,r.longitude,r.opening_hours,r.phone,r.email,r.description,r.jain,r.satvik,
        r.dining_capacity,r.verified,r.state${nearby?',near_hotel.distance AS hotel_distance':''}
        FROM mks_veg_restaurants r ${nearby} WHERE ${clauses.join(' AND ')}
        ORDER BY ${nearby?'near_hotel.distance,':''}r.name,r.id LIMIT ? OFFSET ?`,[...target,...args,page.limit,page.offset]);
    return rows;
}
async function detail(id,admin=false){
    const [[row]]=await pool.execute('SELECT '+(admin?'*':'id,name,location,address,latitude,longitude,opening_hours,phone,email,description,jain,satvik,dining_capacity,verified')+
        ' FROM mks_veg_restaurants WHERE id=? AND '+(admin?"state<>'deleted'":"state='approved' AND verified=1"),[id]);
    if(!row)throw fail(404,'Restaurant not found.');
    const [distances]=await pool.execute(`SELECT d.id,d.distance,d.landmark,d.listing_id,l.name AS hotel FROM mks_veg_distances d LEFT JOIN mks_listings l ON l.id=d.listing_id
        LEFT JOIN mks_property_workflow w ON w.listing_id=l.id WHERE d.restaurant_id=?
        ${admin?'':"AND (d.listing_id IS NULL OR (l.demo=0 AND COALESCE(w.state,'approved')='approved'))"} ORDER BY d.distance,d.id`,[id]);
    return {...row,distances};
}
async function save(user,id,input){
    requirePermission(user,'restaurants');
    const name=text(input.name,160),location=text(input.location,120),address=text(input.address,400),hours=text(input.hours,400);
    const latitude=coordinate(input.latitude,90),longitude=coordinate(input.longitude,180),phone=businessPhone(input.phone);
    const contact=input.email?email(input.email):null,description=text(input.description||'',2000,false),capacity=integer(input.capacity,1,5000);
    if(typeof input.jain!=='boolean'||typeof input.satvik!=='boolean')throw fail(400,'Select the available meal options.');
    const fields=[name,location,address,latitude,longitude,hours,phone,contact,description,capacity,input.jain,input.satvik];
    return transaction(async db=>{
        if(id){
            const [[old]]=await db.execute("SELECT state FROM mks_veg_restaurants WHERE id=? AND state<>'deleted' FOR UPDATE",[id]);
            if(!old)throw fail(404,'Restaurant not found.');
            await db.execute(`UPDATE mks_veg_restaurants SET name=?,location=?,address=?,latitude=?,longitude=?,opening_hours=?,phone=?,email=?,description=?,
                dining_capacity=?,jain=?,satvik=?,state='draft',verified=0,verification_note=NULL WHERE id=?`,[...fields,id]);
        }else{
            const [insert]=await db.execute(`INSERT INTO mks_veg_restaurants(name,location,address,latitude,longitude,opening_hours,phone,email,description,
                dining_capacity,jain,satvik) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,fields);
            id=insert.insertId;
        }
        await audit(db,user,'restaurant.save',id,{name,state:'draft'});
        return {id};
    });
}
async function transition(user,id,input){
    requirePermission(user,'restaurants');
    if(!['approve','delete','withdraw'].includes(input.action))throw fail(400,'Choose a valid publication action.');
    const note=text(input.note||'',1000);
    if(input.action==='approve'&&input.verified!==true)throw fail(400,'Confirm pure veg verification before approval.');
    return transaction(async db=>{
        const [[row]]=await db.execute("SELECT state FROM mks_veg_restaurants WHERE id=? AND state<>'deleted' FOR UPDATE",[id]);
        if(!row)throw fail(404,'Restaurant not found.');
        const state={approve:'approved',delete:'deleted',withdraw:'draft'}[input.action];
        await db.execute('UPDATE mks_veg_restaurants SET state=?,verified=?,verification_note=? WHERE id=?',
            [state,state==='approved',state==='approved'?note:null,id]);
        await audit(db,user,'restaurant.'+input.action,id,{before:row.state,after:state,note});
        return {state};
    });
}
async function distance(user,id,input){
    requirePermission(user,'restaurants');
    return transaction(async db=>{
        const [[row]]=await db.execute("SELECT id FROM mks_veg_restaurants WHERE id=? AND state<>'deleted' FOR UPDATE",[id]);
        if(!row)throw fail(404,'Restaurant not found.');
        if(input.removeId){
            const key=integer(input.removeId,1,4294967295);
            const [result]=await db.execute('DELETE FROM mks_veg_distances WHERE restaurant_id=? AND id=?',[id,key]);
            if(!result.affectedRows)throw fail(404,'Distance record not found.');
            await audit(db,user,'restaurant.distance.remove',id,{distanceId:key});
            return {saved:true};
        }
        const hotel=input.hotel?integer(input.hotel,1,4294967295):null;
        const landmark=input.landmark?text(input.landmark,120):null;
        const km=Number(input.km);
        if((hotel===null)===(landmark===null)||input.km===''||input.km==null||!Number.isFinite(km)||km<0||km>1000)
            throw fail(400,'Enter a hotel or landmark and a verified distance in kilometres.');
        if(hotel){
            const [[exists]]=await db.execute("SELECT id FROM mks_listings WHERE id=? AND demo=0",[hotel]);
            if(!exists)throw fail(400,'Choose an existing hotel.');
        }
        const keyColumn=hotel?'listing_id':'landmark';
        const target=hotel||landmark;
        const [[existing]]=await db.execute('SELECT id FROM mks_veg_distances WHERE restaurant_id=? AND '+keyColumn+'=?',[id,target]);
        if(existing)await db.execute('UPDATE mks_veg_distances SET distance=? WHERE id=?',[km,existing.id]);
        else await db.execute('INSERT INTO mks_veg_distances(restaurant_id,listing_id,landmark,distance) VALUES (?,?,?,?)',[id,hotel,landmark,km]);
        await audit(db,user,'restaurant.distance.save',id,{hotel,landmark,km});
        return {saved:true};
    });
}
async function hotels(user){
    requirePermission(user,'restaurants');
    const [rows]=await pool.query('SELECT id,name FROM mks_listings WHERE demo=0 ORDER BY name LIMIT 500');
    return rows;
}
module.exports={restaurants,detail,save,transition,distance,hotels};
