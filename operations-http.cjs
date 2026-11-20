const {pool}=require('./booking-db.cjs');
const {fail}=require('./booking-engine.cjs');
const auth=require('./operations-auth.cjs');
const properties=require('./operations-properties.cjs');
const data=require('./operations-data.cjs');
const partner=require('./operations-partner.cjs');
const bulk=require('./bulk-stay.cjs');
const pilgrim=require('./pilgrim-content.cjs');
const cab=require('./transportation.cjs');
const veg=require('./veg-directory.cjs');
const driver=require('./driver-dashboard.cjs');
const ride=require('./ride-engine.cjs');
const {guestOwner,idempotency}=require('./booking-http.cjs');
function csv(rows){
    const fields=['reference','property','room','checkin','checkout','rooms','guests','status','total_minor','refund_minor','refund_status'];
    const encode=value=>{
        const str=String(value??'');
        return '"'+(/^[\s]*[=+@-]|^[\t\r\n]/.test(str)?"'"+str:str).replace(/"/g,'""')+'"';
    };
    return fields.join(',')+'\r\n'+rows.map(x=>[x.reference,x.property,x.room,x.checkin,x.checkout,x.rooms,x.guests,x.status,x.total,x.refund_amount,x.refund_status].map(encode).join(',')).join('\r\n');
}
async function jsonBody(req,large=false){
    if(req.headers['sec-fetch-site']==='cross-site'||(process.env.APP_ORIGIN&&req.headers.origin&&req.headers.origin!==process.env.APP_ORIGIN))throw fail(403,'Request origin is not allowed.');
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail(415,'Send a JSON request.');
    const chunks=[];
    const cap=large?4300000:65536;
    let size=0;
    for await(const chunk of req){size+=chunk.length;if(size<=cap)chunks.push(chunk)}
    if(size>cap)throw fail(413,'The request is too large.');
    let data;
    try{data=JSON.parse(Buffer.concat(chunks))}catch{throw fail(400,'Invalid JSON request.')}
    if(!data||typeof data!=='object'||Array.isArray(data))throw fail(400,'Invalid JSON request.');
    return data;
}
function binary(res,bytes,mime,filename,publicImage=false){
    const headers={'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy':'same-origin'};
    if(filename)headers['Content-Disposition']="attachment; filename*=UTF-8''"+encodeURIComponent(filename).replace(/'/g,'%27');
    if(!publicImage)headers['X-Frame-Options']='DENY';
    res.writeHead(200,headers);
    res.end(bytes);
}
function paging(url){
    const offset=auth.integer(url.searchParams.get('offset')??0,0,1000000);
    const limit=auth.integer(url.searchParams.get('limit')??25,1,100);
    const q=auth.text(url.searchParams.get('q')||'',120,false);
    return {offset,limit,q,status:url.searchParams.get('status')||''};
}
async function route(req,res,url){
    if(!pool)throw fail(503,'MySQL is not configured.');
    if(url.pathname.startsWith('/media/property/')&&req.method==='GET'){
        const id=auth.integer(url.pathname.split('/').at(-1),1,4294967295);
        const file=await properties.media(id);
        return binary(res,file.contents,file.mime,null,true);
    }
    const [area,id,action,child,operation]=url.pathname.split('/').slice(3);
    const method=req.method;
    if(!['GET','POST'].includes(method))throw fail(405,'Method not allowed.');
    const read=method==='GET';
    const write=()=>jsonBody(req,(area==='properties'&&action==='files'&&!child)||(area==='cab'&&id==='documents'&&!action));
    if(!id&&read&&area==='public')return data.publicContent();
    if(!id&&!read&&area==='enquiry')return data.publicEnquiry(await write());
    if(!id&&!read&&['login','register'].includes(area))return auth.signIn(req,res,await write(),area==='register');
    if(area==='group'&&!read){
        const data=await write();
        if(!id)return bulk.submit(data);
        if(id==='quote'&&!action)return bulk.view(data.token,guestOwner(req));
        if(id==='accept'&&!action){
            if(data.acceptedTerms!==true)throw fail(400,'Accept the quote terms before continuing.');
            return bulk.accept(data.token,guestOwner(req),idempotency(req));
        }
    }
    if(area==='transport'){
        if(read&&!id)return {categories:cab.categories,vehicleOptions:cab.vehicleOptions,tripTypes:cab.tripTypes,mapProvider:process.env.GOOGLE_MAPS_BROWSER_KEY?'google':'unconfigured'};
        if(!read&&id==='fare'&&!action)return cab.fareEstimate(await write());
        if(!read&&!id)return cab.submit(await write());
        if(!read&&id==='status'&&!action)return cab.status((await write()).token);
    }
    if(area==='cab-admin'){
        auth.requirePermission(user,'cabs');
        if(read&&!id)return cab.adminOverview(user);
        if(read&&id==='drivers')return cab.adminDrivers(user,paging(url));
        if(read&&id==='rides')return cab.adminRides(user,paging(url));
        if(read&&id==='fare-rules')return cab.adminFareRules(user);
        throw fail(404,'Transport admin endpoint not found.');
    }
    if(area==='ride'){
        if(!read&&id==='search')return ride.search(auth.integer((await write()).tripId,1,4294967295));
        if(!read&&id==='accept')return ride.accept(user,auth.integer((await write()).tripId,1,4294967295));
        if(!read&&id==='support')return ride.support(user,await write());
        if(!read&&id==='transition'){const b=await write();return ride.transition(user,auth.integer(b.tripId,1,4294967295),b.state,b.reason)}
        throw fail(404,'Ride endpoint not found.');
    }
    if(area==='veg'&&read&&(!id||/^\d+$/.test(id))){
        if(id)return veg.detail(auth.integer(id,1,4294967295));
        return veg.restaurants(paging(url),false,{jain:url.searchParams.get('jain')==='1',satvik:url.searchParams.get('satvik')==='1',
            capacity:url.searchParams.get('capacity'),hotel:url.searchParams.get('hotel')});
    }
    if(area==='pilgrim'&&read&&!id)return pilgrim.list(true);
    const user=await auth.session(req);
    if(read&&area==='session'&&!id)return {user,propertyTypes:properties.rentalTypes,hotelTypes:properties.hotelTypes,recordTypes:data.records,cmsTypes:data.cmsTypes,
        staffPermissions:user?.role==='superadmin'?auth.permissions:[]};
    if(!user)throw fail(401,'Sign in to continue.');
    if(!read)auth.requireCsrf(req,user);
    if(!read&&area==='logout'){await write();await auth.signOut(req,res,user);return {signedOut:true}}
    if(area==='driver'){
        if(!read&&id==='register')return driver.register(user,await write());
        if(read&&!id)return driver.overview(user);
        if(!read&&id==='availability')return driver.availability(user,(await write()).online===true);
        if(!read&&id==='location')return driver.location(user,await write());
        if(!read&&id==='accept')return driver.accept(user,auth.integer((await write()).tripId,1,4294967295));
        if(!read&&id==='reject')return driver.reject(user,auth.integer((await write()).tripId,1,4294967295));
        if(!read&&id==='start'){const body=await write();return driver.start(user,auth.integer(body.tripId,1,4294967295),body.otp)}
        if(!read&&id==='complete')return driver.complete(user,auth.integer((await write()).tripId,1,4294967295));
        throw fail(404,'Driver endpoint not found.');
    }
    const page=paging(url);
    if(area==='cab'){
        const number=value=>auth.integer(value,1,4294967295);
        if(id==='profile'&&!action)return cab.profile(user,read?undefined:await write());
        if(id==='fleet'&&read&&!action)return cab.resources(user);
        if(id==='earnings'&&read&&!action)return cab.earnings(user);
        if(['vehicles','drivers'].includes(id)&&!read)return cab.saveResource(user,id,action?number(action):null,await write());
        if(id==='documents'){
            if(!read&&!action)return cab.upload(user,await write());
            if(read&&action){const doc=await cab.file(user,number(action));return binary(res,doc.contents,doc.mime,doc.filename)}
            if(!read&&action)return cab.review(user,number(action),await write());
        }
        if(id==='trips'){
            if(read&&!action)return cab.trips(user,page);
            if(!read&&action&&child==='assign')return cab.assign(user,number(action),await write());
            if(!read&&action)return cab.changeTrip(user,number(action),(await write()).action);
        }
        if(id==='partners'){
            if(read&&!action)return cab.partners(user);
            if(read&&action)return cab.resources(user,number(action));
            if(!read&&action)return cab.changePartnerState(user,number(action),await write());
        }
        throw fail(404,'Cab endpoint not found.');
    }
    if(user.cab)throw fail(403,'This workspace is for lodging partners or staff.');
    if(area==='pilgrim-cms'){
        auth.requirePermission(user,'cms');
        if(read&&!id)return pilgrim.list();
        if(!read&&id&&!action)return pilgrim.save(user,id,await write());
    }
    if(area==='restaurants'){
        auth.requirePermission(user,'restaurants');
        if(read&&id==='hotels')return veg.hotels(user);
        if(read&&!id)return veg.restaurants(page,true);
        const number=id?auth.integer(id,1,4294967295):null;
        if(read&&number&&!action)return veg.detail(number,true);
        if(!read&&!action)return veg.save(user,number,await write());
        if(!read&&number&&action==='state')return veg.transition(user,number,await write());
        if(!read&&number&&action==='distances')return veg.distance(user,number,await write());
    }
    if(area==='bulk'&&id){
        const enquiry=auth.integer(id,1,4294967295);
        if(read&&!action)return bulk.detail(user,enquiry);
        if(read&&action==='matches')return bulk.matches(user,enquiry);
        if(!read&&action==='assign')return bulk.assign(user,enquiry,await write());
        if(!read&&action==='quote')return bulk.makeQuote(user,enquiry,await write());
        if(!read&&action==='contact')return bulk.contact(user,enquiry,await write());
    }
    if(area==='partner'){
        partner.requirePartner(user);
        if(id==='overview'&&read&&!action)return partner.stats(user);
        if(id==='profile'&&!action)return partner.profile(user,read?undefined:await write());
        if(id==='bookings'&&action==='csv'&&read){
            const rows=await data.bookingList(user,{...page,limit:5000,offset:0},false,true);
            await auth.audit(pool,user,'partner.reports.export','bookings',{rows:rows.length});
            return binary(res,csv(rows),'text/csv; charset=utf-8','hotel-bookings.csv');
        }
        if(id==='bookings'&&!read&&/^MKS-[A-F0-9]{24}$/.test(action||''))
            return partner.guestMovement(user,action,(await write()).action);
        if(id==='groups'){
            if(read&&!action)return partner.groups(user,page.q,page.offset,page.limit);
            if(!read&&action)return partner.changeGroup(user,auth.integer(action,1,4294967295),(await write()).state);
        }
        if(id==='reviews'){
            if(read&&!action)return partner.reviews(user,page.q,page.offset,page.limit);
            if(!read&&action)return partner.reply(user,auth.integer(action,1,4294967295),await write());
        }
        throw fail(404,'Partner endpoint not found.');
    }
    if(area==='properties'){
        if(read&&!id)return properties.listings(user,url.searchParams.get('type'),page.q,page.offset,page.limit);
        if(!read&&!id)return properties.saveListing(user,null,await write());
        const property=auth.integer(id,1,4294967295);
        if(read&&!action)return properties.listingDetail(user,property,url.searchParams.get('section'));
        if(!read&&!action)return properties.saveListing(user,property,await write());
        if(!read&&action==='transition')return properties.transition(user,property,await write());
        if(!read&&action==='files'&&!child)return properties.upload(user,property,await write());
        if(action==='files'&&child){
            const fileId=auth.integer(child,1,4294967295);
            if(read){const file=await properties.download(user,property,fileId);return binary(res,file.contents,file.mime,file.filename)}
            return properties.reviewFile(user,property,fileId,(await write()).reviewed);
        }
        if(action==='rooms'){
            const room=child?auth.integer(child,1,4294967295):null;
            if(operation==='block'&&room&&!read)return properties.blockCalendar(user,property,room,await write());
            if(operation==='calendar'&&room)return read
                ?properties.calendar(user,property,room,url.searchParams.get('start'),url.searchParams.get('end'))
                :properties.changeCalendar(user,property,room,await write());
            if(!read&&!operation)return properties.saveRoom(user,property,room,await write());
        }
    }
    if(area==='inventory'&&read&&!id){
        auth.requirePermission(user,'inventory');
        const [rows]=await pool.query("SELECT id,name,location FROM mks_listings WHERE demo=0 AND name LIKE ? ORDER BY name LIMIT ? OFFSET ?",['%'+page.q+'%',page.limit,page.offset]);
        return rows;
    }
    if(area==='overview'&&read&&!id)return data.overview(user);
    if(area==='bookings'&&read&&!id)return data.bookingList(user,page);
    if(area==='payments'&&read&&!id){auth.requirePermission(user,'payments');return data.bookingList(user,page,true)}
    if(area==='bookings'&&id&&!read&&/^MKS-[A-F0-9]{24}$/.test(id))return data.intervene(user,id,await write());
    if(area==='reports'&&read){
        auth.requirePermission(user,'reports');
        const rows=await data.bookingList(user,id==='csv'?{...page,limit:5000,offset:0}:page,false,true);
        if(id==='csv'){await auth.audit(pool,user,'reports.export','bookings',{rows:rows.length});return binary(res,csv(rows),'text/csv; charset=utf-8','booking-report.csv')}
        if(!id)return rows;
    }
    if(area==='customers'&&read&&!id)return data.customers(user,page.q,page.offset,page.limit);
    if(area==='finance'){
        if(read&&!id)return data.accounts(user);
        if(!read&&id==='payout')return data.recordPayout(user,await write());
    }
    if(area==='staff'){
        if(read&&!id)return data.staff(user,page.offset,page.limit);
        if(!read)return data.saveStaff(user,id?auth.integer(id,1,4294967295):null,await write());
    }
    if(area==='settings'&&!id)return data.settings(user,read?undefined:await write());
    if(area==='audit'&&read&&!id){
        if(!['superadmin','staff'].includes(user.role)||!user.permissions.includes('staff'))throw fail(403,'You do not have access to audit logs.');
        const [rows]=await pool.query(`SELECT a.id,u.email,a.action,a.subject,a.change_details,a.created_at FROM mks_ops_audit a
            JOIN mks_ops_users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT ? OFFSET ?`,[page.limit,page.offset]);
        return rows;
    }
    if(area==='records'&&id){
        if(read&&!action)return data.recordList(user,id,page.q,page.offset,page.limit);
        if(!read)return data.saveRecord(user,id,action?auth.integer(action,1,4294967295):null,await write());
    }
    throw fail(404,'Endpoint not found.');
}
module.exports={route};
