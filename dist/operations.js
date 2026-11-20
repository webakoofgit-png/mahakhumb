const adminSections=[
    ['overview','Overview Dashboard','overview'],['hotels','Hotel Management','properties'],['inventory','Room Inventory','inventory'],
    ['rentals','Rental Stay Management','properties'],['bookings','Booking Management','bookings'],['customers','Customer Management','customers'],
    ['partners','Hotel Partner Management','partners'],['cabs','Cab Partner Management','cabs'],['restaurants','Restaurant Management','restaurants'],
    ['groups','Bulk Booking Enquiries','groups'],['agents','Agent Management','agents'],['payments','Payments and Refunds','payments'],
    ['finance','Commission and Payouts','finance'],['cms','CMS Management','cms'],['support','Support Tickets','support'],
    ['reports','Reports and Analytics','reports'],['staff','Staff Roles and Permissions','staff'],['settings','Settings','settings']
];
const hostSections=[
    ['properties','My Properties'],['inventory','Availability Calendar'],['pricing','Pricing'],['bookings','Bookings'],
    ['guests','Guest Details'],['earnings','Earnings'],['payouts','Payouts'],['support','Support']
];
const hotelSections=[
    ['overview','Overview'],['properties','My Properties'],['rooms','Room Categories'],['inventory','Room Inventory Calendar'],['pricing','Seasonal Pricing'],
    ['bookings','Booking Management'],['arrivals','Guest Check-in / Check-out'],['groups','Bulk Booking Enquiries'],
    ['earnings','Earnings and Commission'],['payouts','Payout History'],['reviews','Reviews'],['profile','Profile and Settings']
];
const cabSections=[['requests','Trip Requests'],['trips','Assigned Trips'],['fleet','Vehicles and Drivers'],
    ['verification','Document Verification'],['cab-earnings','Earnings'],['profile','Service Areas and Profile']];
let operationsCab=false;
let operationsPartner=false;
let operationsSession;
let operationsRoot;
let operationsPane;
let operationsHost;
let operationsSection;
let operationsOffset=0;
let operationsQuery='';
let operationsStatus='';
let operationsRequest=0;
const oe=escapeHtml;
const opMoney=value=>bookingMoney(Number(value)||0);

async function opsApi(route,body){
    const options=body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':operationsSession?.user?.csrf||''},body:JSON.stringify(body)};
    const response=await fetch('/api/operations/'+route,options);
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'The request could not be completed.');
    return data;
}
function opField(label,name,value='',options={}){
    const val=oe(value??'');
    const attributes=`name="${name}" ${options.optional?'':'required'}`;
    if(options.choices){
        const choices=options.choices.map(choice=>Array.isArray(choice)?choice:[choice,choice]);
        return `<label>${label}<select class="input" ${attributes}>${choices.map(([key,caption])=>`<option value="${oe(key)}"${String(key)===String(value??'')?' selected':''}>${oe(caption)}</option>`).join('')}</select></label>`;
    }
    if(options.type==='textarea')return `<label class="ops-full">${label}<textarea class="input" ${attributes} rows="4" maxlength="${options.maxlength||12000}">${val}</textarea></label>`;
    return `<label>${label}<input class="input" ${attributes} type="${options.type||'text'}" value="${val}"${options.min!==undefined?' min="'+options.min+'"':''}${options.max!==undefined?' max="'+options.max+'"':''}${options.step?' step="'+options.step+'"':''}${options.maxlength?' maxlength="'+options.maxlength+'"':''}></label>`;
}
function opForm(route,contents,button='Save',done='refresh'){
    return `<form class="ops-form" data-route="${oe(route)}" data-done="${oe(done)}" onsubmit="submitOpsForm(event)">${contents}
        <p class="notice ops-full" role="status"></p><button class="btn" type="submit">${button}</button></form>`;
}
function opTable(head,rows){
    return rows.length?`<div class="table-wrap"><table class="ops-table"><thead><tr>${head.map(title=>`<th scope="col">${title}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell??''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="notice">No records found.</p>';
}
function opStatus(value){return `<span class="status">${oe(value)}</span>`}
function opButton(label,onclick){return `<button class="btn outline small" type="button" onclick="${oe(onclick)}">${label}</button>`}
function opSection(label,markup){return `<section class="panel ops-card"><h2>${label}</h2>${markup}</section>`}
function opsCan(permission){return operationsSession.user?.permissions.includes(permission)}
function opsBase(){return operationsCab?'/cab-partner':operationsPartner?'/hotel-partner':operationsHost?'/rental-host':'/admin'}
function opsLinks(tabs,active){
    return tabs.map(([key,label])=>`<a class="side-link ${key===active?'active':''}" href="#${opsBase()}/${key}" ${key===active?'aria-current="page"':''}>${label}</a>`).join('');
}
function opsSignIn(host){
    const title=operationsCab?'Cab Partner Portal':operationsPartner?'Hotel Partner Portal':host?'Build your rental stay':'Admin dashboard';
    return `<div class="page-head"><h1>${title}</h1></div><div class="ops-login panel">
        <h2>Sign in</h2>${opForm('login',opField('Email','email','',{type:'email'})+opField('Password','password','',{type:'password'}),'Sign in','login')}
        ${host?`<details class="ops-signup"><summary>${operationsCab?'Create a cab partner account':operationsPartner?'Create a hotel partner account':'Create a host account'}</summary>
           ${opForm('register',opField('Full name','name','',{maxlength:120})+opField('Email','email','',{type:'email'})+opField('Password (12 characters or more)','password','',{type:'password',maxlength:128})+((operationsPartner||operationsCab)?
             `<input type="hidden" name="workspace" value="${operationsCab?'cab-partner':'hotel-partner'}">`+opField('Business name','businessName','',{maxlength:160})+
             opField('Business email','businessEmail','',{type:'email'})+opField('Business phone','businessPhone','',{type:'tel',maxlength:30})+
             (operationsCab?opField('Service areas','serviceAreas','',{type:'textarea',maxlength:1000}):'') :''),'Register','login')}
        </details>`:''}</div>`;
}
async function submitOpsForm(event){
    event.preventDefault();
    const form=event.target;
    const button=form.querySelector('button[type=submit]');
    const message=form.querySelector('[role=status]');
    const body=Object.fromEntries(new FormData(form));
    for(const field of ['jain','satvik','verified','reviewed'])if(form.elements[field])body[field]=form.elements[field].checked;
    if(form.elements.active)body.active=form.elements.active.checked;
    if(form.elements.notifications)body.notifications=form.elements.notifications.checked;
    if(form.elements.blocked)body.blocked=form.elements.blocked.value==='block';
    if(form.elements.acknowledge)body.acknowledge=form.elements.acknowledge.checked;
    if(form.dataset.done==='staff')body.permissions=new FormData(form).getAll('permissions');
    button.disabled=true;
    try{
        let result;
        if(form.elements.file){
            const files=[...form.elements.file.files];
            if(!files.length||files.length>10||(body.kind!=='photo'&&files.length!==1))throw new Error('Select up to 10 photographs or one verification document.');
            if(files.some(file=>file.size>3*1024*1024))throw new Error('Each file must be 3 MB or smaller.');
            delete body.file;
            for(const [index,file] of files.entries()){
                message.textContent='Uploading '+(index+1)+' of '+files.length+'...';
                const base64=await new Promise((resolve,reject)=>{
                    const reader=new FileReader();
                    reader.onload=()=>resolve(reader.result.split(',')[1]);
                    reader.onerror=()=>reject(new Error('The file could not be read.'));
                    reader.readAsDataURL(file);
                });
                try{result=await opsApi(form.dataset.route,{...body,filename:file.name,base64})}
                catch(error){throw new Error(index?index+' file(s) saved. '+error.message:error.message)}
            }
        }else result=await opsApi(form.dataset.route,body);
        if(!form.isConnected)return;
        if(['login','logout','profile'].includes(form.dataset.done)){await loadOperations();return}
        if(form.dataset.done==='property'){await openOpsProperty(result.id);return}
        if(form.dataset.done==='pilgrim-save'){
            loadedPilgrimEntries=null;
            await openPilgrimCms();
            return;
        }
        if(typeof completeServiceForm==='function'&&await completeServiceForm(form.dataset.done,result))return;
        if(form.dataset.done.startsWith('bulk-quote:')){await openBulkEnquiry(Number(form.dataset.done.split(':')[1]),result.token);return}
        if(form.dataset.done.startsWith('bulk:')){
            await openBulkEnquiry(Number(form.dataset.done.split(':')[1]));
            toast(form.dataset.route.endsWith('/contact')?'Email queued.':'Enquiry updated.');
            return;
        }
        if(form.dataset.done.startsWith('property:')){await openOpsProperty(Number(form.dataset.done.split(':')[1]));return}
        if(form.dataset.done.startsWith('inventory:')){await openOpsInventory(Number(form.dataset.done.split(':')[1]));return}
        if(form.dataset.done==='calendar'){await showOpsCalendar(form.dataset.route.split('/')[1],form.dataset.route.split('/')[3],body.start,body.end);return}
        await showOperationsSection();
        toast('Changes saved.');
    }catch(error){if(form.isConnected)message.textContent=error.message}
    finally{if(button.isConnected)button.disabled=false}
}
async function loadOperations(){
    const root=document.getElementById('operations-root');
    if(!root)return;
    try{
        const route=location.hash.slice(2).split('?')[0].split('/');
        const session=await opsApi('session');
        if(!root.isConnected)return;
        operationsRoot=root;
        operationsCab=route[0]==='cab-partner';
        operationsPartner=['hotel-partner','owner'].includes(route[0]);
        operationsHost=route[0]==='rental-host'||operationsPartner||operationsCab;
        operationsSession=session;
        if(!session.user){root.innerHTML=opsSignIn(operationsHost);return}
        if(operationsHost!==(session.user.role==='host')||(operationsHost&&(operationsPartner!==Boolean(session.user.partner)||operationsCab!==Boolean(session.user.cab)))){
            root.innerHTML=opSection('Switch workspace',`<p>This account belongs to a different workspace.</p><a class="btn outline" href="#/${session.user.role==='host'?(session.user.cab?'cab-partner':session.user.partner?'hotel-partner':'rental-host'):'admin'}">Open workspace</a>${opForm('logout','','Sign out','logout')}`);
            return;
        }
        const tabs=operationsHost?(operationsCab?cabSections:operationsPartner?hotelSections:hostSections):adminSections.filter(([, ,permission])=>opsCan(permission));
        const tab=tabs.find(([key])=>key===route[1])||tabs[0];
        operationsSection=tab?.[0];
        operationsOffset=0;
        operationsQuery='';
        operationsStatus='';
        root.innerHTML=`<div class="ops-heading"><div><span class="eyebrow">${operationsCab?'Transport workspace':operationsPartner?'Hotel workspace':operationsHost?'Host workspace':'Platform administration'}</span><h1 class="serif">${operationsCab?'Cab Partner Portal':operationsPartner?'Hotel Partner Portal':operationsHost?'Rental host dashboard':'Admin dashboard'}</h1></div>
        <div><span>${oe(session.user.name)}</span>${opForm('logout','','Sign out','logout')}</div></div>
        <div class="dashboard ops-layout"><aside class="sidebar ops-sidebar"><nav aria-label="${operationsHost?'Host':'Admin'} sections">${opsLinks(tabs,operationsSection)}</nav></aside>
        <section class="ops-main"><h2 class="serif">${tab?.[1]||'No modules assigned'}</h2><div id="operations-pane" aria-live="polite"></div></section></div>`;
        operationsPane=root.querySelector('#operations-pane');
        if(operationsSection)await showOperationsSection();
    }catch(error){if(root.isConnected)root.textContent=error.message}
}
function opsParams(){return new URLSearchParams({offset:operationsOffset,limit:25,q:operationsQuery,status:operationsStatus})}
function filterOperations(event){
    event.preventDefault();
    const data=new FormData(event.target);
    operationsQuery=data.get('q')||'';
    operationsStatus=data.get('status')||'';
    operationsOffset=0;
    showOperationsSection();
}
function pageOperations(delta){operationsOffset=Math.max(0,operationsOffset+delta*25);showOperationsSection()}
function opsPager(rows){
    return `<div class="ops-pager">${operationsOffset?opButton('Previous','pageOperations(-1)'):''}${rows.length===25?opButton('Next','pageOperations(1)'):''}</div>`;
}
function opsFilter(status=false){
    return `<form class="ops-filter" onsubmit="filterOperations(event)">${opField('Search','q',operationsQuery,{optional:true,maxlength:120})}
        ${status?opField('Booking status','status',operationsStatus,{optional:true,choices:[['','All statuses'],'held','confirmed','expired','cancelled']}):''}
        <button class="btn small">Filter</button></form>`;
}
function overviewMarkup(data){
    const metrics=[['Registered properties',data.registered],['Verified properties',data.verified],['Active bookings',data.active],['Pending bookings',data.pending],
        ['Gross booking value',opMoney(data.gross)],['Platform commission',opMoney(data.commission)],['Pending partner payouts',opMoney(data.pendingPayouts)],['Refund requests',data.refunds]];
    const chart=(label,rows,key)=>opSection(label,rows.length?`<ul class="ops-chart">${rows.map(row=>`<li><span>${oe(row[key])}</span><meter value="${Number(row.count)}" max="${Math.max(...rows.map(item=>Number(item.count)))}">${row.count}</meter><strong>${row.count}</strong></li>`).join('')}</ul>`:'<p class="notice">No data yet.</p>');
    return `<div class="ops-metrics">${metrics.map(([key,value])=>`<div class="panel"><strong>${oe(value)}</strong><span>${key}</span></div>`).join('')}</div>
        <div class="ops-columns">${chart('Paid bookings by date (last 30 days)',data.trend,'date')}${chart('Property distribution',data.distribution,'category')}</div>`;
}
function opsPropertyTable(rows,calendar=false){
    const create=!calendar?opButton('Create property','openOpsProperty(0)'):'';
    return `${opsFilter()}${create}${opTable(['Name','Location',...(calendar?[]:['Type','Status','Host']),''],
        rows.map(p=>[oe(p.name),oe(p.location),...(calendar?[]:[oe(p.kind||p.type),opStatus(p.state),oe(p.owner||'')]),
            opButton(calendar?'Manage rooms':'Open',calendar?`openOpsInventory(${p.id})`:`openOpsProperty(${p.id})`)]))}${opsPager(rows)}`;
}
function propertyEditor(p={}){
    const types=operationsHost?(operationsPartner?operationsSession.hotelTypes:operationsSession.propertyTypes):[...operationsSession.hotelTypes,...operationsSession.propertyTypes];
    const fields=(!operationsHost?opField('Assign to host email (optional)','ownerEmail',p.owner_email,{type:'email',optional:true}):'')+opField('Property name','name',p.name,{maxlength:160})+opField('Accommodation type','kind',p.kind??types[0],{choices:types})
        +opField('Area','location',p.location??'Nashik City',{choices:[...new Set([...locations,...(p.location?[p.location]:[])])]})+opField('Full address','address',p.address,{maxlength:400})
        +opField('Latitude','latitude',p.latitude,{type:'number',step:'any',min:-90,max:90,optional:true})+opField('Longitude','longitude',p.longitude,{type:'number',step:'any',min:-180,max:180,optional:true})
        +'<div class="ops-full"><button type="button" class="btn outline small" onclick="previewPropertyMap(this)">Preview map location</button></div>'
        +opField('Rooms in property','rooms',p.rooms??1,{type:'number',min:1,max:500})+opField('Beds','beds',p.beds??1,{type:'number',min:1,max:1500})
        +opField('Bathrooms','bathrooms',p.bathrooms??1,{type:'number',min:1,max:500})+opField('Maximum guests per room','capacity',p.capacity??2,{type:'number',min:1,max:120})
        +opField('Pure veg food','pureVeg',p.pure_veg===1?'yes':p.pure_veg===0?'no':'',{optional:true,choices:[['','Unspecified'],['yes','Available'],['no','Unavailable']]})
        +opField('Amenities (comma separated)','amenities',(p.amenities||[]).join(', '),{optional:true})
        +opField('Refund deadline before check-in date (hours)','cancelHours',p.cancel_hours??0,{type:'number',min:0,max:8760})
        +opField('Minimum stay (nights)','minNights',p.min_nights??1,{type:'number',min:1,max:90})
        +opField('Maximum stay (nights)','maxNights',p.max_nights??90,{type:'number',min:1,max:90})
        +opField('Refund rate before deadline (100 basis points = 1%)','refundBps',p.cancel_refund_bps??0,{type:'number',min:0,max:10000})
        +opField('Description','description',p.description,{type:'textarea',optional:true,maxlength:10000})
        +opField('Property rules','rules',p.rules,{type:'textarea',optional:true,maxlength:3000})
        +opField('Sanitation plan (required for temporary lodging)','sanitation',p.sanitation,{type:'textarea',optional:true,maxlength:4000})
        +'<p class="notice ops-full">Temporary lodging requires permission and safety evidence as well as a sanitation plan. An admin must verify all three before publication.</p>';
    return opForm('properties'+(p.id?'/'+p.id:''),fields,'Save property','property');
}
function previewPropertyMap(button){
    const {latitude,longitude}=button.form.elements;
    if(!latitude.value||!longitude.value||!latitude.checkValidity()||!longitude.checkValidity()){
        toast('Enter a valid latitude and longitude to preview the location.');
        return;
    }
    const position=Number(latitude.value)+','+Number(longitude.value);
    window.open('https://maps.google.com/?q='+encodeURIComponent(position),'_blank','noopener,noreferrer');
}
function propertyReadiness(status){
    if(!status)return '';
    const labels={identity:'Identity evidence',ownership:'Ownership or authorization',permission:'Permission evidence',
        safety:'Safety verification',business:'Business documentation'};
    const rows=[
        ['Property map coordinates',status.coordinates?'Ready':'Missing'],
        ['Property photograph',status.photo?'Ready':'Missing'],
        ['Room category with an available priced night',status.availability?'Ready':'Missing'],
        ...(status.sanitation!==null?[['Sanitation plan',status.sanitation?'Ready':'Missing']]:[]),
        ...status.documents.map(file=>[labels[file.kind],file.reviewed?'Reviewed':file.uploaded?'Uploaded':'Missing'])
    ];
    return opTable(['Requirement','Status'],rows.map(([label,state])=>[label,opStatus(state)]));
}
function propertyApproval(p){
    const base='properties/'+p.id+'/transition';
    const action=(name,fields='',label=name)=>opForm(base,`<input type="hidden" name="action" value="${name}">${fields}`,label,'property:'+p.id);
    const details=p.review_note?`<p>Review note ${oe(p.review_note)}</p>`:'';
    if(operationsHost){
        return details+(['draft','rejected'].includes(p.state)?action('submit','','Submit for review'):
            operationsPartner&&p.state==='approved'?'<p class="notice">Reopening this listing removes it from search until it is approved again. Existing bookings remain in your dashboard.</p>'+action('reopen','','Reopen for editing'):
            '<p class="notice">Properties under review are managed through support.</p>');
    }
    const note=opField('Reason','note','',{type:'textarea',maxlength:1000});
    if(p.state==='submitted'||p.state==='suspended'){
        const ack='<label class="ops-check ops-full"><input name="acknowledge" type="checkbox" required> I reviewed the property photos, required documents and any temporary lodging sanitation plan.</label>';
        return details+action('approve',ack,'Approve and publish')+(p.state==='submitted'?action('reject',note,'Reject application'):'');
    }
    if(p.state==='approved')return details+action('suspend',note,'Suspend listing');
    return details+action('submit','','Submit for review');
}
function propertyFiles(p){
    const canUpload=!operationsHost||['draft','rejected'].includes(p.state);
    const rows=p.files.map(f=>[oe(f.kind),`<a class="text-link" href="/api/operations/properties/${p.id}/files/${f.id}">${oe(f.filename)}</a>`,
        f.kind==='photo'?'Photo':opStatus(f.reviewed?'Reviewed':'Awaiting review'),
        !operationsHost&&p.state!=='approved'&&f.kind!=='photo'?opButton(f.reviewed?'Undo review':'Mark reviewed',`opsReviewFile(${p.id},${f.id},${!f.reviewed})`):'']);
    return `<p class="notice">Upload a property photo, identity evidence and proof of ownership or authority. Hotel partners also need applicable business and safety evidence. Temporary lodging also requires documented permission and safety evidence. Authorized group accommodation requires permission evidence.</p>
        ${opTable(['Type','File','Status',''],rows)}
        ${canUpload?opForm('properties/'+p.id+'/files',opField('File type','kind','photo',{choices:[['photo','Property photo'],['identity','Identity evidence'],['ownership','Ownership or authorization'],['permission','Permission'],['business','Business documentation'],['safety','Safety evidence']]})+
            '<label>JPG, PNG or PDF (3 MB each)<input class="input" type="file" name="file" accept="image/jpeg,image/png,application/pdf" multiple required></label>','Upload file','property:'+p.id):''}`;
}
async function opsReviewFile(id,file,reviewed){
    try{await opsApi(`properties/${id}/files/${file}`,{reviewed});await openOpsProperty(id)}catch(error){toast(error.message)}
}
async function openOpsProperty(id){
    const pane=operationsPane,request=++operationsRequest;
    try{
        if(!id){
            pane.innerHTML=opButton('Back to properties','showOperationsSection()')+opSection('New property',propertyEditor());
            return;
        }
        const p=await opsApi('properties/'+id);
        if(!pane.isConnected||request!==operationsRequest)return;
        const canEdit=!operationsHost||['draft','rejected'].includes(p.state);
        const canInventory=operationsHost||opsCan('inventory');
        pane.innerHTML=`${opButton('Back to properties','showOperationsSection()')}
            ${opSection(oe(p.name)+' '+opStatus(p.state),canEdit?propertyEditor(p):`<p>${oe(p.address)}</p>`)}
            ${canInventory?opSection('Room categories and availability',opButton('Manage rooms',`openOpsInventory(${p.id})`)):''}
            ${p.business&&!operationsHost?opSection('Hotel business contact',`<p>${oe(p.business.business_name)}<br>${oe(p.business.business_email)}<br>${oe(p.business.business_phone)}</p>`):''}
            ${opSection('Photos and verification documents',propertyFiles(p))}
            ${opSection('Publication review',propertyReadiness(p.readiness)+propertyApproval(p))}`;
    }catch(error){if(pane.isConnected&&request===operationsRequest)toast(error.message)}
}
function roomEditor(property,room={}){
    const images=typeof room.images==='string'?JSON.parse(room.images):room.images;
    const fields=opField('Room name','name',room.name,{maxlength:120})+opField('Guests per room','capacity',room.capacity??2,{type:'number',min:1,max:120})
        +opField('Description','description',room.description,{type:'textarea',optional:true,maxlength:3000})
        +opField('Room image URLs, one per line','images',(images||[]).join('\n'),{type:'textarea',optional:true,maxlength:10000});
    return opForm('properties/'+property+'/rooms'+(room.id?'/'+room.id:''),fields,'Save room','inventory:'+property);
}
async function openOpsInventory(id){
    const pane=operationsPane,request=++operationsRequest;
    try{
        const p=await opsApi('properties/'+id+'?section=inventory');
        const editable=!operationsPartner||['draft','rejected'].includes(p.state);
        if(!pane.isConnected||request!==operationsRequest)return;
        pane.innerHTML=opButton('Back to list','showOperationsSection()')+(operationsHost||opsCan('properties')?opButton('Property details',`openOpsProperty(${id})`):'')
            +opSection(oe(p.name)+' rooms',p.roomTypes.map(room=>`<details class="ops-details"><summary>${oe(room.name)} &middot; ${room.capacity} guests</summary>
            ${editable?roomEditor(id,room):''}${opButton('Open calendar',`showOpsCalendar(${id},${room.id})`)}</details>`).join('')
            +(editable?'<details class="ops-details"><summary>Add a room category</summary>'+roomEditor(id)+'</details>':''));
    }catch(error){if(pane.isConnected&&request===operationsRequest)toast(error.message)}
}
async function showOpsCalendar(id,room,start=indiaDate(),end){
    const pane=operationsPane,request=++operationsRequest;
    end=end||new Date(Date.parse(start)+13*86400000).toISOString().slice(0,10);
    try{
        const route=`properties/${id}/rooms/${room}/calendar`;
        const rows=await opsApi(route+'?'+new URLSearchParams({start,end}));
        const pricing=operationsHost&&operationsSection==='pricing';
        const firstRate=rows.find(row=>row.rate_minor!=null);
        if(!pane.isConnected||request!==operationsRequest)return;
        pane.innerHTML=opButton('Back to rooms',`openOpsInventory(${id})`)+opSection('Nightly availability and pricing',
            `<form class="ops-filter" onsubmit="event.preventDefault();showOpsCalendar(${id},${room},this.elements.start.value,this.elements.end.value)">
              ${opField('From','start',start,{type:'date'})}${opField('Through','end',end,{type:'date'})}<button class="btn small">View dates</button></form>
              ${opTable(['Night','Unsold rooms','Rate','Tax','Status'],rows.map(x=>[x.date,x.remaining??0,x.rate_minor==null?'&mdash;':opMoney(x.rate_minor),x.tax_bps==null?'&mdash;':x.tax_bps/100+'%',x.blocked?'Blocked':'Open']))}
              <p class="notice">${pricing?'These changes update nightly rates and taxes for the selected dates.':'The stock adjustment changes unsold rooms. Use zero to update prices only.'}</p>
              ${opForm(route,opField('From','start',start,{type:'date'})+opField('Through','end',end,{type:'date'})
              +(pricing?'<input type="hidden" name="delta" value="0">':opField('Stock adjustment','delta',0,{type:'number',min:-500,max:500}))+opField('Per-room nightly rate (paise)','rate',firstRate?.rate_minor??'',{type:'number',min:1})
              +opField('Tax (basis points)','tax',firstRate?.tax_bps??0,{type:'number',min:0,max:10000}),pricing?(operationsPartner?'Apply seasonal rates':'Save nightly pricing'):'Update calendar','calendar')}
              ${operationsPartner&&!pricing?'<h3>Date blocks</h3><p class="notice">Blocks stop new reservations for these nights. Existing holds and reservations remain valid.</p>'+
                 opForm(`properties/${id}/rooms/${room}/block`,opField('From','start',start,{type:'date'})+opField('Through','end',end,{type:'date'})+
                   opField('Action','blocked','block',{choices:[['block','Block dates'],['open','Reopen dates']]}),'Save date block','calendar'):''}`);
    }catch(error){if(pane.isConnected&&request===operationsRequest)toast(error.message)}
}
function opsBookingCards(rows,payments=false){
    const reports=operationsSection==='reports';
    const guests=!reports&&operationsSection!=='payments';
    const display=opTable(['Reference','Property and room','Stay',...(guests?['Guest']:[]),'Total','Status',...(reports||(operationsHost&&!operationsPartner)?[]:['Action'])],rows.map((row,index)=>[
        oe(row.reference),oe(row.property)+'<br>'+oe(row.room),oe(row.checkin)+' &ndash; '+oe(row.checkout)+'<br>'+row.rooms+' room(s) &middot; '+row.guests+' guest(s)',
        ...(guests?[oe(row.guest_name)+'<br>'+oe(row.guest_email)+'<br>'+oe(row.guest_phone)]:[]),opMoney(payments?row.amount:row.total),
        opStatus(row.status)+(row.refund_status?'<br>Refund '+oe(row.refund_status)+' &middot; '+opMoney(row.refund_amount):''),
        ...(reports||(operationsHost&&!operationsPartner)?[]:[
            operationsPartner?hotelGuestAction(row):payments&&['expired','cancelled'].includes(row.status)&&!row.refund_status?opButton('Request refund',`openOpsBookingAction(${index},'refund')`):
            !payments&&['held','confirmed'].includes(row.status)?opButton('Cancel booking',`openOpsBookingAction(${index},'cancel')`):''
        ])
    ]));
    const partnerExport=operationsPartner&&operationsSection==='bookings'
        ?`<a class="btn outline small" href="/api/operations/partner/bookings/csv?${oe(opsParams())}">Export booking report</a>`:'';
    return opsFilter(true)+partnerExport+(reports?`<a class="btn outline small" href="/api/operations/reports/csv?${oe(opsParams())}">Export CSV</a>`:'')+display+opsPager(rows);
}
function hotelGuestAction(row){
    if(row.status!=='confirmed')return '';
    if(row.checked_out)return opStatus('Checked out');
    if(row.checked_in)return opButton('Check out',`recordHotelGuest('${row.reference}','check-out')`);
    const today=indiaDate();
    if(today<row.checkin||today>=row.checkout)return opStatus('Not checked in');
    return opButton('Check in',`recordHotelGuest('${row.reference}','check-in')`);
}
async function recordHotelGuest(reference,action){
    const pane=operationsPane,request=operationsRequest;
    try{
        await opsApi('partner/bookings/'+reference,{action});
        if(pane.isConnected&&request===operationsRequest){await showOperationsSection();toast('Guest status updated.')}
    }catch(error){if(pane.isConnected)toast(error.message)}
}
function hotelOverview(data){
    const metrics=[['My properties',data.properties],['Approved properties',data.approved],['Under review',data.review],
        ['Active bookings',data.active],['Arrivals today',data.arrivals],['Departures today',data.departures],
        ['Cancellations',data.cancellations],['Open group enquiries',data.enquiries]];
    return `<div class="ops-metrics">${metrics.map(([label,value])=>`<div class="panel"><strong>${oe(value)}</strong><span>${label}</span></div>`).join('')}</div>
        ${!Number(data.properties)?`<section class="panel ops-card"><h2>Register your hotel</h2><p>Add your hotel address, map coordinates and documents to start the application.</p>
            <a class="btn" href="#/hotel-partner/properties">Open My Properties</a></section>`:''}`;
}
function hotelGroupEnquiries(rows){
    return opsFilter()+rows.map(row=>opSection(oe(row.title)+' '+opStatus(row.quote_status||row.state),
        `<p>${oe(row.property)} &middot; ${oe(row.email||'')} &middot; ${oe(row.created_at)}</p><p class="ops-public-card">${oe(row.details)}</p>`+
        (row.structured?opButton('Review and quote',`openBulkEnquiry(${row.id})`):'')+opForm('partner/groups/'+row.id,opField('Status','state',row.state,{choices:['open','in progress','closed']}),'Update enquiry'))).join('')+
        (!rows.length?'<p class="notice">No group enquiries for your properties yet.</p>':'')+opsPager(rows);
}
function hotelReviews(rows){
    return opsFilter()+rows.map(row=>opSection(oe(row.property),`<p><strong>${row.rating} / 5</strong></p><p>${oe(row.comment||'')}</p>`+
        opForm('partner/reviews/'+row.id,opField('Public hotel reply','reply',row.reply,{type:'textarea',maxlength:2000}),'Save reply'))).join('')+
        (!rows.length?'<p class="notice">No published reviews from verified stays.</p>':'')+opsPager(rows);
}
function hotelProfile(data){
    return opSection('Business details',`<p class="notice">Sign-in email ${oe(data.email)}</p>`+
        opForm('partner/profile',opField('Owner name','name',data.name,{maxlength:120})+opField('Business name','businessName',data.business_name,{maxlength:160})+
        opField('Business email','businessEmail',data.business_email,{type:'email'})+opField('Business phone','businessPhone',data.business_phone,{type:'tel',maxlength:30})+
        '<label class="ops-check ops-full"><input type="checkbox" name="notifications" '+(data.booking_notifications?'checked':'')+'> Email me about confirmed and cancelled bookings</label>',
        'Save profile','profile'));
}
let opsRows=[];
function openOpsBookingAction(index,action){
    const row=opsRows[index];
    const title=action==='cancel'?'Cancel booking':'Request refund';
    const fields=`<input type="hidden" name="action" value="${action}">`
        +(action==='refund'?`<input type="hidden" name="payment" value="${oe(row.payment)}">`+opField('Refund amount (paise)','amount',row.amount,{type:'number',min:1,max:row.amount}):'')
        +opField('Reason','reason','',{type:'textarea',maxlength:1000});
    operationsPane.innerHTML=opButton('Back','showOperationsSection()')+opSection(title+' &middot; '+oe(row.reference),opForm('bookings/'+row.reference,fields,title));
}
function opsRecordTable(rows,area){
    const kind=operationsSession.recordTypes[area];
    const isCms=area==='cms';
    return opsFilter()+(area==='cms'?opButton('Pilgrim assistance CMS','openPilgrimCms()'):'')+opButton('New '+kind.label.toLowerCase(),`openOpsRecord('${area}',-1)`)+
        opTable(['Title',...(isCms?['Content type']:['Contact']),'Status','Date',''],rows.map((row,i)=>[
            oe(row.title),isCms?oe(JSON.parse(row.details).category):oe(row.email||''),opStatus(row.quote_status||row.state),oe(row.created_at),
            operationsHost?'':opButton('Open',row.structured?`openBulkEnquiry(${row.id})`:`openOpsRecord('${area}',${i})`)
        ]))+opsPager(rows)+(operationsHost?rows.map(row=>`<details class="ops-details"><summary>${oe(row.title)}</summary><p>${oe(row.details)}</p></details>`).join(''):'');
}
function openOpsRecord(area,index){
    const row=opsRows[index]||{};
    const kind=operationsSession.recordTypes[area];
    const content=area==='cms'&&row.details?JSON.parse(row.details):{};
    const fields=opField('Title','title',row.title,{maxlength:180})
        +(operationsHost||area==='cms'?'':opField('Contact email','email',row.email,{type:'email',optional:true}))
        +(operationsHost?'':opField('Status','state',row.state??kind.states[0],{choices:kind.states}))
        +(area==='cms'?opField('Content type','category',content.category??operationsSession.cmsTypes[0],{choices:operationsSession.cmsTypes})
            +opField('Image URL','image',content.image,{optional:true,maxlength:1024}):'')
        +(['cms','partners','support','groups'].includes(area)?opField('Property ID (if applicable)','listingId',row.listing_id,{type:'number',min:1,optional:true}):'')
        +opField('Details','details',area==='cms'?content.body:row.details,{type:'textarea'});
    operationsPane.innerHTML=opButton('Back','showOperationsSection()')+
        opSection((row.id?'Edit ':'New ')+kind.label.toLowerCase(),opForm('records/'+area+(row.id?'/'+row.id:''),fields));
}
function financeMarkup(data){
    const balances=opTable(['Property ID','Property','Net booking value','Commission','Paid','Due'],data.balances.map(row=>[row.id,oe(row.name),opMoney(row.net),opMoney(row.commission),opMoney(row.paid),opMoney(row.due)]));
    const payouts=opTable(['Property','Amount','Reference','Recorded'],data.payouts.map(row=>[oe(row.name),opMoney(row.amount),oe(row.external_reference),oe(row.created_at)]));
    const form=opForm('finance/payout',opField('Property ID','listingId','',{type:'number',min:1})+opField('Amount (paise)','amount','',{type:'number',min:1})+
        opField('External payout reference','reference','',{maxlength:100}),'Record payout');
    return (operationsSection==='payouts'?'':opSection('Property balances',balances))+
        (operationsSection==='earnings'?'':opSection('Recorded payouts',payouts))+
        (operationsHost?'':opSection('Record a completed payout','<p class="notice">This records a transfer already made outside the dashboard.</p>'+form));
}
function staffMarkup(rows){
    return (operationsSession.user.role==='superadmin'?opButton('Create staff account','openOpsStaff(-1)'):'')+opButton('Audit log','openOpsAudit()')+
        opTable(['Name','Email','Role','Status',''],rows.map((row,i)=>[oe(row.name),oe(row.email),oe(row.role),opStatus(row.active?'Active':'Disabled'),
            row.role==='staff'&&operationsSession.user.role==='superadmin'?opButton('Edit permissions',`openOpsStaff(${i})`):'']))+opsPager(rows);
}
function openOpsStaff(index){
    const row=opsRows[index]||{};
    const permissions=typeof row.permissions==='string'?JSON.parse(row.permissions):row.permissions||[];
    const fields=opField('Name','name',row.name,{maxlength:120})+opField('Email','email',row.email,{type:'email'})
        +opField('Password (12 characters or more)','password','',{type:'password',optional:Boolean(row.id)})
        +'<label class="ops-check"><input type="checkbox" name="active" '+(!row.id||row.active?'checked':'')+'> Active</label>'
        +`<fieldset class="ops-full"><legend>Module permissions</legend><div class="ops-permissions">${operationsSession.staffPermissions.map(permission=>{
            const label=adminSections.find(section=>section[2]===permission)?.[1]||permission;
            return `<label class="ops-check"><input type="checkbox" name="permissions" value="${permission}" ${permissions.includes(permission)?'checked':''}> ${label}</label>`;
        }).join('')}</div></fieldset>`;
    operationsPane.innerHTML=opButton('Back','showOperationsSection()')+opSection(row.id?'Edit staff permissions':'New staff account',
        opForm('staff'+(row.id?'/'+row.id:''),fields,'Save account','staff'));
}
async function openOpsAudit(offset=0){
    const pane=operationsPane,request=++operationsRequest;
    try{
        const rows=await opsApi('audit?offset='+offset+'&limit=25');
        if(!pane.isConnected||request!==operationsRequest)return;
        pane.innerHTML=opButton('Back to staff','showOperationsSection()')+opSection('Audit log',
            opTable(['Date','Actor','Action','Subject','Changes'],rows.map(row=>[oe(row.created_at),oe(row.email),oe(row.action),oe(row.subject),
                '<details><summary>View</summary><pre>'+oe(typeof row.change_details==='string'?row.change_details:JSON.stringify(row.change_details,null,2))+'</pre></details>']))
            + (offset?opButton('Previous',`openOpsAudit(${offset-25})`):'')+(rows.length===25?opButton('Next',`openOpsAudit(${offset+25})`):''));
    }catch(error){if(pane.isConnected)toast(error.message)}
}
async function showOperationsSection(){
    const pane=operationsPane,section=operationsSection,request=++operationsRequest;
    if(!pane?.isConnected||!section)return;
    const params=opsParams();
    let endpoint,format;
    const dedicated=typeof serviceOperations==='function'?serviceOperations(section,params):null;
    if(dedicated)[endpoint,format]=dedicated;
    else if(section==='overview'){endpoint=operationsPartner?'partner/overview':'overview';format=operationsPartner?hotelOverview:overviewMarkup}
    else if(operationsPartner&&section==='profile'){endpoint='partner/profile';format=hotelProfile}
    else if(operationsPartner&&section==='groups'){endpoint='partner/groups?'+params;format=hotelGroupEnquiries}
    else if(operationsPartner&&section==='reviews'){endpoint='partner/reviews?'+params;format=hotelReviews}
    else if(['hotels','rentals','properties','rooms','inventory','pricing'].includes(section)){
        const calendar=['rooms','inventory','pricing'].includes(section);
        endpoint=(calendar&&!operationsHost?'inventory':'properties')+'?'+params+'&type='+section;
        format=rows=>opsPropertyTable(rows,calendar);
    }else if(['bookings','arrivals','payments','guests','reports'].includes(section)){
        endpoint=(['guests','arrivals'].includes(section)?'bookings':section)+'?'+params;
        format=rows=>opsBookingCards(rows,section==='payments');
    }else if(section==='customers'){
        endpoint='customers?'+params;
        format=rows=>opsFilter()+opTable(['Name','Email','Phone','Bookings','Latest'],rows.map(x=>[oe(x.name),oe(x.email),oe(x.phone),x.bookings,oe(x.latest)]))+opsPager(rows);
    }else if(['finance','earnings','payouts'].includes(section)){endpoint='finance';format=financeMarkup}
    else if(section==='staff'){endpoint='staff?'+params;format=staffMarkup}
    else if(section==='settings'){
        endpoint='settings';
        format=data=>opSection('Commission on new bookings',opForm('settings',
            opField('Platform commission (100 basis points = 1%)','commissionBps',data.commission_bps,{type:'number',min:0,max:10000})));
    }else{endpoint='records/'+section+'?'+params;format=rows=>opsRecordTable(rows,section)}
    pane.textContent='Loading records...';
    try{
        const data=await opsApi(endpoint);
        if(!pane.isConnected||request!==operationsRequest)return;
        opsRows=Array.isArray(data)?data:[];
        pane.innerHTML=format(data);
    }catch(error){if(pane.isConnected&&request===operationsRequest)pane.textContent=error.message}
}

function opsPublicCard(item){
    const link=item.category==='Featured hotel'?`<a class="text-link" href="${sitePath(propertyPath(item.listing_id,item.property_name),activeLocale)}">View ${oe(item.property_name)}</a>`:'';
    return `<article class="panel ops-public-card">${item.image?`<img src="${oe(item.image)}" alt="" loading="lazy">`:''}
        <h3>${oe(item.title)}</h3>${item.body||item.details?`<p>${oe(item.body||item.details)}</p>`:''}${link}</article>`;
}
async function loadPublicOperations(route){
    const main=document.querySelector('main');
    if(!main)return;
    try{
        const items=await opsApi('public');
        if(!main.isConnected)return;
        if(route===''){
            const cards=items.filter(item=>['Homepage banner','Featured hotel','Website announcement'].includes(item.category));
            if(cards.length){
                const block=document.createElement('section');
                block.className='container market-section ops-public-list';
                block.innerHTML=cards.map(opsPublicCard).join('');
                main.querySelector('.booking-hero')?.after(block);
            }
            const faqs=items.filter(item=>item.category==='FAQ');
            const faq=main.querySelector('.faq-layout>div:last-child');
            if(faq&&faqs.length)faq.insertAdjacentHTML('beforeend',faqs.map(item=>`<details class="premium-faq"><summary>${oe(item.title)}</summary><p>${oe(item.body)}</p></details>`).join(''));

        }
    }catch{}
}
const operationsRenderBase=render;
render=function(){
    operationsRenderBase();
    const route=location.hash.slice(2).split(/[/?]/)[0];
    if(['admin','rental-host','hotel-partner','cab-partner','owner'].includes(route))loadOperations();
    else if(route==='')loadPublicOperations(route);
};

async function submitPublicEnquiry(event){
    event.preventDefault();
    const form=event.target;
    const fields=new FormData(form);
    const button=form.querySelector('button');
    const message=form.querySelector('[role=status]');
    const type=fields.get('type');
    const group=type==='Group accommodation';
    button.disabled=true;
    try{
        const listing=new URLSearchParams(location.hash.split('?')[1]).get('listing');
        const result=await opsApi('enquiry',{area:group?'groups':'support',listingId:listing,email:fields.get('email'),
            title:type+' - '+fields.get('name'),details:(group?'Group size '+fields.get('size')+'\n':'')+fields.get('details')});
        if(form.isConnected){form.reset();message.textContent='Enquiry received. Reference '+result.id+'.'}
    }catch(error){if(form.isConnected)message.textContent=error.message}
    finally{if(button.isConnected)button.disabled=false}
}
