const bulkGroupTypes=['Religious group','Tour operator','Travel agency','Pilgrimage organizer','Family group','Corporate or institutional group'];
const bulkFoodChoices=['Pure Veg','Jain','Satvik'];
let bulkOptions=[];
let bulkAcceptKey;
function bulkLanding(root){
    const listed=new URLSearchParams(location.hash.split('?')[1]).get('listing');
    const listing=/^\d+$/.test(listed||'')?Number(listed):null;
    const areaChoices=['All destinations','Nashik',...locations];
    root.innerHTML=`<div class="page-head">
        <div class="breadcrumb"><a href="#/">Home</a> / Bulk stays</div>
        <span class="eyebrow">Group accommodation</span><h1 class="serif">Plan your group's Kumbh stay</h1>
        <p>Tell us what your group needs. We'll look for available accommodation and prepare a quote for you to review.</p></div>
        <div class="detail-layout live-booking-layout">
            <section class="panel"><h2>Group stay enquiry</h2>
                <p id="bulk-preferred-property" class="notice">${listing?'This enquiry is for your selected property.':''}</p>
                <form class="ops-form" onsubmit="submitBulkStay(event)">
                    <input type="hidden" name="listingId" value="${listing||''}">
                    ${opField('Group type','groupType',bulkGroupTypes[0],{choices:bulkGroupTypes})}
                    ${opField('Exact number of guests','guests',10,{type:'number',min:10,max:5000})}
                    <div class="ops-full stay-filter-chips" aria-label="Common group sizes">
                        ${[10,25,50,100,500].map(size=>`<button type="button" onclick="this.form.elements.guests.value=${size};this.form.elements.guests.focus()">${size===500?'500+':size}</button>`).join('')}
                    </div>
                    ${opField('Check-in','checkin','',{type:'date',min:indiaDate()})}
                    ${opField('Check-out','checkout','',{type:'date',min:indiaDate()})}
                    ${opField('Preferred destination','destination','All destinations',{choices:areaChoices})}
                    ${opField('Budget per person for the stay (INR)','budget','',{type:'number',min:1,optional:true})}
                    ${opField('Accommodation request','unitType','rooms',{choices:[['rooms','Rooms'],['beds','Beds']]})}
                    ${opField('Rooms or beds needed','units','',{type:'number',min:1,max:5000,optional:true})}
                    ${opField('Accommodation preferences, such as separate rooms for men and women','occupancy','',{maxlength:300,optional:true})}
                    <fieldset class="ops-full"><legend>Meals</legend><div class="ops-permissions">${bulkFoodChoices.map(food=>`<label class="ops-check"><input type="checkbox" name="food" value="${food}"> ${food}</label>`).join('')}</div></fieldset>
                    <label class="ops-check ops-full"><input type="checkbox" name="transport"> Include a transportation request</label>
                    ${opField('Accessibility requirements','accessibility','',{type:'textarea',maxlength:1000,optional:true})}
                    ${opField('Contact name','name','',{maxlength:120})}
                    ${opField('Email','email','',{type:'email',maxlength:254})}
                    ${opField('Phone','phone','',{type:'tel',maxlength:30})}
                    ${opField('Additional notes','notes','',{type:'textarea',maxlength:3000,optional:true})}
                    <p role="status" class="notice ops-full"></p><button type="submit" class="btn">Send enquiry</button>
                </form>
            </section>
            <aside class="panel booking-panel">
                <h2>How group booking works</h2><ol class="booking-landmarks">
                    <li>Send your group size, dates, and preferences.</li><li>Review the private quotation with the accommodation, price, and terms.</li>
                    <li>Accept the quote and pay through secure checkout. Your reservation confirms after payment is verified.</li></ol>
            </aside>
        </div>`;
    if(listing)reservationApi('properties/'+listing).then(value=>{
        if(root.isConnected)root.querySelector('#bulk-preferred-property').textContent='Preferred property: '+value.name;
    }).catch(()=>{});
}
async function submitBulkStay(event){
    event.preventDefault();
    const form=event.target;
    const fields=new FormData(form);
    const body=Object.fromEntries(fields);
    body.food=fields.getAll('food');
    body.transport=fields.has('transport');
    const button=form.querySelector('button[type=submit]');
    const status=form.querySelector('[role=status]');
    button.disabled=true;
    try{
        const result=await opsApi('group',body);
        if(!form.isConnected)return;
        form.outerHTML=`<div class="panel" role="status"><strong>Enquiry received</strong>
            <p>Your enquiry reference is ${result.id}. Keep it for follow-up. A quote can be shared once a suitable stay is available.</p></div>`;
    }catch(error){if(form.isConnected)status.textContent=error.message}
    finally{if(button.isConnected)button.disabled=false}
}
function bulkTerms(quote){
    return quote.refundBps?`${quote.refundBps/100}% refundable until ${bookingDateTime(quote.cancelUntil)} under the property's policy.`:
        'Customer cancellation is non-refundable under the quoted property policy.';
}
async function showBulkPublicQuote(root,token){
    try{
        await reservationApi('reservations/session');
        const data=await opsApi('group/quote',{token});
        if(!root.isConnected)return;
        const q=data.quote;
        const status=data.status==='booked'?'Booking confirmed':data.status==='payment pending'?'Payment pending':data.status==='offered'?'Ready to review':data.status;
        root.innerHTML=`<div class="page-head"><h1 class="serif">Group stay quotation</h1><p>${opStatus(status)}</p></div>
            <div class="panel booking-reservation">
                <h2>${oe(data.property)}</h2><p>${oe(data.room)} &middot; ${q.rooms} rooms or units &middot; ${q.guests} guests</p>
                <p>${q.checkin} to ${q.checkout} &middot; Valid until ${bookingDateTime(data.expiry)}</p>
                ${bookedPrice(q)}<p>Approximately ${opMoney(Math.round(q.total/q.guests))} per guest for the stay.</p>
                <p>${oe(bulkTerms(q))}</p><p class="ops-preline">${oe(data.terms)}</p>
                ${data.reference?`<a class="btn" href="#/reservation/${oe(data.reference)}">${data.status==='booked'?'View confirmation':'Open reservation'}</a>`:''}
                ${data.status==='offered'?(data.paymentConfigured?`<form class="ops-form" onsubmit="acceptBulkQuote(event)">
                    <label class="ops-check ops-full"><input type="checkbox" name="accept" required> I accept the accommodation, cancellation terms, and full payment shown above.</label>
                    <p class="notice ops-full" role="status"></p><button type="submit" class="btn">Accept and continue to payment</button></form>`:
                    '<p class="notice">Online payments are unavailable at the moment.</p>'):''}
            </div>`;
    }catch(error){if(root.isConnected)root.textContent=error.message}
}
async function acceptBulkQuote(event){
    event.preventDefault();
    const form=event.target;
    const token=location.hash.split('/')[2];
    const button=form.querySelector('button');
    button.disabled=true;
    try{
        const response=await fetch('/api/operations/group/accept',{method:'POST',
            headers:{'Content-Type':'application/json','Idempotency-Key':bulkAcceptKey||=crypto.randomUUID()},
            body:JSON.stringify({token,acceptedTerms:form.elements.accept.checked})});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error);
        if(form.isConnected)go('/reservation/'+data.reference);
    }catch(error){if(form.isConnected)form.querySelector('[role=status]').textContent=error.message}
    finally{if(button.isConnected)button.disabled=false}
}
async function openBulkEnquiry(id,token=''){
    const pane=operationsPane,request=++operationsRequest;
    pane.textContent='Loading group enquiry...';
    try{
        const [info,options]=await Promise.all([opsApi('bulk/'+id),opsApi('bulk/'+id+'/matches')]);
        if(!pane.isConnected||request!==operationsRequest)return;
        bulkOptions=options;
        const q=info.enquiry;
        const assignment=!operationsHost?opSection('Enquiry assignment',
            opForm('bulk/'+id+'/assign',opField('Assigned staff member','assignee',q.assigned_to??'',{optional:true,choices:[['','Unassigned'],...info.staff.map(s=>[s.id,s.name])]})+
                opField('Assign hotel property ID','listingId',q.listing_id??'',{type:'number',min:1,optional:true})+
                opField('Workflow status','state',q.state,{choices:['open','in progress','closed']}),'Save assignment','bulk:'+id)):'';
        const shared=token?opSection('Share the private quote',`<p>Copy the link before leaving this page. Anyone with the link can view and accept this quotation.</p>
            <input class="input" aria-label="Private quote link" readonly value="${oe(location.origin+location.pathname+'#/group-quote/'+token)}">
            <button class="btn outline small" type="button" onclick="copyBulkLink(this)">Copy private link</button>`):'';
        const detail=`<p>${oe(q.contact_name)} &middot; ${oe(q.email)} &middot; ${oe(q.contact_phone)}</p>
            <p>${q.guests} guests &middot; ${q.checkin} to ${q.checkout} &middot; ${oe(q.destination)}</p>
            <p>${q.units?`${q.units} ${oe(q.unit_type)} requested &middot; `:''}${q.budget_minor?'Budget '+opMoney(q.budget_minor)+' per guest':'Budget unspecified'}</p>
            <p>Meals ${oe(q.food.join(', ')||'unspecified')} &middot; Transport ${q.transport?'requested':'unspecified'}</p>
            ${q.occupancy?`<p>Room allocation ${oe(q.occupancy)}</p>`:''}
            ${q.accessibility?`<p>Accessibility ${oe(q.accessibility)}</p>`:''}
            ${q.details?`<p class="ops-preline">${oe(q.details)}</p>`:''}
            <p>${opStatus(q.state)} ${oe(q.assignee||'')}</p>`;
        const matches=opTable(['Property','Room category','Units required','Available every night','Estimated per guest',''],options.map((option,i)=>[
            oe(option.name)+' <small>#'+option.id+'</small><br>'+oe(option.location),oe(option.room),option.rooms,option.remaining,
            opMoney(option.estimate_per_person)+(q.budget_minor&&option.estimate_per_person>q.budget_minor?' &middot; Above budget':''),
            q.state==='closed'?'':opButton('Prepare quote',`editBulkQuote(${id},${i})`)
        ]));
        pane.innerHTML=opButton('Back to enquiries','showOperationsSection()')+shared+opSection(oe(q.title)+' #'+id,detail)+assignment+
            opSection('Matching properties',`<p class="notice">Matches cover the requested nights and guest count. Confirm room allocations, individual beds, meals, transport, and accessibility with the property before quoting.</p>${matches}`)+
            opSection('Quotations',opTable(['Quote','Property','Units','Total','Status','Reservation'],info.quotes.map(item=>[
                item.id,oe(item.property),item.rooms,opMoney(item.price_snapshot.total),opStatus(item.status),oe(item.reference||'')
            ])))+
            opSection('Contact customer',opForm('bulk/'+id+'/contact',opField('Email message','message','',{type:'textarea',maxlength:2500}),'Queue email','bulk:'+id));
    }catch(error){if(pane.isConnected&&request===operationsRequest)pane.textContent=error.message}
}
async function copyBulkLink(button){
    const field=button.parentElement.querySelector('input');
    try{await navigator.clipboard.writeText(field.value);toast('Private link copied.')}
    catch{field.focus();field.select()}
}
function editBulkQuote(id,index){
    const item=bulkOptions[index];
    if(!item)return;
    operationsPane.innerHTML=opButton('Back to enquiry',`openBulkEnquiry(${id})`)+opSection('Prepare quote for '+oe(item.name),
        `<p>${oe(item.room)}. Prices and taxes come from the reservation calendar.</p>`+
        opForm('bulk/'+id+'/quote',`<input type="hidden" name="roomId" value="${item.room_id}"><input type="hidden" name="listingId" value="${item.id}">`+
            opField('Rooms or units','rooms',item.rooms,{type:'number',min:item.rooms,max:item.remaining})+
            opField('Quote validity (hours)','hours',24,{type:'number',min:1,max:168})+
            opField('Agreed arrangements and terms','terms','',{type:'textarea',maxlength:3000,optional:true}),'Generate quote','bulk-quote:'+id));
}
const bulkRenderBase=render;
render=function(){
    bulkRenderBase();
    const root=document.getElementById('bulk-root');
    if(!root)return;
    const route=location.hash.split(/[/?]/)[1];
    if(route==='group-stays')bulkLanding(root);
    if(route==='group-quote'){bulkAcceptKey=null;showBulkPublicQuote(root,location.hash.split('/')[2]||'')}
};
