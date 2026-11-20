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
        ${opSection('Request a trip',`<form class="ops-form" onsubmit="submitTransport(event)">
            ${opField('Trip type','tripType',type,{choices:config.tripTypes})}
            ${opField('Vehicle category','category',config.categories[0],{choices:config.categories})}
            ${opField('Pickup location','pickup',pickup,{maxlength:180,placeholder:'Nashik Railway Station'})}${opField('Drop-off location','dropoff','',{maxlength:180,placeholder:'Trimbakeshwar Temple'})}
            <p class="notice ops-full">For a live fare, choose coordinates through the configured map provider. This local build accepts coordinates for secure server calculation.</p>
            ${opField('Pickup latitude','pickupLat','',{type:'number',step:'any',min:-90,max:90,optional:true})}${opField('Pickup longitude','pickupLon','',{type:'number',step:'any',min:-180,max:180,optional:true})}
            ${opField('Drop latitude','dropoffLat','',{type:'number',step:'any',min:-90,max:90,optional:true})}${opField('Drop longitude','dropoffLon','',{type:'number',step:'any',min:-180,max:180,optional:true})}
            <div class="ops-full fare-preview" id="cab-fare-preview" aria-live="polite"><span class="notice">Fare is calculated on the backend after coordinates are supplied.</span></div>
            ${opField('Pickup date','date','',{type:'date',min:indiaDate()})}${opField('Pickup time (IST)','time','',{type:'time'})}
            ${opField('Passengers','passengers',1,{type:'number',min:1,max:65})}${opField('Contact name','name','',{maxlength:120})}
            ${opField('Email','email','',{type:'email'})}${opField('Phone','phone','',{type:'tel',maxlength:30})}
            ${opField('Flight or train number, group needs, or other notes','notes','',{type:'textarea',maxlength:2400,optional:true})}
            <p class="notice ops-full" role="status"></p><button class="btn outline" type="button" onclick="estimateCabFare(this.form)">Estimate fare</button> <button class="btn" type="submit">Request verified ride</button>
        </form>`)}
        <aside class="panel booking-panel"><h2>Ride map & assignment</h2>
          <div class="transport-map" role="img" aria-label="Map preview"><span>Map preview</span><small>Configure an approved map provider for production geocoding and route display.</small></div>
          <p>We review the enquiry and assign a local transport partner. The partner confirms the trip. Save the private status link to follow the assignment and see the fare.</p>
          <a class="btn outline" href="#/cab-partner">Cab partner portal</a>
        </aside></div>`;
}
async function submitTransport(event){
    event.preventDefault();
    const form=event.target,button=form.querySelector('button'),message=form.querySelector('[role=status]');
    button.disabled=true;
    try{
        const result=await opsApi('transport',Object.fromEntries(new FormData(form)));
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
    if(!operationsHost&&section==='cabs'){
        const showTrips=new URLSearchParams(location.hash.split('?')[1]).get('trips')==='1';
        return showTrips?['cab/trips?'+params,rows=>'<a class="btn outline small" href="#/admin/cabs">Cab partners</a>'+cabTripTable(rows,true)]:
            ['cab/partners',adminCabPartners];
    }
    if(!operationsHost&&section==='restaurants')return ['restaurants?'+params,adminRestaurants];
    return null;
}
const servicesRenderBase=render;
render=function(){
    servicesRenderBase();
    loadServicesPage();
};
