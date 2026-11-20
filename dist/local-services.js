let serviceRows=[];
let serviceFleet;
const serviceCategories=['Hatchback','Sedan','SUV','Tempo Traveller','Minibus','Bus'];
const tripStates=['requested','assigned','accepted','completed','cancelled'];
function serviceCheckbox(label,name,checked=false,required=false){
    return `<label class="ops-check"><input type="checkbox" name="${name}" ${checked?'checked':''} ${required?'required':''}> ${label}</label>`;
}
function serviceHead(title,subtitle=''){
    return `<div class="page-head"><div class="breadcrumb"><a href="#/">Home</a> / ${title}</div><h1 class="serif">${title}</h1>${subtitle?`<p>${subtitle}</p>`:''}</div>`;
}
async function loadTransport(root){
    const config=await opsApi('transport');
    const params=new URLSearchParams(location.hash.split('?')[1]);
    const type=params.get('type')==='hotel-ghat'?'Hotel to ghat':config.tripTypes[0];
    const pickup=(params.get('pickup')||'').slice(0,180);
    if(!root.isConnected)return;
    root.innerHTML=serviceHead('Cab and transportation','Book a verified partner ride around Nashik, Trimbakeshwar and nearby areas.')+
        `<div class="detail-layout live-booking-layout transport-booking-layout">
        ${opSection('Book your ride',`<form class="ops-form" id="cab-booking-form" onsubmit="submitTransport(event)">
            <div class="cab-location-tools ops-full"><button type="button" class="btn outline small" onclick="useCabLocation()">Use current location</button><button type="button" class="btn outline small" onclick="swapCabLocations()">Swap</button><button type="button" class="btn outline small" onclick="addCabStop()">+ Add stop</button></div>
            ${opField('Pickup location','pickup',pickup,{maxlength:180,placeholder:'Nashik Railway Station',list:'cab-saved-locations'})}${opField('Drop-off location','dropoff','',{maxlength:180,placeholder:'Trimbakeshwar Temple',list:'cab-saved-locations'})}
            <datalist id="cab-saved-locations"><option value="Nashik Railway Station"><option value="Nashik Airport"><option value="Panchavati"><option value="Trimbakeshwar Temple"><option value="Ramkund Ghat"></datalist><div id="cab-stops" class="ops-full"></div>
            <p class="notice ops-full">${config.mapProvider==='google'?'Map search is enabled.':'Map search is unavailable until an approved provider is configured; enter coordinates below for a secure fare quote.'}</p>
            ${opField('Pickup latitude','pickupLat','',{type:'number',step:'any',min:-90,max:90,optional:true})}${opField('Pickup longitude','pickupLon','',{type:'number',step:'any',min:-180,max:180,optional:true})}${opField('Drop latitude','dropoffLat','',{type:'number',step:'any',min:-90,max:90,optional:true})}${opField('Drop longitude','dropoffLon','',{type:'number',step:'any',min:-180,max:180,optional:true})}
            <div class="ops-full cab-saved-row"><span>Saved locations</span><button type="button" onclick="setCabLocation('Home')">Home</button><button type="button" onclick="setCabLocation('Hotel')">Hotel</button><button type="button" onclick="setCabLocation('Recent')">Recent</button></div>
            <div class="ops-full cab-mode"><label><input type="radio" name="bookingMode" value="now" checked onchange="toggleCabSchedule(false)"> Book now</label><label><input type="radio" name="bookingMode" value="schedule" onchange="toggleCabSchedule(true)"> Schedule later</label></div>
            <label class="check-label ops-full"><input type="checkbox" onchange="toggleCabEasy(this.checked)"> Senior citizen easy mode</label>
            <div id="cab-schedule-fields" class="ops-full" hidden>${opField('Pickup date','date','',{type:'date',min:indiaDate()})}${opField('Pickup time (IST)','time','',{type:'time'})}</div>
            ${opField('Passengers','passengers',1,{type:'number',min:1,max:65})}${opField('Luggage','luggage',0,{type:'number',min:0,max:20})}${opField('Special assistance','assistance','None',{choices:['None','Wheelchair assistance','Elderly traveller','Child seat request']})}
            ${opField('Passenger name','passengerName','',{maxlength:120})}${opField('Passenger mobile','passengerPhone','',{type:'tel',maxlength:30})}${opField('Passenger type','passengerRelation','self',{choices:[['self','Me'],['family','Family member'],['senior','Senior citizen'],['child','Child'],['other','Other']]})}
            ${opField('Emergency contact','emergencyContact','',{type:'tel',maxlength:30,optional:true})}${opField('Extra boarding time (minutes)','extraBoardingMinutes',0,{type:'number',min:0,max:120,optional:true})}${opField('Accessibility / companion notes','accessibilityNotes','',{type:'textarea',maxlength:1000,optional:true})}
            <label class="check-label ops-full"><input type="checkbox" name="consentShareDetails" value="true"> I consent to sharing passenger details with the assigned driver.</label>
            <div class="ops-full return-toggle"><label><input type="checkbox" name="roundTrip" value="true" onchange="toggleCabReturn(this.checked)"> Add a return trip</label></div><div id="cab-return-fields" class="ops-full" hidden>${opField('Return date','returnDate','',{type:'date',min:indiaDate()})}${opField('Return time','returnTime','',{type:'time'})}</div>
            ${opField('Confirmed hotel booking reference','hotelBookingReference','',{maxlength:40,optional:true})}${opField('Hotel cab direction','hotelDirection','to_hotel',{choices:[['to_hotel','Book cab to hotel'],['from_hotel','Book cab from hotel']],optional:true})}
            ${opField('Trip type','tripType',type,{choices:config.tripTypes})}<div class="ops-full vehicle-grid" role="group" aria-label="Vehicle categories">${config.categories.map((c,i)=>{const v=config.vehicleOptions?.[c]||{};return `<button type="button" class="vehicle-card ${i===0?'selected':''}" data-category="${oe(c)}" onclick="selectCabVehicle(this)"><strong>${oe(c)}</strong><span>${v.passengers||'—'} passengers · ${v.luggage||'—'} bags</span><small>${v.ac?'AC':'Non-AC'}${v.accessibility?' · accessibility-ready':''}</small><em>Select</em></button>`}).join('')}</div><input type="hidden" name="category" value="${oe(config.categories[0])}">
            ${opField('Contact name','name','',{maxlength:120})}${opField('Email','email','',{type:'email'})}${opField('Phone','phone','',{type:'tel',maxlength:30})}
            ${opField('Additional notes','notes','',{type:'textarea',maxlength:2400,optional:true})}
            <div class="ops-full fare-preview" id="cab-fare-preview" aria-live="polite"><span class="notice">Select a vehicle and valid map coordinates for a backend fare quote.</span></div>
            <p class="notice ops-full" role="status"></p><button class="btn outline" type="button" onclick="estimateCabFare(this.form)">Estimate fare</button> <button class="btn" type="submit">Request verified ride</button>
        </form>`)}
        <aside class="panel booking-panel"><h2>Route preview</h2><div class="transport-map" role="img" aria-label="Route preview map"><span>Map provider unavailable</span><small>Configure an approved Google Maps provider to enable autocomplete, markers and route lines. No route or driver availability is simulated.</small></div><p>Verified transport partners receive requests after review. Assignment and vehicle checks happen on the server.</p><a class="btn outline" href="#/cab-partner">Cab partner portal</a></aside></div>`;
}
function toggleCabSchedule(show){const el=document.getElementById('cab-schedule-fields');if(el)el.hidden=!show}
function toggleCabReturn(show){const el=document.getElementById('cab-return-fields');if(el)el.hidden=!show}
function toggleCabEasy(show){const f=document.getElementById('cab-booking-form');if(f)f.classList.toggle('cab-easy-mode',show)}
function selectCabVehicle(button){const form=button.closest('form');form.querySelectorAll('.vehicle-card').forEach(x=>x.classList.remove('selected'));button.classList.add('selected');form.elements.category.value=button.dataset.category;const preview=form.querySelector('#cab-fare-preview');if(preview)preview.innerHTML='<span class="notice">Vehicle selected. Add map coordinates to calculate the backend fare.</span>'}
function swapCabLocations(){const f=document.getElementById('cab-booking-form');if(!f)return;const a=f.elements.pickup.value;f.elements.pickup.value=f.elements.dropoff.value;f.elements.dropoff.value=a;['Lat','Lon'].forEach(s=>{const x=f.elements['pickup'+s].value;f.elements['pickup'+s].value=f.elements['dropoff'+s].value;f.elements['dropoff'+s].value=x})}
function addCabStop(){const root=document.getElementById('cab-stops');if(!root)return;const n=root.querySelectorAll('input').length+1;if(n>3)return;root.insertAdjacentHTML('beforeend',`<label class="field ops-full">Stop ${n}<input class="input" name="stop${n}" maxlength="180" placeholder="Intermediate stop"></label>`)}
function setCabLocation(kind){const f=document.getElementById('cab-booking-form');if(f)f.elements.pickup.value=kind==='Home'?'Home':kind==='Hotel'?'Your hotel':'Recent location'}
function useCabLocation(){if(!navigator.geolocation){toast('Location permission is unavailable. Enter pickup manually.');return}navigator.geolocation.getCurrentPosition(p=>{const f=document.getElementById('cab-booking-form');if(f){f.elements.pickup.value='Current location';f.elements.pickupLat.value=p.coords.latitude;f.elements.pickupLon.value=p.coords.longitude}},()=>toast('Location permission was not granted. Enter pickup manually.'),{enableHighAccuracy:true,timeout:8000})}
async function submitTransport(event){
    event.preventDefault();
    const form=event.target,button=form.querySelector('button'),message=form.querySelector('[role=status]');
    button.disabled=true;
    try{
        if(form.elements.bookingMode?.value==='now'){const d=new Date(Date.now()+20*60000),pad=n=>String(n).padStart(2,'0');form.elements.date.value=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;form.elements.time.value=`${pad(d.getHours())}:${pad(d.getMinutes())}`}
        const payload=Object.fromEntries(new FormData(form));payload.notes=[payload.notes,...[...form.querySelectorAll('[name^="stop"]')].map(x=>'Stop: '+x.value).filter(Boolean)].filter(Boolean).join(' | ');
        const result=await opsApi('transport',payload);
        if(form.isConnected)go('/cab-trip/'+result.token);
    }catch(error){if(form.isConnected)message.textContent=error.message}
    finally{if(button.isConnected)button.disabled=false}
}
async function estimateCabFare(form){
    const target=form.querySelector('#cab-fare-preview');
    try{target.innerHTML='<span class="notice">Calculating fare…</span>';const result=await opsApi('transport/fare',Object.fromEntries(new FormData(form)));target.innerHTML=`<div class="fare-breakdown"><strong>Estimated total ${opMoney(result.totalMinor)}</strong><span>${result.distanceKm} km · ${result.durationMin} min</span><small>Base ${opMoney(result.baseMinor)} · Distance ${opMoney(result.distanceMinor)} · Time ${opMoney(result.durationMinor)} · Tax ${opMoney(result.taxMinor)}</small></div>`}catch(error){target.innerHTML='<span class="notice error">'+oe(error.message)+'</span>'}
}
async function loadTransportStatus(root,token){
    const trip=await opsApi('transport/status',{token});
    if(!root.isConnected)return;
    const stages={requested:'Awaiting assignment',assigned:'Awaiting partner acceptance',accepted:'Trip confirmed',completed:'Trip completed',cancelled:'Trip cancelled'};
    root.innerHTML=serviceHead('Trip enquiry status')+opSection(oe(trip.code)+' '+opStatus(stages[trip.state]),`
        <p><strong>Pickup</strong> ${oe(trip.pickup)}</p><p><strong>Drop-off</strong> ${oe(trip.dropoff)}</p>
        <p>${oe(trip.departure.slice(0,16))} IST &middot; ${trip.passengers} passenger(s) &middot; ${oe(trip.category)} &middot; ${oe(trip.trip_type)}</p>
        ${trip.fare&&['accepted','completed'].includes(trip.state)?`<p>Agreed fare <strong>${opMoney(trip.fare)}</strong>. Arrange payment with the partner.</p>`:''}
        ${trip.partner?`<p>Assigned to ${oe(trip.partner)} &middot; ${oe(trip.vehicle)} &middot; <a class="text-link" href="tel:${oe(trip.partner_phone.replace(/[^+\d]/g,''))}">${oe(trip.partner_phone)}</a></p>`:''}
        <p class="notice">Save this private link to check your trip status later.</p>
        <div class="ops-filter"><label>Private trip link<input class="input" value="${oe(location.href)}" readonly></label>
            <button class="btn outline small" onclick="copyBulkLink(this)">Copy status link</button>
            <button class="btn outline small" onclick="loadServicesPage()">Refresh status</button></div>`);
}
function filterVeg(event){
    event.preventDefault();
    const data=new FormData(event.target),params=new URLSearchParams();
    for(const [key,value] of data)if(value)params.set(key,value);
    go('/restaurants'+(params.size?'?'+params:''));
}
async function loadVeg(root){
    const params=new URLSearchParams(location.hash.split('?')[1]);
    const hotel=/^\d+$/.test(params.get('hotel')||'')?params.get('hotel'):'';
    const offset=/^\d+$/.test(params.get('offset')||'')?Number(params.get('offset')):0;
    params.set('offset',offset);
    params.set('limit',12);
    const rows=await opsApi('veg?'+params);
    if(!root.isConnected)return;
    const navigation=next=>{
        const nextParams=new URLSearchParams(params);
        nextParams.delete('limit');
        nextParams.set('offset',next);
        return '#/restaurants?'+nextParams;
    };
    root.innerHTML=serviceHead('Pure veg restaurants','Browse verified pure veg dining around Nashik and Trimbakeshwar.')+
        `<form class="panel ops-filter" onsubmit="filterVeg(event)">
        ${hotel?`<input type="hidden" name="hotel" value="${hotel}">`:''}
        ${opField('Restaurant name or area','q',params.get('q'),{optional:true,maxlength:120})}
        ${opField('Minimum group capacity','capacity',params.get('capacity'),{optional:true,type:'number',min:1,max:5000})}
        <label><input type="checkbox" name="jain" value="1" ${params.get('jain')==='1'?'checked':''}> Jain food</label>
        <label><input type="checkbox" name="satvik" value="1" ${params.get('satvik')==='1'?'checked':''}> Satvik meals</label>
        <button class="btn small">Find restaurants</button></form>
        ${hotel?'<p class="notice">Showing restaurants with a recorded distance from this hotel. <a class="text-link" href="#/restaurants">Show all restaurants</a></p>':''}
        ${rows.length?`<div class="ops-public-list">${rows.map(r=>`<article class="panel ops-public-card">
            <span class="status">Verified pure veg</span><h2>${oe(r.name)}</h2><p>${oe(r.location)}<br>${oe(r.address)}</p>
            <p>${oe(r.opening_hours)}</p>${r.hotel_distance!=null?`<p>${r.hotel_distance} km from your selected hotel</p>`:''}<p>Group seating for up to ${r.dining_capacity}${r.jain?' &middot; Jain food':''}${r.satvik?' &middot; Satvik meals':''}</p>
            <a class="btn outline small" href="${sitePath('/restaurants/'+r.id,activeLocale)}">View restaurant</a></article>`).join('')}</div>`:
            '<div class="empty"><h2>No verified restaurants match this search</h2><p>Try a different area or clear the filters.</p><a class="text-link" href="#/restaurants">Clear filters</a></div>'}
            <div class="ops-pager">${offset?`<a class="btn outline small" href="${oe(navigation(Math.max(0,offset-12)))}">Previous</a>`:''}
            ${rows.length===12?`<a class="btn outline small" href="${oe(navigation(offset+12))}">Next</a>`:''}</div>`;
}
async function loadVegDetail(root,id){
    if(!/^\d+$/.test(id||''))throw new Error('Restaurant not found.');
    const restaurant=await opsApi('veg/'+id);
    if(!root.isConnected)return;
    updatePublicRecord('restaurant',restaurant);
    const map=encodeURIComponent(restaurant.latitude+','+restaurant.longitude),phone=restaurant.phone.replace(/[^+\d]/g,'');
    root.innerHTML=serviceHead(oe(restaurant.name))+`<div class="detail-layout live-booking-layout"><section class="panel">
      <span class="status">Verified pure veg</span><p>${oe(restaurant.description||'')}</p>
      <address>${oe(restaurant.address)} &middot; ${oe(restaurant.location)}</address>
      <p><strong>Opening hours</strong> ${oe(restaurant.opening_hours)}</p>
      <p>Group seating for up to ${restaurant.dining_capacity}</p>
      <p>Jain food ${restaurant.jain?'available':'not listed'} &middot; Satvik meals ${restaurant.satvik?'available':'not listed'}</p>
      <a class="text-link" href="tel:${oe(phone)}">${oe(restaurant.phone)}</a>
      ${restaurant.email?` &middot; <a class="text-link" href="mailto:${oe(encodeURIComponent(restaurant.email))}">${oe(restaurant.email)}</a>`:''}
      <h2 class="mt">Recorded distances</h2>
      ${opTable(['Hotel or landmark','Distance'],restaurant.distances.map(d=>[oe(d.hotel||d.landmark),d.distance+' km']))}</section>
      <aside class="panel booking-panel"><h2>Location</h2>
       <a class="text-link" href="https://maps.google.com/?q=${map}" target="_blank" rel="noopener noreferrer">Open map &nearr;</a>
       <iframe class="booking-map" title="Map of ${oe(restaurant.name)}" loading="lazy" src="https://maps.google.com/maps?output=embed&amp;q=${map}"></iframe></aside></div>`;
}
async function loadServicesPage(){
    const root=document.getElementById('services-root');
    if(!root)return;
    const [route,id]=location.hash.slice(2).split('?')[0].split('/');
    try{
        if(route==='cabs')await loadTransport(root);
        if(route==='cab-trip')await loadTransportStatus(root,id);
        if(route==='restaurants')await loadVeg(root);
        if(route==='restaurant')await loadVegDetail(root,id);
    }catch(error){if(root.isConnected)root.innerHTML=`<div class="empty"><h1>${oe(error.message)}</h1><a class="text-link" href="#/">Back to home</a></div>`}
}
function cabProfile(profile){
    return opSection('Business and service areas',`<p>Verification ${opStatus(profile.state)}</p>`+
        opForm('cab/profile',opField('Business name','businessName',profile.business_name,{maxlength:160})+
        opField('Business email','businessEmail',profile.business_email,{type:'email'})+
        opField('Business phone','businessPhone',profile.business_phone,{type:'tel',maxlength:30})+
        opField('Service areas','serviceAreas',profile.service_areas,{type:'textarea',maxlength:1000}),'Save service areas'));
}
function editCabResource(kind,index){
    const row=serviceFleet[kind][index]||{},vehicle=kind==='vehicles';
    const fields=opField(vehicle?'Vehicle name':'Driver name','name',row.name,{maxlength:120})+(vehicle?
        opField('Registration','registration',row.registration,{maxlength:30})+opField('Vehicle category','category',row.category||serviceCategories[0],{choices:serviceCategories})+
        opField('Passenger seats','seats',row.seats||4,{type:'number',min:1,max:65}):
        opField('Driver phone','phone',row.phone,{type:'tel',maxlength:30}))+serviceCheckbox('Active','active',row.id?Boolean(row.active):true);
    operationsPane.innerHTML=opButton('Back to fleet','showOperationsSection()')+opSection(vehicle?'Vehicle details':'Driver details',
        opForm('cab/'+kind+(row.id?'/'+row.id:''),fields,'Save details'));
}
function cabFleet(fleet){
    serviceFleet=fleet;
    return opSection('Vehicles',opButton('Add vehicle',"editCabResource('vehicles',-1)")+
        opTable(['Vehicle','Registration','Category','Seats','Status',''],fleet.vehicles.map((v,i)=>[oe(v.name),oe(v.registration),oe(v.category),v.seats,opStatus(v.active?'Active':'Inactive'),
        opButton('Edit',`editCabResource('vehicles',${i})`)])))+
        opSection('Drivers',opButton('Add driver',"editCabResource('drivers',-1)")+
        opTable(['Driver','Contact','Status',''],fleet.drivers.map((d,i)=>[oe(d.name),oe(d.phone),opStatus(d.active?'Active':'Inactive'),opButton('Edit',`editCabResource('drivers',${i})`)])));
}
function cabDocuments(fleet,admin=false){
    const rows=fleet.docs.map(d=>[oe(d.kind),`<a class="text-link" href="/api/operations/cab/documents/${d.id}">${oe(d.filename)}</a>`,
        oe(d.expires||'None'),opStatus(d.reviewed?'Reviewed':'Pending review'),
        admin?opButton(d.reviewed?'Undo review':'Mark reviewed',`reviewCabDoc(${fleet.partner.user_id},${d.id},${!d.reviewed})`):'']);
    return opSection('Private verification documents',
        '<p class="notice">An operator permit applies to the business. Attach registration and insurance to a vehicle, and a licence to a driver.</p>'+
        opTable(['Document','File','Expiry','Status',''],rows)+(admin?'':
        opForm('cab/documents',opField('Document type','kind','permit',{choices:[['permit','Operator permit'],['registration','Vehicle registration'],['insurance','Vehicle insurance'],['license','Driver licence']]})+
        opField('Vehicle','vehicleId','',{optional:true,choices:[['','None'],...fleet.vehicles.map(v=>[v.id,v.name+' ('+v.registration+')'])]})+
        opField('Driver','driverId','',{optional:true,choices:[['','None'],...fleet.drivers.map(d=>[d.id,d.name])]})+
        opField('Expiry date','expires','',{type:'date',optional:true})+
        '<label>PDF, JPG or PNG (up to 3 MB)<input class="input" type="file" name="file" accept="application/pdf,image/jpeg,image/png" required></label>','Upload document')));
}
async function reviewCabDoc(partner,id,reviewed){
    try{await opsApi('cab/documents/'+id,{reviewed});await openCabPartner(partner)}
    catch(error){toast(error.message)}
}
function cabTripFilter(showStatus){
    return `<form class="ops-filter" onsubmit="filterOperations(event)">${opField('Trip reference or location','q',operationsQuery,{optional:true,maxlength:120})}
        ${showStatus?opField('Trip status','status',operationsStatus,{optional:true,choices:[['','All statuses'],...tripStates]}):''}
        <button class="btn small">Filter</button></form>`;
}
function cabTripActions(row,index,admin){
    if(admin)return !['completed','cancelled'].includes(row.state)?opButton('Manage',`openCabTrip(${index})`):'';
    if(row.state==='assigned')return opButton('Accept',`updateCabTrip(${row.id},'accept')`)+opButton('Decline',`updateCabTrip(${row.id},'decline')`);
    if(row.state==='accepted')return opButton('Mark completed',`updateCabTrip(${row.id},'complete')`);
    return '';
}
function cabTripTable(rows,admin=false){
    serviceRows=rows;
    return cabTripFilter(admin||operationsSection==='trips')+opTable(['Trip','Pickup and drop-off','Passenger contact','Assignment','Fare','Status',''],rows.map((row,i)=>[
        oe(row.code)+'<br>'+oe(row.departure.slice(0,16))+' IST',oe(row.pickup)+' &rarr; '+oe(row.dropoff)+'<br>'+oe(row.trip_type)+' &middot; '+row.passengers+' passengers'+
            (row.notes?'<br>'+oe(row.notes):''),
        oe(row.guest_name)+'<br>'+oe(row.guest_email)+'<br>'+oe(row.guest_phone),
        [row.business_name,row.vehicle,row.driver].filter(Boolean).map(oe).join('<br>'),row.fare?opMoney(row.fare):'',
        opStatus(row.state),cabTripActions(row,i,admin)
    ]))+opsPager(rows);
}
async function updateCabTrip(id,action){
    try{await opsApi('cab/trips/'+id,{action});await showOperationsSection();toast('Trip status updated.')}
    catch(error){toast(error.message)}
}
async function openCabPartner(id){
    const pane=operationsPane,request=++operationsRequest;
    try{
        const fleet=await opsApi('cab/partners/'+id);
        if(!pane.isConnected||request!==operationsRequest)return;
        const p=fleet.partner;
        pane.innerHTML=opButton('Back to cab partners','showOperationsSection()')+
            opSection(oe(p.business_name),`<p>${oe(p.owner)} &middot; ${oe(p.business_email)} &middot; ${oe(p.business_phone)}</p>
                <p>Service areas ${oe(p.service_areas)}</p>`+opForm('cab/partners/'+id,opField('Verification status','state',p.state,{choices:['pending','verified','suspended']}),'Save partner status','cab-partner:'+id))+
            cabDocuments(fleet,true)+
            opSection('Fleet',opTable(['Vehicle','Registration','Category','Seats'],fleet.vehicles.map(v=>[oe(v.name),oe(v.registration),oe(v.category),v.seats])))+
            opSection('Drivers',opTable(['Name','Phone'],fleet.drivers.map(d=>[oe(d.name),oe(d.phone)])));
    }catch(error){if(pane.isConnected)toast(error.message)}
}
function adminCabPartners(rows){
    return opButton('Review transport enquiries','showAdminTrips()')+
      opTable(['Partner','Service areas','Contact','Verification',''],rows.map(p=>[oe(p.business_name),oe(p.service_areas),oe(p.business_email),opStatus(p.state),opButton('Review',`openCabPartner(${p.user_id})`)]));
}
function showAdminTrips(){
    go('/admin/cabs?trips=1');
}
async function openCabTrip(index,selected){
    const row=serviceRows[index];
    if(!row)return;
    const pane=operationsPane,request=++operationsRequest;
    try{
        const partners=(await opsApi('cab/partners')).filter(p=>p.state==='verified');
        const partner=selected||row.partner_id||partners[0]?.user_id;
        const fleet=partner?await opsApi('cab/partners/'+partner):null;
        if(!pane.isConnected||request!==operationsRequest)return;
        const vehicles=fleet?.vehicles.filter(v=>v.active&&v.category===row.category&&v.seats>=row.passengers)||[];
        const drivers=fleet?.drivers.filter(d=>d.active)||[];
        pane.innerHTML=opButton('Back to enquiries','showOperationsSection()')+
            opSection('Manage '+oe(row.code),`<p>${oe(row.pickup)} &rarr; ${oe(row.dropoff)} | ${oe(row.category)} | ${row.passengers} passengers</p>`+
                (['requested','assigned'].includes(row.state)?`<form class="ops-filter">${opField('Verified partner','partner',partner,{choices:partners.map(p=>[p.user_id,p.business_name+' - '+p.service_areas])})}
                    <button class="btn outline" type="button" onclick="openCabTrip(${index},Number(this.form.elements.partner.value))">Load partner fleet</button></form>`+
                    (vehicles.length&&drivers.length?opForm('cab/trips/'+row.id+'/assign',`<input type="hidden" name="partnerId" value="${partner}">`+
                    opField('Matching vehicle','vehicleId',row.vehicle_id,{choices:vehicles.map(v=>[v.id,v.name+' ('+v.registration+')'])})+
                    opField('Driver','driverId',row.driver_id,{choices:drivers.map(d=>[d.id,d.name])})+
                    opField('Estimated duration (minutes)','duration',row.duration||60,{type:'number',min:15,max:1440})+
                    opField('Fare in paise','fare',row.fare,{type:'number',min:1}),'Assign trip'):'<p class="notice">No active matching vehicle and driver are available for this partner.</p>'):'')+
                opButton('Cancel enquiry',`cancelCabEnquiry(${row.id})`));
    }catch(error){if(pane.isConnected)toast(error.message)}
}
async function cancelCabEnquiry(id){
    if(window.confirm('Cancel this transport enquiry?'))await updateCabTrip(id,'cancel');
}
function restaurantEditor(row={}){
    const route='restaurants'+(row.id?'/'+row.id:'');
    return opForm(route,
        opField('Restaurant name','name',row.name,{maxlength:160})+opField('Area','location',row.location,{maxlength:120})+
        opField('Full address','address',row.address,{maxlength:400})+
        opField('Latitude','latitude',row.latitude,{type:'number',min:-90,max:90,step:'any'})+
        opField('Longitude','longitude',row.longitude,{type:'number',min:-180,max:180,step:'any'})+
        opField('Opening hours','hours',row.opening_hours,{maxlength:400})+
        opField('Phone','phone',row.phone,{type:'tel',maxlength:30})+
        opField('Email','email',row.email,{type:'email',optional:true})+
        opField('Group dining capacity','capacity',row.dining_capacity??1,{type:'number',min:1,max:5000})+
        serviceCheckbox('Jain food available','jain',row.jain)+serviceCheckbox('Satvik meals available','satvik',row.satvik)+
        opField('Description','description',row.description,{type:'textarea',maxlength:2000,optional:true}),
        'Save restaurant draft','restaurant-save');
}
function restaurantState(row){
    const route='restaurants/'+row.id+'/state';
    if(row.state==='approved')return opForm(route,'<input type="hidden" name="action" value="withdraw">'+
        opField('Reason','note','',{maxlength:1000}),'Withdraw from directory','restaurant:'+row.id);
    return opForm(route,'<input type="hidden" name="action" value="approve">'+
        serviceCheckbox('I verified this restaurant serves pure veg food','verified',false,true)+
        opField('Verification notes','note','',{type:'textarea',maxlength:1000}),'Approve and publish','restaurant:'+row.id);
}
async function openRestaurantAdmin(id){
    const pane=operationsPane,request=++operationsRequest;
    if(!id){pane.innerHTML=opButton('Back to restaurants','showOperationsSection()')+opSection('Add restaurant',restaurantEditor());return}
    try{
        const [row,hotels]=await Promise.all([opsApi('restaurants/'+id),opsApi('restaurants/hotels')]);
        if(!pane.isConnected||request!==operationsRequest)return;
        pane.innerHTML=opButton('Back to restaurants','showOperationsSection()')+
            opSection(oe(row.name)+' '+opStatus(row.state),
                (row.state==='approved'?'<p class="notice">Saving edits returns this listing to draft for review.</p>':'')+restaurantEditor(row))+
            opSection('Publish listing',restaurantState(row))+
            opSection('Hotel and landmark distances',opTable(['Hotel or landmark','Distance',''],row.distances.map(d=>[
                oe(d.hotel||d.landmark),d.distance+' km',opButton('Remove',`removeRestaurantDistance(${id},${d.id})`)
            ]))+opForm('restaurants/'+id+'/distances',
                opField('Hotel','hotel','',{optional:true,choices:[['','None'],...hotels.map(h=>[h.id,h.name])]})+
                opField('Religious landmark','landmark','',{optional:true,maxlength:120})+
                opField('Distance (km)','km','',{type:'number',min:0,max:1000,step:'.01'}),'Save distance','restaurant:'+id))+
            opSection('Delete from directory',opForm('restaurants/'+id+'/state','<input type="hidden" name="action" value="delete">'+
                opField('Reason for deletion','note','',{maxlength:1000}),'Delete listing'));
    }catch(error){if(pane.isConnected)toast(error.message)}
}
async function removeRestaurantDistance(id,removeId){
    try{await opsApi('restaurants/'+id+'/distances',{removeId});await openRestaurantAdmin(id)}
    catch(error){toast(error.message)}
}
function adminRestaurants(rows){
    return opsFilter()+opButton('Add restaurant','openRestaurantAdmin(0)')+
        opTable(['Name','Area','Group capacity','Status',''],rows.map(r=>[oe(r.name),oe(r.location),r.dining_capacity,opStatus(r.state),opButton('Open',`openRestaurantAdmin(${r.id})`)]))+opsPager(rows);
}
async function completeServiceForm(action,result){
    if(action==='restaurant-save'){await openRestaurantAdmin(result.id);return true}
    if(action.startsWith('restaurant:')){await openRestaurantAdmin(Number(action.split(':')[1]));return true}
    if(action.startsWith('cab-partner:')){await openCabPartner(Number(action.split(':')[1]));return true}
    return false;
}
function serviceOperations(section,params){
    if(operationsCab){
        if(section==='profile')return ['cab/profile',cabProfile];
        if(section==='fleet')return ['cab/fleet',cabFleet];
        if(section==='verification')return ['cab/fleet',rows=>cabDocuments(rows)];
        if(section==='cab-earnings')return ['cab/earnings',data=>`<div class="ops-metrics">
            <div class="panel"><strong>${data.trips}</strong><span>Completed trips</span></div>
            <div class="panel"><strong>${opMoney(data.earnings)}</strong><span>Completed trip fares</span></div></div>
            <p class="notice mt">Fares reflect completed trips recorded here. Payments are arranged with customers.</p>`];
        if(section==='requests')params.set('status','assigned');
        return ['cab/trips?'+params,rows=>cabTripTable(rows)];
    }
    if(!operationsHost&&section.startsWith('transport-')){
        if(section==='transport-overview')return ['cab-admin',transportAdminOverview];
        if(section==='transport-drivers'||section==='transport-verification')return ['cab-admin/drivers?'+params,transportAdminDrivers];
        if(section==='transport-rides'||section==='transport-live'||section==='transport-scheduled')return ['cab-admin/rides?'+params,transportAdminRides];
        if(section==='transport-fares')return ['cab-admin/fare-rules',transportAdminFares];
        return ['cab-admin/rides?'+params,transportAdminUnavailable];
    }
    if(!operationsHost&&section==='cabs'){
        const showTrips=new URLSearchParams(location.hash.split('?')[1]).get('trips')==='1';
        return showTrips?['cab/trips?'+params,rows=>'<a class="btn outline small" href="#/admin/cabs">Cab partners</a>'+cabTripTable(rows,true)]:
            ['cab/partners',adminCabPartners];
    }
    if(!operationsHost&&section==='restaurants')return ['restaurants?'+params,adminRestaurants];
    return null;
}
function transportAdminOverview(data){return `<div class="ops-metrics">${[['Total rides',data.total],['Active rides',data.active],['Pending requests',data.pending],['Completed rides',data.completed],['Cancelled rides',data.cancelled],['Online verified drivers',data.onlineDrivers],['Gross booking value',opMoney(data.gross)]].map(x=>`<div class="panel"><strong>${x[1]||0}</strong><span>${x[0]}</span></div>`).join('')}</div><p class="notice">All metrics are calculated from persisted cab records. No demo activity is included.</p>`}
function transportAdminDrivers(rows){return opsFilter()+opTable(['Driver','Phone','Verification','Online','Last location','Vehicle'],rows.map(x=>[oe(x.name),oe(x.phone),opStatus(x.verification_state),x.online?'Online':'Offline',oe(x.last_location_at||'Never'),oe(x.registration||'—')]))+opsPager(rows)}
function transportAdminRides(rows){return opsFilter(true)+opTable(['Ride','Route','Departure','Category','Passengers','Driver','Fare','Status'],rows.map(x=>[oe(x.code),oe(x.pickup)+' → '+oe(x.dropoff),oe(x.departure),oe(x.category),x.passengers,x.driver_id||'Unassigned',x.fare?opMoney(x.fare):'—',opStatus(x.state)]))+opsPager(rows)}
function transportAdminFares(rows){return opTable(['Category','Base','Per km','Per minute','Tax','Commission','Active'],rows.map(x=>[oe(x.category),opMoney(x.base_minor),opMoney(x.per_km_minor),opMoney(x.per_minute_minor),(x.tax_bps/100)+'%',(x.commission_bps/100)+'%',x.active?'Yes':'No']))}
function transportAdminUnavailable(){return '<p class="notice">This transport module has no persisted records or API workflow configured yet. It is intentionally not populated with sample activity.</p>'}
const servicesRenderBase=render;
render=function(){
    servicesRenderBase();
    loadServicesPage();
};
