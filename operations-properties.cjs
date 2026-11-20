const {pool,transaction}=require('./booking-db.cjs');
const {fail,json}=require('./booking-engine.cjs');
const {text,email,integer,mediaUrl,audit,requirePermission}=require('./operations-auth.cjs');
const {validSearchDate}=require('./dist/stay-catalog.js');
const rentalTypes=['Private bedroom','Entire house','Apartment','Farmhouse','Dormitory','Temporary modular accommodation','Authorized group accommodation'];
const hotelTypes=['Hotels','Resorts','Lodges','Dharamshalas','Budget Hotels','Premium Hotels & Resorts','Tent Cities'];
const publicTypes={'Private bedroom':'Homestays','Entire house':'Homestays',Apartment:'Homestays',Farmhouse:'Homestays',Dormitory:'Dormitories',
    'Temporary modular accommodation':'Tent Cities','Authorized group accommodation':'Dormitories'};
const fileLimit=3*1024*1024;
async function findListing(db,user,id,write=false){
    if(user.role!=='host')requirePermission(user,write==='inventory'?'inventory':'properties');
    const [[p]]=await db.execute(`SELECT l.*, w.owner_id,w.kind,w.state,w.rooms,w.beds,w.bathrooms,w.sanitation,w.review_note
        FROM mks_listings l LEFT JOIN mks_property_workflow w ON w.listing_id=l.id WHERE l.id=? AND l.demo=0${write?' FOR UPDATE':''}`,[id]);
    if(!p||(user.role==='host'&&p.owner_id!==user.id))throw fail(404,'Property not found.');
    return p;
}
async function listings(user,filter,query,offset,limit){
    if(user.role!=='host')requirePermission(user,'properties');
    const conditions=['l.demo=0'];
    const args=[];
    if(user.role==='host'){conditions.push('w.owner_id=?');args.push(user.id)}
    if(filter==='rentals'||filter==='hotels'){
        const prefix=filter==='rentals'?'':'NOT ';
        conditions.push(`${prefix}COALESCE(w.kind IN (${rentalTypes.map(()=>'?').join(',')}),FALSE)`);
        args.push(...rentalTypes);
    }
    if(query){conditions.push("(l.name LIKE ? OR l.location LIKE ?)");args.push('%'+query+'%','%'+query+'%')}
    const [rows]=await pool.query(`SELECT l.id,l.name,l.location,l.type,l.verified,w.kind,COALESCE(w.state,'approved') AS state,u.name AS owner
        FROM mks_listings l LEFT JOIN mks_property_workflow w ON w.listing_id=l.id LEFT JOIN mks_ops_users u ON u.id=w.owner_id
        WHERE ${conditions.join(' AND ')} ORDER BY l.id DESC LIMIT ? OFFSET ?`,[...args,limit,offset]);
    return rows;
}
async function listingDetail(user,id,permission){
    if(permission==='inventory'&&user.role!=='host'){
        requirePermission(user,'inventory');
        const [[p]]=await pool.execute('SELECT id,name FROM mks_listings WHERE id=? AND demo=0',[id]);
        if(!p)throw fail(404,'Property not found.');
        const [rooms]=await pool.execute('SELECT * FROM mks_room_types WHERE listing_id=? ORDER BY id',[id]);
        return {...p,roomTypes:rooms};
    }
    const p=await findListing(pool,user,id);
    const [[rooms],[files],[amenities]]=await Promise.all([
        pool.execute('SELECT * FROM mks_room_types WHERE listing_id=? ORDER BY id',[id]),
        pool.execute('SELECT id,kind,filename,reviewed FROM mks_property_files WHERE listing_id=? ORDER BY id',[id]),
        pool.execute('SELECT amenity FROM mks_listing_amenities WHERE listing_id=? ORDER BY amenity',[id])
    ]);
    const [[owner]]=p.owner_id&&user.role!=='host'?await pool.execute('SELECT email FROM mks_ops_users WHERE id=?',[p.owner_id]):[[]];
    return {...p,owner_email:owner?.email,state:p.state||'approved',kind:p.kind||p.type,gallery:json(p.gallery)||[],roomTypes:rooms,files,amenities:amenities.map(x=>x.amenity),...(await stayTerms(id)),
        ...(['draft','rejected','submitted','suspended'].includes(p.state)?{readiness:await submissionStatus(pool,p,files)}:{})};
}
async function stayTerms(id){
    const [[terms]]=await pool.execute('SELECT min_nights,max_nights FROM mks_hotel_stay_rules WHERE listing_id=?',[id]);
    const [[business]]=await pool.execute(`SELECT h.business_name,h.business_email,h.business_phone FROM mks_hotel_partners h
        JOIN mks_property_workflow w ON w.owner_id=h.user_id WHERE w.listing_id=?`,[id]);
    return {...terms,business};
}
function coordinate(value,max){
    if(value==null||value==='')return null;
    const number=Number(value);
    if(!Number.isFinite(number)||Math.abs(number)>max)throw fail(400,'Enter valid map coordinates.');
    return number;
}
async function saveListing(user,id,input){
    if(user.role!=='host')requirePermission(user,'properties');
    return transaction(async db=>{
        const p=id?await findListing(db,user,id,true):null;
        if(user.role==='host'&&p&&!['draft','rejected'].includes(p.state))throw fail(409,'Contact support to change a property under review or already published.');
        if(!p&&user.role==='host'){
            await db.execute('SELECT id FROM mks_ops_users WHERE id=? FOR UPDATE',[user.id]);
            const [[count]]=await db.execute('SELECT COUNT(*) AS total FROM mks_property_workflow WHERE owner_id=?',[user.id]);
            if(count.total>=25)throw fail(409,'Contact support to register more than 25 properties.');
        }
        let ownerId=p?.owner_id??(user.role==='host'?user.id:null);
        if(user.role!=='host'&&input.ownerEmail){
            const [[host]]=await db.execute("SELECT id FROM mks_ops_users WHERE role='host' AND active=1 AND email=?",[email(input.ownerEmail)]);
            if(!host)throw fail(400,'No active host account uses that email.');
            if(p?.owner_id&&p.owner_id!==host.id){
                const [[activity]]=await db.execute(`SELECT
                    EXISTS(SELECT 1 FROM mks_bookings WHERE listing_id=?) OR EXISTS(SELECT 1 FROM mks_ops_payouts WHERE listing_id=?) AS present`,[id,id]);
                if(activity.present)throw fail(409,'Ownership cannot be changed here once a property has booking or payout history.');
            }
            if(p&&p.owner_id!==host.id)await db.execute('DELETE FROM mks_hotel_access WHERE listing_id=?',[id]);
            ownerId=host.id;
        }
        const kinds=user.role==='host'?(user.partner?hotelTypes:rentalTypes):[...rentalTypes,...hotelTypes];
        const kind=text(input.kind,60);
        if(!kinds.includes(kind))throw fail(400,'Select a supported accommodation type.');
        const name=text(input.name,160),location=text(input.location,120),address=text(input.address,400);
        const description=text(input.description||'',10000,false),rules=text(input.rules||'',3000,false);
        const latitude=coordinate(input.latitude,90),longitude=coordinate(input.longitude,180);
        if((latitude===null)!==(longitude===null))throw fail(400,'Enter both latitude and longitude.');
        const rooms=integer(input.rooms,1,500),beds=integer(input.beds,1,1500),bathrooms=integer(input.bathrooms,1,500),capacity=integer(input.capacity,1,120);
        const sanitation=text(input.sanitation||'',4000,false);
        const veg=input.pureVeg==='yes'?1:input.pureVeg==='no'?0:null;
        const cancelHours=integer(input.cancelHours??0,0,8760),refundBps=integer(input.refundBps??0,0,10000);
        const amenities=[...new Set(String(input.amenities||'').split(',').map(x=>x.trim()).filter(Boolean))];
        if(amenities.length>40||amenities.some(x=>x.length>120))throw fail(400,'Enter up to 40 amenities.');
        const fields=[name,location,publicTypes[kind]||kind,capacity,address,description,rules,latitude,longitude,veg,cancelHours,refundBps];
        if(id){
            await db.execute(`UPDATE mks_listings SET name=?,location=?,type=?,capacity=?,address=?,description=?,rules=?,latitude=?,longitude=?,pure_veg=?,cancel_hours=?,cancel_refund_bps=? WHERE id=?`,[...fields,id]);
        }else{
            const [result]=await db.execute(`INSERT INTO mks_listings(name,location,type,capacity,address,description,rules,latitude,longitude,pure_veg,cancel_hours,cancel_refund_bps)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,fields);
            id=result.insertId;
        }
        const status=p?(p.state||'approved'):'draft';
        if(p&&status==='approved'&&kind!==p.kind&&kind===rentalTypes[5])throw fail(409,'Temporary modular accommodation must start as a separate application.');
        await db.execute(`INSERT INTO mks_property_workflow(listing_id,owner_id,kind,state,rooms,beds,bathrooms,sanitation) VALUES (?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE owner_id=VALUES(owner_id),kind=VALUES(kind),rooms=VALUES(rooms),beds=VALUES(beds),bathrooms=VALUES(bathrooms),sanitation=VALUES(sanitation)`,
            [id,ownerId,kind,status,rooms,beds,bathrooms,sanitation]);
        const minNights=integer(input.minNights??1,1,90),maxNights=integer(input.maxNights??90,minNights,90);
        await db.execute(`INSERT INTO mks_hotel_stay_rules VALUES (?,?,?) ON DUPLICATE KEY UPDATE min_nights=VALUES(min_nights),max_nights=VALUES(max_nights)`,
            [id,minNights,maxNights]);
        await db.execute('DELETE FROM mks_listing_amenities WHERE listing_id=?',[id]);
        for(const item of amenities)await db.execute('INSERT INTO mks_listing_amenities VALUES (?,?)',[id,item]);
        await audit(db,user,p?'property.edit':'property.create',id,{before:p?{name:p.name,location:p.location,address:p.address,type:p.type,capacity:p.capacity}:null,after:{name,location,address,kind,capacity,ownerId,rooms,beds,bathrooms,latitude,longitude,veg,cancelHours,refundBps,minNights,maxNights,amenities}});
        return {id};
    });
}
function requiredFiles(kind){
    return ['identity','ownership',...(kind===rentalTypes[5]?['permission','safety']:kind===rentalTypes[6]?['permission']:[])];
}
async function submissionStatus(db,p,files){
    const [[partner]]=p.owner_id?await db.execute('SELECT 1 FROM mks_hotel_partners WHERE user_id=?',[p.owner_id]):[[]];
    const needed=[...new Set([...requiredFiles(p.kind),...(partner?['business','safety']:[])])];
    const today=new Date(Date.now()+19800000).toISOString().slice(0,10);
    const [[{ready}]]=await db.execute(`SELECT EXISTS(SELECT 1 FROM mks_room_types t JOIN mks_room_nights n ON n.room_type_id=t.id
        WHERE t.listing_id=? AND n.date>=? AND n.remaining>0 AND n.rate_minor>0
        AND NOT EXISTS(SELECT 1 FROM mks_hotel_blocked_nights b WHERE b.room_type_id=n.room_type_id AND b.date=n.date)) AS ready`,[p.id,today]);
    return {
        coordinates:p.latitude!=null&&p.longitude!=null,
        photo:files.some(file=>file.kind==='photo'),
        sanitation:p.kind===rentalTypes[5]?Boolean(p.sanitation?.trim()):null,
        availability:Boolean(ready),
        documents:needed.map(kind=>({kind,uploaded:files.some(file=>file.kind===kind),reviewed:files.some(file=>file.kind===kind&&file.reviewed)}))
    };
}
async function checkSubmission(db,p,reviewed){
    const [files]=await db.execute('SELECT kind,reviewed FROM mks_property_files WHERE listing_id=?',[p.id]);
    const status=await submissionStatus(db,p,files);
    if(!status.photo||status.documents.some(file=>reviewed?!file.reviewed:!file.uploaded)){
        throw fail(409,reviewed?'Review all required verification documents and confirm published photographs before approving.':'Upload a property photo and all required verification documents.');
    }
    if(!status.coordinates)throw fail(409,'Add the property map coordinates.');
    if(status.sanitation===false)throw fail(409,'Add sanitation details for the temporary accommodation.');
    if(!status.availability)throw fail(409,'Add a room category and at least one open future night with stock and pricing.');
}
async function transition(user,id,input){
    return transaction(async db=>{
        const p=await findListing(db,user,id,true);
        const action=input.action;
        if(action==='reopen'){
            if(user.role!=='host'||!user.partner||p.state!=='approved')throw fail(403,'Only the hotel owner can reopen an approved listing.');
            await db.execute("UPDATE mks_property_files SET reviewed=0 WHERE listing_id=? AND kind<>'photo'",[id]);
        }else if(action==='submit'){
            if(!['draft','rejected'].includes(p.state))throw fail(409,'Only drafts and rejected properties can be submitted.');
            await checkSubmission(db,p,false);
        }else{
            requirePermission(user,'properties');
            if(!['approve','reject','suspend'].includes(action))throw fail(400,'Unsupported review action.');
            if(action==='suspend'&&(p.state||'approved')!=='approved')throw fail(409,'Only published properties can be suspended.');
            if(action==='reject'&&p.state!=='submitted')throw fail(409,'Only submitted properties can be rejected.');
            if(action==='approve'){
                if(!['submitted','suspended'].includes(p.state))throw fail(409,'Only submitted or suspended properties can be approved.');
                await checkSubmission(db,p,true);
                if(input.acknowledge!==true)throw fail(400,'Confirm the documented review before approval.');
            }
        }
        const state={reopen:'draft',submit:'submitted',approve:'approved',reject:'rejected',suspend:'suspended'}[action];
        const note=text(input.note||'',1000,['reject','suspend'].includes(action));
        await db.execute(`INSERT INTO mks_property_workflow(listing_id,kind,state,rooms,beds,bathrooms,review_note) VALUES (?,?,?,1,1,1,?)
            ON DUPLICATE KEY UPDATE state=VALUES(state),review_note=VALUES(review_note)`,[id,p.kind||p.type,state,note]);
        await db.execute('UPDATE mks_listings SET verified=? WHERE id=?',[state==='approved',id]);
        await audit(db,user,'property.'+action,id,{from:p.state||'approved',to:state,note});
        return {state};
    });
}
function fileMime(bytes){
    if(bytes.subarray(0,5).equals(Buffer.from('%PDF-')))return 'application/pdf';
    if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
    if(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return 'image/png';
    return null;
}
async function upload(user,id,input){
    const original=text(input.filename,150).replace(/[\r\n"\\/]/g,'_');
    const kind=text(input.kind,40);
    if(!['photo','identity','ownership','permission','business','safety'].includes(kind)||typeof input.base64!=='string'||input.base64.length>Math.ceil(fileLimit/3)*4)throw fail(400,'Select a file of up to 3 MB.');
    const contents=Buffer.from(input.base64,'base64');
    const mime=fileMime(contents);
    if(!mime||(kind==='photo'&&mime==='application/pdf'))throw fail(400,'Upload a JPG, PNG or a PDF document. Photos must be JPG or PNG.');
    const suffix={'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png'}[mime];
    const filename=(original.replace(/\.[^.]+$/,'')||'property-file')+suffix;
    return transaction(async db=>{
        const p=await findListing(db,user,id,true);
        if(user.role==='host'&&!['draft','rejected'].includes(p.state))throw fail(409,'Only draft and rejected listings can receive files.');
        const [[count]]=await db.execute('SELECT COUNT(*) AS total FROM mks_property_files WHERE listing_id=?',[id]);
        if(count.total>=24)throw fail(409,'This property has reached its file limit.');
        const [result]=await db.execute('INSERT INTO mks_property_files(listing_id,kind,filename,mime,contents) VALUES (?,?,?,?,?)',[id,kind,filename,mime,contents]);
        if(kind==='photo'){
            const url='/media/property/'+result.insertId;
            const gallery=[...(json(p.gallery)||[]),url];
            await db.execute('UPDATE mks_listings SET image=COALESCE(image,?),gallery=? WHERE id=?',[url,JSON.stringify(gallery),id]);
        }
        await audit(db,user,'property.upload',id,{fileId:result.insertId,kind});
        return {id:result.insertId};
    });
}
async function reviewFile(user,id,fileId,reviewed){
    requirePermission(user,'properties');
    if(typeof reviewed!=='boolean')throw fail(400,'Choose a document review status.');
    return transaction(async db=>{
        const p=await findListing(db,user,id,true);
        if(p.state==='approved')throw fail(409,'Suspend the property before re-opening document review.');
        const [result]=await db.execute("UPDATE mks_property_files SET reviewed=? WHERE listing_id=? AND id=? AND kind<>'photo'",[reviewed,id,fileId]);
        if(!result.affectedRows)throw fail(404,'Document not found.');
        await audit(db,user,'document.review',id,{fileId,reviewed});
        return {reviewed};
    });
}
async function download(user,id,fileId){
    await findListing(pool,user,id);
    const [[file]]=await pool.execute('SELECT filename,mime,contents FROM mks_property_files WHERE listing_id=? AND id=?',[id,fileId]);
    if(!file)throw fail(404,'File not found.');
    await audit(pool,user,'document.download',id,{fileId});
    return file;
}
async function media(id){
    const [[file]]=await pool.execute(`SELECT f.mime,f.contents FROM mks_property_files f JOIN mks_property_workflow w ON w.listing_id=f.listing_id
        WHERE f.id=? AND f.kind='photo' AND w.state='approved'`,[id]);
    if(!file)throw fail(404,'Photo not found.');
    return file;
}
function windowDates(start,end,max){
    if(!validSearchDate(start)||!validSearchDate(end)||start>end||(Date.parse(end)-Date.parse(start))/86400000>=max)throw fail(400,'Choose a valid date range up to '+max+' days.');
}
async function calendar(user,id,room,start,end){
    if(user.role==='host')await findListing(pool,user,id);
    else requirePermission(user,'inventory');
    windowDates(start,end,93);
    const [rows]=await pool.execute(`SELECT n.date,n.remaining,n.rate_minor,n.tax_bps,(b.date IS NOT NULL) AS blocked
        FROM mks_room_nights n JOIN mks_room_types t ON t.id=n.room_type_id
        LEFT JOIN mks_hotel_blocked_nights b ON b.room_type_id=n.room_type_id AND b.date=n.date
        WHERE n.room_type_id=? AND t.listing_id=? AND n.date BETWEEN ? AND ? ORDER BY n.date`,[room,id,start,end]);
    const [closures]=await pool.execute(`SELECT b.date,1 AS blocked FROM mks_hotel_blocked_nights b JOIN mks_room_types t ON t.id=b.room_type_id
        WHERE b.room_type_id=? AND t.listing_id=? AND b.date BETWEEN ? AND ?`,[room,id,start,end]);
    const priced=new Set(rows.map(row=>row.date));
    return [...rows,...closures.filter(row=>!priced.has(row.date))].sort((a,b)=>a.date.localeCompare(b.date));
}
async function blockCalendar(user,id,room,input){
    if(user.role==='host'&&!user.partner)throw fail(403,'This feature is available to hotel partners.');
    const {start,end,blocked}=input;
    windowDates(start,end,93);
    if(start<new Date(Date.now()+19800000).toISOString().slice(0,10)||typeof blocked!=='boolean')throw fail(400,'Select future dates and a calendar action.');
    return transaction(async db=>{
        await findListing(db,user,id,'inventory');
        const [[type]]=await db.execute('SELECT id FROM mks_room_types WHERE id=? AND listing_id=?',[room,id]);
        if(!type)throw fail(404,'Room type not found.');
        if(blocked){
            for(let ms=Date.parse(start);ms<=Date.parse(end);ms+=86400000){
                const date=new Date(ms).toISOString().slice(0,10);
                await db.execute('INSERT IGNORE INTO mks_hotel_blocked_nights(room_type_id,date) VALUES (?,?)',[room,date]);
            }
        }else await db.execute('DELETE FROM mks_hotel_blocked_nights WHERE room_type_id=? AND date BETWEEN ? AND ?',[room,start,end]);
        await audit(db,user,blocked?'inventory.block':'inventory.unblock',id,{room,start,end});
        return {saved:true};
    });
}
async function saveRoom(user,id,room,input){
    return transaction(async db=>{
        const listing=await findListing(db,user,id,'inventory');
        if(user.role==='host'&&!['draft','rejected'].includes(listing.state))throw fail(409,'Ask the property review team to change approved room categories.');
        const name=text(input.name,120),capacity=integer(input.capacity,1,120),description=text(input.description||'',3000,false);
        const urls=String(input.images||'').split('\n').map(url=>url.trim()).filter(Boolean);
        if(urls.length>10)throw fail(400,'Add up to ten room images.');
        const imageUrls=urls.map(mediaUrl);
        for(const url of imageUrls.filter(value=>value.startsWith('/media/'))){
            const [[file]]=await db.execute("SELECT id FROM mks_property_files WHERE listing_id=? AND id=? AND kind='photo'",[id,Number(url.split('/').at(-1))]);
            if(!file)throw fail(400,'Only photographs uploaded to this property can be used as local room images.');
        }
        const images=JSON.stringify(imageUrls);
        if(room){
            const [r]=await db.execute('UPDATE mks_room_types SET name=?,capacity=?,description=?,images=? WHERE id=? AND listing_id=?',[name,capacity,description,images,room,id]);
            if(!r.affectedRows)throw fail(404,'Room type not found.');
        }else{
            const [r]=await db.execute('INSERT INTO mks_room_types(listing_id,name,capacity,description,images) VALUES (?,?,?,?,?)',[id,name,capacity,description,images]);
            room=r.insertId;
        }
        await audit(db,user,'room.save',id,{room,name,capacity});
        return {room};
    });
}
async function changeCalendar(user,id,room,input){
    const start=input.start,end=input.end;
    windowDates(start,end,93);
    if(start<new Date(Date.now()+19800000).toISOString().slice(0,10))throw fail(400,'Past dates cannot be changed.');
    const delta=integer(input.delta,-500,500),rate=integer(input.rate,1,100000000),tax=integer(input.tax,0,10000);
    return transaction(async db=>{
        const listing=await findListing(db,user,id,'inventory');
        const [[type]]=await db.execute('SELECT id FROM mks_room_types WHERE id=? AND listing_id=?',[room,id]);
        if(!type)throw fail(404,'Room type not found.');
        for(let millis=Date.parse(start);millis<=Date.parse(end);millis+=86400000){
            const date=new Date(millis).toISOString().slice(0,10);
            await db.execute('INSERT IGNORE INTO mks_room_nights VALUES (?,?,0,?,?)',[room,date,rate,tax]);
            const [stock]=await db.execute(`SELECT n.room_type_id,n.remaining FROM mks_room_nights n
                JOIN mks_room_types t ON t.id=n.room_type_id WHERE t.listing_id=? AND n.date=? ORDER BY n.room_type_id FOR UPDATE`,[id,date]);
            const remaining=stock.find(row=>row.room_type_id===room).remaining+delta;
            if(listing.rooms&&delta>0){
                const [[committed]]=await db.execute(`SELECT COALESCE(SUM(rooms),0) AS total FROM mks_bookings
                    WHERE listing_id=? AND checkin<=? AND checkout>? AND status IN ('held','confirmed')`,[id,date,date]);
                if(stock.reduce((sum,row)=>sum+row.remaining,0)+Number(committed.total)+delta>listing.rooms){
                    throw fail(409,'Stock would exceed this property\'s registered room count for '+date+'.');
                }
            }
            if(remaining<0||remaining>500)throw fail(409,'Stock adjustment is outside the available room count for '+date+'.');
            await db.execute('UPDATE mks_room_nights SET remaining=?,rate_minor=?,tax_bps=? WHERE room_type_id=? AND date=?',[remaining,rate,tax,room,date]);
        }
        await audit(db,user,'inventory.change',id,{room,start,end,delta,rate,tax});
        return {saved:true};
    });
}
module.exports={fileMime,rentalTypes,hotelTypes,listings,listingDetail,saveListing,transition,upload,reviewFile,download,media,calendar,saveRoom,changeCalendar,blockCalendar};
