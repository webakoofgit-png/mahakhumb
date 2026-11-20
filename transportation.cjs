const {randomBytes,randomInt}=require('node:crypto');
const {pool,transaction}=require('./booking-db.cjs');
const {fail,hash}=require('./booking-engine.cjs');
const {validSearchDate}=require('./dist/stay-catalog.js');
const {text,email,integer,businessPhone,businessContact,audit,requirePermission}=require('./operations-auth.cjs');
const {fileMime}=require('./operations-properties.cjs');

const categories=['Bike Taxi','Auto Rickshaw','Mini Cab','Sedan','SUV','Tempo Traveller','Luxury Cab'];
const vehicleOptions={
 'Bike Taxi':{passengers:1,luggage:1,ac:false,accessibility:false,image:'bike'},'Auto Rickshaw':{passengers:3,luggage:2,ac:false,accessibility:false,image:'auto'},
 'Mini Cab':{passengers:3,luggage:2,ac:true,accessibility:false,image:'mini'},'Sedan':{passengers:4,luggage:3,ac:true,accessibility:true,image:'sedan'},
 SUV:{passengers:6,luggage:4,ac:true,accessibility:true,image:'suv'},'Tempo Traveller':{passengers:12,luggage:8,ac:true,accessibility:true,image:'tempo'},'Luxury Cab':{passengers:4,luggage:3,ac:true,accessibility:false,image:'luxury'}
};
const tripTypes=['Point to point','Airport pickup','Railway station pickup','Hotel to ghat','Group transportation'];
const indiaNow=()=>new Date(Date.now()+19800000).toISOString().slice(0,19).replace('T',' ');
function requireCab(user){if(user.role!=='host'||!user.cab)throw fail(403,'Sign in as a cab partner.')}
async function submit(input){
    const pickup=text(input.pickup,180),dropoff=text(input.dropoff,180);
    if(pickup.toLowerCase()===dropoff.toLowerCase())throw fail(400,'Enter different pickup and drop locations.');
    const mode=input.bookingMode==='now'?'now':'scheduled';
    if(!validSearchDate(input.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time||''))throw fail(400,'Select a valid pickup date and time.');
    const departure=input.date+' '+input.time+':00';
    if(departure<=indiaNow())throw fail(400,'Select a future pickup time.');
    if(!categories.includes(input.category)||!tripTypes.includes(input.tripType))throw fail(400,'Select a vehicle category and trip type.');
    const passengers=integer(input.passengers,1,65), luggage=integer(input.luggage||0,0,20);
    const name=text(input.name,120),address=email(input.email),phone=businessPhone(input.phone);
    const passengerName=text(input.passengerName||name,120),passengerPhone=businessPhone(input.passengerPhone||phone);
    const relation=['self','family','senior','child','other'].includes(input.passengerRelation)?input.passengerRelation:'self';
    const assistance=text(input.assistance||'None',120),accessibilityNotes=text(input.accessibilityNotes||'',1000,false);
    const extraBoarding=integer(input.extraBoardingMinutes||0,0,120), emergency=input.emergencyContact?businessPhone(input.emergencyContact):null;
    const share=input.consentShareDetails===true||input.consentShareDetails==='true';
    const hotelRef=input.hotelBookingReference?text(input.hotelBookingReference,40):null;
    const direction=['to_hotel','from_hotel'].includes(input.hotelDirection)?input.hotelDirection:null;
    const returnDate=input.returnDate?validSearchDate(input.returnDate)?input.returnDate:null:null;
    if(input.returnDate&&!returnDate)throw fail(400,'Select a valid return date.');
    if(returnDate&&(!input.returnTime||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.returnTime)))throw fail(400,'Select a valid return time.');
    if(returnDate&&input.returnDate+' '+input.returnTime+':00'<=departure)throw fail(400,'Return pickup must be after the outbound ride.');
    const notes=text(input.notes||'',2400,false);
    const token=randomBytes(32).toString('hex'),code='CAB-'+randomBytes(6).toString('hex').toUpperCase();
    const startOtp=String(randomInt(100000,1000000)),startOtpHash=hash('cab-otp:'+startOtp);
    return transaction(async db=>{
        const key=hash('cab-enquiry:'+address);
        await db.execute(`INSERT INTO mks_ops_login_limits(identity_hash,attempts,expires)
            VALUES (?,0,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)) ON DUPLICATE KEY
            UPDATE attempts=IF(expires<=UTC_TIMESTAMP(),0,attempts),expires=IF(expires<=UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),expires)`,[key]);
        const [[limit]]=await db.execute('SELECT attempts FROM mks_ops_login_limits WHERE identity_hash=? FOR UPDATE',[key]);
        if(limit.attempts>=5)throw fail(429,'Too many enquiries. Try again later.');
        await db.execute('UPDATE mks_ops_login_limits SET attempts=attempts+1 WHERE identity_hash=?',[key]);
        if(hotelRef){const [[booking]]=await db.execute("SELECT reference FROM mks_bookings WHERE reference=? AND status='confirmed'",[hotelRef]);if(!booking)throw fail(404,'Confirmed hotel booking not found.');}
        const [result]=await db.execute(`INSERT INTO mks_cab_trips(code,access_hash,pickup,dropoff,departure,category,trip_type,passengers,luggage_count,guest_name,guest_email,guest_phone,notes,booking_mode,passenger_name,passenger_phone,passenger_relation,emergency_contact,consent_share_details,assistance,accessibility_notes,extra_boarding_minutes,hotel_booking_reference,hotel_direction,return_pickup,return_dropoff,return_departure,start_otp_hash,start_otp_expires)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[code,hash(token),pickup,dropoff,departure,input.category,input.tripType,passengers,luggage,name,address,phone,notes,mode,passengerName,passengerPhone,relation,emergency,share,assistance,accessibilityNotes,extraBoarding,hotelRef,direction,returnDate?pickup:null,returnDate?dropoff:null,returnDate?returnDate+' '+input.returnTime+':00':null,startOtpHash,new Date(Date.now()+24*60*60*1000)]);
        return {code,token,tripId:result.insertId,scheduled:mode==='scheduled',returnTripLinked:false,luggage,startOtp};
    });
}
async function fareEstimate(input){
    if(!categories.includes(input.category))throw fail(400,'Select a vehicle category.');
    const lat1=Number(input.pickupLat),lon1=Number(input.pickupLon),lat2=Number(input.dropoffLat),lon2=Number(input.dropoffLon);
    if(![lat1,lon1,lat2,lon2].every(Number.isFinite)||Math.abs(lat1)>90||Math.abs(lat2)>90||Math.abs(lon1)>180||Math.abs(lon2)>180)throw fail(400,'Choose pickup and drop points from the map.');
    const rad=x=>x*Math.PI/180, a=Math.sin(rad(lat2-lat1)/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(rad(lon2-lon1)/2)**2;
    const distanceKm=Math.max(0.1,6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
    const durationMin=Math.max(5,Math.ceil(distanceKm/0.38));
    const [[rule]]=await pool.execute('SELECT * FROM mks_cab_fare_rules WHERE category=? AND active=1',[input.category]);
    if(!rule)throw fail(409,'This vehicle category is not currently available.');
    const subtotal=rule.base_minor+Math.round(distanceKm*rule.per_km_minor)+Math.round(durationMin*rule.per_minute_minor);
    const peak=input.peak===true?Math.round(subtotal*.2):0, toll=Math.max(0,integer(input.tollMinor||0,0,1000000));
    const tax=Math.round((subtotal+peak+toll)*rule.tax_bps/10000), total=subtotal+peak+toll+tax;
    return {category:input.category,vehicle:vehicleOptions[input.category],distanceKm:Number(distanceKm.toFixed(2)),durationMin,baseMinor:rule.base_minor,distanceMinor:Math.round(distanceKm*rule.per_km_minor),durationMinor:Math.round(durationMin*rule.per_minute_minor),peakMinor:peak,tollMinor:toll,taxMinor:tax,taxBps:rule.tax_bps,discountMinor:0,totalMinor:total,currency:'INR',expiresAt:new Date(Date.now()+5*60*1000).toISOString()};
}
async function status(token){
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw fail(404,'Trip enquiry not found.');
    const [[row]]=await pool.execute(`SELECT t.code,t.pickup,t.dropoff,t.departure,t.trip_type,t.passengers,t.luggage_count,t.category,t.state,t.fare,t.booking_mode,t.passenger_name,t.assistance,t.return_departure,t.hotel_booking_reference,
        IF(t.state IN ('accepted','completed'),p.business_name,NULL) AS partner,
        IF(t.state IN ('accepted','completed'),p.business_phone,NULL) AS partner_phone,
        IF(t.state IN ('accepted','completed'),v.name,NULL) AS vehicle
        FROM mks_cab_trips t LEFT JOIN mks_cab_partners p ON p.user_id=t.partner_id LEFT JOIN mks_cab_vehicles v ON v.id=t.vehicle_id
        WHERE t.access_hash=?`,[hash(token)]);
    if(!row)throw fail(404,'Trip enquiry not found.');
    return row;
}
async function profile(user,input){
    requireCab(user);
    if(!input){
        const [[row]]=await pool.execute('SELECT * FROM mks_cab_partners WHERE user_id=?',[user.id]);
        return row;
    }
    const business=businessContact(input),areas=text(input.serviceAreas,1000);
    return transaction(async db=>{
        const [[prior]]=await db.execute('SELECT business_name,state FROM mks_cab_partners WHERE user_id=? FOR UPDATE',[user.id]);
        const changed=prior.business_name!==business.name;
        const state=changed&&prior.state==='verified'?'pending':prior.state;
        await db.execute('UPDATE mks_cab_partners SET business_name=?,business_email=?,business_phone=?,service_areas=?,state=? WHERE user_id=?',
            [business.name,business.email,business.phone,areas,state,user.id]);
        if(changed)await db.execute("UPDATE mks_cab_docs SET reviewed=0 WHERE partner_id=? AND kind='permit'",[user.id]);
        await audit(db,user,'cab.profile',user.id);
        return {saved:true};
    });
}
async function resources(user,partnerId=user.id){
    if(user.role==='host'){requireCab(user);if(partnerId!==user.id)throw fail(404,'Partner not found.')}
    else requirePermission(user,'cabs');
    const [[partner]]=await pool.execute(`SELECT p.*,u.name AS owner FROM mks_cab_partners p JOIN mks_ops_users u ON u.id=p.user_id WHERE p.user_id=?`,[partnerId]);
    if(!partner)throw fail(404,'Cab partner not found.');
    const [[vehicles],[drivers],[docs]]=await Promise.all([
        pool.execute('SELECT * FROM mks_cab_vehicles WHERE partner_id=? ORDER BY id DESC',[partnerId]),
        pool.execute('SELECT * FROM mks_cab_drivers WHERE partner_id=? ORDER BY id DESC',[partnerId]),
        pool.execute(`SELECT id,kind,filename,reviewed,expires,vehicle_id,driver_id FROM mks_cab_docs WHERE partner_id=? ORDER BY id DESC`,[partnerId])
    ]);
    return {partner,vehicles,drivers,docs};
}
async function saveResource(user,kind,id,input){
    requireCab(user);
    const vehicle=kind==='vehicles';
    const table=vehicle?'mks_cab_vehicles':'mks_cab_drivers';
    const name=text(input.name,vehicle?100:120);
    const active=input.active!==false;
    let fields;
    if(vehicle){
        const registration=text(input.registration,30).toUpperCase().replace(/[ -]/g,'');
        if(!/^[A-Z0-9]{5,20}$/.test(registration)||!categories.includes(input.category))throw fail(400,'Enter a vehicle registration and category.');
        fields=[name,registration,input.category,integer(input.seats,1,65),active];
    }else fields=[name,businessPhone(input.phone),active];
    return transaction(async db=>{
        await db.execute('SELECT user_id FROM mks_cab_partners WHERE user_id=? FOR UPDATE',[user.id]);
        if(id){
            const [[row]]=await db.execute('SELECT * FROM '+table+' WHERE id=? AND partner_id=? FOR UPDATE',[id,user.id]);
            if(!row)throw fail(404,'Record not found.');
            const column=vehicle?'vehicle_id':'driver_id';
            const [[trip]]=await db.execute(`SELECT id FROM mks_cab_trips WHERE ${column}=? AND state IN ('assigned','accepted') LIMIT 1`,[id]);
            if(trip)throw fail(409,'Complete or reassign active trips before changing this record.');
            const update=vehicle?'name=?,registration=?,category=?,seats=?,active=?':'name=?,phone=?,active=?';
            await db.execute('UPDATE '+table+' SET '+update+' WHERE id=? AND partner_id=?',[...fields,id,user.id]);
            if(vehicle&&row.registration!==fields[1])await db.execute('UPDATE mks_cab_docs SET reviewed=0 WHERE vehicle_id=?',[id]);
            if(!vehicle&&row.name!==name)await db.execute('UPDATE mks_cab_docs SET reviewed=0 WHERE driver_id=?',[id]);
        }else{
            const [[count]]=await db.execute('SELECT COUNT(*) AS total FROM '+table+' WHERE partner_id=?',[user.id]);
            if(count.total>=100)throw fail(409,'Contact support to add more fleet records.');
            const columns=vehicle?'name,registration,category,seats,active':'name,phone,active';
            const [result]=await db.execute('INSERT INTO '+table+' (partner_id,'+columns+') VALUES ('+
                Array.from({length:fields.length+1},()=>'?').join(',')+')',[user.id,...fields]);
            id=result.insertId;
            if(!vehicle)await db.execute('INSERT IGNORE INTO mks_cab_driver_profiles(driver_id) VALUES (?)',[id]);
        }
        await audit(db,user,'cab.'+kind+'.save',id);
        return {id};
    });
}
async function upload(user,input){
    requireCab(user);
    const kind=input.kind,vehicle=input.vehicleId?integer(input.vehicleId,1,4294967295):null,driver=input.driverId?integer(input.driverId,1,4294967295):null;
    if(!['permit','registration','insurance','license'].includes(kind)||
        (kind==='license'?(!driver||vehicle):kind==='permit'?(driver||vehicle):(!vehicle||driver)))throw fail(400,'Choose the required driver or vehicle for the document.');
    if(input.expires&&!validSearchDate(input.expires))throw fail(400,'Enter a valid document expiry.');
    if(kind!=='registration'&&!input.expires)throw fail(400,'An expiry date is required for this type of document.');
    if(typeof input.base64!=='string'||input.base64.length>4194304)throw fail(400,'Select a PDF, JPG or PNG up to 3 MB.');
    const contents=Buffer.from(input.base64,'base64'),mime=fileMime(contents);
    if(!mime)throw fail(400,'Select a PDF, JPG or PNG.');
    const filename=text(input.filename,150).replace(/[\r\n"\\/]/g,'_').replace(/\.[^.]+$/,'')+{'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png'}[mime];
    return transaction(async db=>{
        await db.execute('SELECT user_id FROM mks_cab_partners WHERE user_id=? FOR UPDATE',[user.id]);
        const target=vehicle||driver;
        if(target){
            const [[owner]]=await db.execute('SELECT id FROM '+(vehicle?'mks_cab_vehicles':'mks_cab_drivers')+' WHERE id=? AND partner_id=?',[target,user.id]);
            if(!owner)throw fail(404,'Fleet record not found.');
        }
        const [[count]]=await db.execute('SELECT COUNT(*) AS total FROM mks_cab_docs WHERE partner_id=?',[user.id]);
        if(count.total>=100)throw fail(409,'Contact support to upload more verification documents.');
        const [result]=await db.execute('INSERT INTO mks_cab_docs(partner_id,vehicle_id,driver_id,kind,filename,mime,contents,expires) VALUES (?,?,?,?,?,?,?,?)',
            [user.id,vehicle,driver,kind,filename,mime,contents,input.expires||null]);
        await audit(db,user,'cab.document.upload',result.insertId,{kind});
        return {id:result.insertId};
    });
}
async function file(user,id){
    if(user.role==='host')requireCab(user);else requirePermission(user,'cabs');
    const [[row]]=await pool.execute('SELECT filename,mime,contents FROM mks_cab_docs WHERE id=?'+(user.role==='host'?' AND partner_id=?':''),
        user.role==='host'?[id,user.id]:[id]);
    if(!row)throw fail(404,'Document not found.');
    await audit(pool,user,'cab.document.download',id);
    return row;
}
async function review(user,id,input){
    requirePermission(user,'cabs');
    if(typeof input.reviewed!=='boolean')throw fail(400,'Choose a review status.');
    return transaction(async db=>{
        const [[doc]]=await db.execute('SELECT partner_id FROM mks_cab_docs WHERE id=?',[id]);
        if(!doc)throw fail(404,'Document not found.');
        await db.execute('SELECT user_id FROM mks_cab_partners WHERE user_id=? FOR UPDATE',[doc.partner_id]);
        await db.execute('UPDATE mks_cab_docs SET reviewed=? WHERE id=?',[input.reviewed,id]);
        await audit(db,user,'cab.document.review',id,{reviewed:input.reviewed});
        return {saved:true};
    });
}
async function partners(user){
    requirePermission(user,'cabs');
    const [rows]=await pool.query('SELECT * FROM mks_cab_partners ORDER BY user_id DESC LIMIT 100');
    return rows;
}
async function changePartnerState(user,id,input){
    requirePermission(user,'cabs');
    if(!['pending','verified','suspended'].includes(input.state))throw fail(400,'Choose a valid partner state.');
    return transaction(async db=>{
        const [[p]]=await db.execute('SELECT state FROM mks_cab_partners WHERE user_id=? FOR UPDATE',[id]);
        if(!p)throw fail(404,'Partner not found.');
        if(input.state==='verified'){
            const [[permit]]=await db.execute("SELECT id FROM mks_cab_docs WHERE partner_id=? AND kind='permit' AND reviewed=1 AND expires>=? LIMIT 1",[id,indiaNow().slice(0,10)]);
            if(!permit)throw fail(409,'Review an unexpired operator permit before verifying this partner.');
        }
        await db.execute('UPDATE mks_cab_partners SET state=? WHERE user_id=?',[input.state,id]);
        await audit(db,user,'cab.partner.state',id,{before:p.state,after:input.state});
        return {saved:true};
    });
}
async function trips(user,page){
    if(user.role==='host')requireCab(user);else requirePermission(user,'cabs');
    const conditions=[],args=[];
    if(user.role==='host'){conditions.push('t.partner_id=?');args.push(user.id)}
    if(page.status){
        if(!['requested','assigned','accepted','completed','cancelled'].includes(page.status))throw fail(400,'Choose a valid trip status.');
        conditions.push('t.state=?');args.push(page.status);
    }
    if(page.q){conditions.push('(t.code LIKE ? OR t.pickup LIKE ? OR t.dropoff LIKE ?)');args.push(...Array(3).fill('%'+page.q+'%'))}
    const [rows]=await pool.query(`SELECT t.id,t.code,t.pickup,t.dropoff,t.departure,t.duration,t.category,t.trip_type,t.passengers,
        t.guest_name,t.guest_email,t.guest_phone,t.notes,t.state,t.partner_id,t.vehicle_id,t.driver_id,t.fare,p.business_name,v.name AS vehicle,d.name AS driver
        FROM mks_cab_trips t LEFT JOIN mks_cab_partners p ON p.user_id=t.partner_id LEFT JOIN mks_cab_vehicles v ON v.id=t.vehicle_id
        LEFT JOIN mks_cab_drivers d ON d.id=t.driver_id
        ${conditions.length?'WHERE '+conditions.join(' AND '):''} ORDER BY t.id DESC LIMIT ? OFFSET ?`,
        [...args,page.limit,page.offset]);
    return rows;
}
async function fleetReady(db,partner,vehicle,driver,departure){
    const [docs]=await db.execute(`SELECT kind FROM mks_cab_docs WHERE partner_id=? AND reviewed=1 AND (expires IS NULL OR expires>=?)
        AND (kind='permit' OR (kind='license' AND driver_id=?) OR (kind IN ('registration','insurance') AND vehicle_id=?))`,
        [partner,departure.slice(0,10),driver,vehicle]);
    if(!['permit','license','registration','insurance'].every(kind=>docs.some(d=>d.kind===kind))){
        throw fail(409,'The operator permit, vehicle registration and insurance, and driver licence must be verified and valid on the trip date.');
    }
}
async function assign(user,id,input){
    requirePermission(user,'cabs');
    const partner=integer(input.partnerId,1,4294967295),vehicle=integer(input.vehicleId,1,4294967295),driver=integer(input.driverId,1,4294967295);
    const duration=integer(input.duration,15,1440),fare=integer(input.fare,1,4294967295);
    return transaction(async db=>{
        const [[p]]=await db.execute('SELECT state FROM mks_cab_partners WHERE user_id=? FOR UPDATE',[partner]);
        if(p?.state!=='verified')throw fail(409,'Choose a verified cab partner.');
        const [[trip]]=await db.execute('SELECT * FROM mks_cab_trips WHERE id=? FOR UPDATE',[id]);
        if(!trip)throw fail(404,'Trip enquiry not found.');
        if(!['requested','assigned'].includes(trip.state)||trip.departure<=indiaNow())throw fail(409,'This trip cannot be assigned.');
        const [[car]]=await db.execute('SELECT seats,category FROM mks_cab_vehicles WHERE id=? AND partner_id=? AND active=1',[vehicle,partner]);
        const [[operator]]=await db.execute('SELECT id FROM mks_cab_drivers WHERE id=? AND partner_id=? AND active=1',[driver,partner]);
        if(!car||!operator||car.seats<trip.passengers||car.category!==trip.category)throw fail(409,'Choose an active driver and a matching vehicle with enough seats.');
        await fleetReady(db,partner,vehicle,driver,trip.departure);
        const [[overlap]]=await db.execute(`SELECT id FROM mks_cab_trips WHERE id<>? AND state IN ('assigned','accepted') AND (vehicle_id=? OR driver_id=?)
            AND departure<DATE_ADD(?,INTERVAL ? MINUTE) AND DATE_ADD(departure,INTERVAL duration MINUTE)>? LIMIT 1`,
            [id,vehicle,driver,trip.departure,duration,trip.departure]);
        if(overlap)throw fail(409,'This vehicle or driver already has an overlapping trip.');
        await db.execute("UPDATE mks_cab_trips SET partner_id=?,vehicle_id=?,driver_id=?,duration=?,fare=?,state='assigned' WHERE id=?",
            [partner,vehicle,driver,duration,fare,id]);
        await audit(db,user,'cab.trip.assign',id,{partner,vehicle,driver,duration,fare});
        return {saved:true};
    });
}
async function changeTrip(user,id,action){
    const host=user.role==='host';
    if(host)requireCab(user);else requirePermission(user,'cabs');
    if(host?!['accept','decline','complete'].includes(action):action!=='cancel')throw fail(400,'Choose a valid trip action.');
    return transaction(async db=>{
        const [[p]]=host?await db.execute('SELECT state FROM mks_cab_partners WHERE user_id=? FOR UPDATE',[user.id]):[[]];
        const [[trip]]=await db.execute('SELECT * FROM mks_cab_trips WHERE id=?'+(host?' AND partner_id=?':'')+' FOR UPDATE',host?[id,user.id]:[id]);
        if(!trip)throw fail(404,'Trip enquiry not found.');
        const next={accept:'accepted',decline:'requested',complete:'completed',cancel:'cancelled'}[action];
        if(trip.state===next)return {saved:true};
        if(action==='accept'){
            if(trip.state!=='assigned'||p.state!=='verified'||trip.departure<=indiaNow())throw fail(409,'This assignment cannot be accepted.');
            await fleetReady(db,user.id,trip.vehicle_id,trip.driver_id,trip.departure);
        }
        if(action==='decline'&&trip.state!=='assigned')throw fail(409,'Only new assignments can be declined.');
        if(action==='complete'&&(trip.state!=='accepted'||trip.departure>indiaNow()))throw fail(409,'Record completion after the assigned pickup.');
        if(action==='cancel'&&trip.state==='completed')throw fail(409,'Completed trips cannot be cancelled.');
        if(action==='decline')await db.execute("UPDATE mks_cab_trips SET state='requested',partner_id=NULL,vehicle_id=NULL,driver_id=NULL,duration=NULL,fare=NULL WHERE id=?",[id]);
        else await db.execute('UPDATE mks_cab_trips SET state=? WHERE id=?',[next,id]);
        await audit(db,user,'cab.trip.'+action,id);
        return {saved:true};
    });
}
async function earnings(user){
    requireCab(user);
    const [[balance]]=await pool.execute(`SELECT COUNT(*) AS trips,COALESCE(SUM(fare),0) AS earnings FROM mks_cab_trips
        WHERE partner_id=? AND state='completed'`,[user.id]);
    return balance;
}
async function adminOverview(user){requirePermission(user,'cabs');const [[x]]=await pool.query(`SELECT COUNT(*) total,SUM(state IN ('assigned','accepted')) active,SUM(state='requested') pending,SUM(state='completed') completed,SUM(state='cancelled') cancelled,COALESCE(SUM(fare),0) gross FROM mks_cab_trips`);const [[d]]=await pool.query("SELECT COUNT(*) online FROM mks_cab_driver_profiles WHERE online=1 AND verification_state='verified'");return {...x,onlineDrivers:d.online};}
async function adminDrivers(user,page){requirePermission(user,'cabs');const [rows]=await pool.query(`SELECT d.id,d.name,d.phone,p.verification_state,p.online,p.last_location_at,v.registration,v.category FROM mks_cab_drivers d JOIN mks_cab_driver_profiles p ON p.driver_id=d.id LEFT JOIN mks_cab_vehicles v ON v.id=(SELECT vehicle_id FROM mks_cab_trips WHERE driver_id=d.id ORDER BY id DESC LIMIT 1) ORDER BY d.id DESC LIMIT ? OFFSET ?`,[page.limit,page.offset]);return rows;}
async function adminRides(user,page){requirePermission(user,'cabs');const [rows]=await pool.query(`SELECT id,code,pickup,dropoff,departure,category,passengers,state,fare,driver_id,created_at FROM mks_cab_trips ORDER BY id DESC LIMIT ? OFFSET ?`,[page.limit,page.offset]);return rows;}
async function adminFareRules(user){requirePermission(user,'cabs');const [rows]=await pool.query('SELECT * FROM mks_cab_fare_rules ORDER BY category');return rows;}
module.exports={categories,vehicleOptions,tripTypes,submit,status,fareEstimate,profile,resources,saveResource,upload,file,review,partners,changePartnerState,trips,assign,changeTrip,earnings,adminOverview,adminDrivers,adminRides,adminFareRules};
