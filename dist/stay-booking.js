const bookingMoney=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(value/100);
let propertyRecord;
let bookingQuote;
let holdRequestKey;
let checkoutRequest;
let reservationTimer;

async function reservationApi(path,options={}){
    const response=await fetch('/api/'+path,{
        ...options,headers:{...options.headers,...(options.method==='POST'?{'Content-Type':'application/json'}:{})}
    });
    const data=await response.json();
    if(!response.ok){
        const error=new Error(data.error||'The reservation request could not be completed.');
        error.status=response.status;
        throw error;
    }
    return data;
}
const indiaDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const bookingDateTime=value=>new Date(value).toLocaleString(activeLocale+'-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})+' IST';
function browseStayLink(){
    const params=new URLSearchParams(location.hash.split('?')[1]);
    let checkin=params.get('checkin');
    let checkout=params.get('checkout');
    if(!validSearchDate(checkin)||checkin<indiaDate()) checkin=state.checkin>=indiaDate()?state.checkin:indiaDate();
    if(!validSearchDate(checkout)||checkout<=checkin) checkout=new Date(Date.parse(checkin)+86400000).toISOString().slice(0,10);
    return {checkin,checkout,rooms:Math.max(1,Math.min(30,Number(params.get('rooms'))||state.rooms)),guests:Math.max(1,Math.min(120,Number(params.get('guests'))||state.guests))};
}
function bookingImage(url,alt){
    return url?`<img src="${escapeHtml(photo(url))}" alt="${escapeHtml(alt)}" loading="lazy">`:'';
}
function photoGallery(images,name){
    if(!images.length)return '';
    return `<div class="booking-gallery">${images.map((url,index)=>`<button type="button" onclick="viewBookingPhoto(this)" aria-label="View ${escapeHtml(name)} photo ${index+1}">${bookingImage(url,name)}</button>`).join('')}</div>`;
}
function viewBookingPhoto(button){
    const dialog=document.getElementById('booking-gallery-dialog');
    dialog.querySelector('.booking-gallery-image').replaceChildren(button.firstElementChild.cloneNode());
    dialog.showModal();
}
function propertyLocation(p){
    const coordinates=Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)?`${p.latitude},${p.longitude}`:null;
    if(!coordinates&&!p.address)return '<p class="notice">Street address and map location have not been supplied.</p>';
    const place=coordinates||p.address+' '+p.location;
    return `${p.address?`<address>${escapeHtml(p.address)}</address>`:''}
        <a class="text-link" href="https://maps.google.com/?q=${encodeURIComponent(place)}" rel="noopener noreferrer" target="_blank">Open in Google Maps &nearr;</a>
        <iframe title="Map of ${escapeHtml(p.name)}" class="booking-map" loading="lazy" src="https://maps.google.com/maps?output=embed&amp;q=${encodeURIComponent(place)}"></iframe>`;
}
function propertyPolicy(p){
    return p.cancel_refund_bps
        ? `Cancel at least ${p.cancel_hours} hours before the check-in date to receive a ${p.cancel_refund_bps/100}% refund. Later cancellations are non-refundable.`
        : 'This property does not offer a refund on customer cancellations.';
}
function livePropertyMarkup(p){
    const selectedDates=browseStayLink();
    const pictures=[...new Set([p.image,...p.gallery].filter(Boolean))];
    return `<div class="page-head"><div class="breadcrumb"><a href="#/stays">Explore stays</a> / ${escapeHtml(p.name)}</div>
        <span class="eyebrow">${escapeHtml(p.type)}</span><h1>${escapeHtml(p.name)} ${p.verified?'<span class="status">Verified</span>':''}</h1>
        <p>${escapeHtml(p.location)}</p></div>
        ${photoGallery(pictures,p.name)}
        <div class="detail-layout live-booking-layout">
            <div>
                <section class="detail-section"><h2>About this stay</h2><p>${escapeHtml(p.description||'No description supplied.')}</p>
                    <p>Up to ${p.capacity} guests per room, depending on room category.</p>
                    <div class="card-amenities">${p.amenities.map(name=>`<span>${escapeHtml(name)}</span>`).join('')}</div>
                    <p><strong>Pure veg food</strong> &middot; ${p.pure_veg===1?'Available':p.pure_veg===0?'Unavailable':'Ask the property'}</p>
                </section>
                <section class="detail-section"><h2>Rooms</h2>
                    ${p.rooms.length?p.rooms.map(room=>`<article class="panel hotel-room">
                        ${photoGallery(room.images,room.name)}
                        <div><h3>${escapeHtml(room.name)}</h3><p>${escapeHtml(room.description||'')}</p><p>Up to ${room.capacity} guests per room</p>
                            <button class="btn outline small" type="button" data-room="${room.id}" onclick="selectPropertyRoom(this)">Check availability</button></div>
                    </article>`).join(''):'<p>No room categories are published yet.</p>'}
                </section>
                <section class="detail-section"><h2>Location and landmarks</h2>${propertyLocation(p)}
                    <p><a class="text-link" href="#/restaurants?hotel=${p.id}">Find pure veg restaurants near this hotel</a></p>
                    <p><a class="text-link" href="#/cabs?type=hotel-ghat&amp;pickup=${escapeHtml(encodeURIComponent(p.name))}">Request hotel-to-ghat transport</a></p>
                    ${p.distances.length?`<ul class="booking-landmarks">${p.distances.map(row=>`<li>${escapeHtml(row.landmark)} &middot; ${row.distance_km} km</li>`).join('')}</ul>`:''}
                </section>
                <section class="detail-section"><h2>Property rules and cancellation</h2>
                    <p class="booking-property-rules">${escapeHtml(p.rules||'Property rules have not been supplied.')}</p><p>${propertyPolicy(p)}</p>
                </section>
                ${p.acceptsGroupEnquiries?`<section class="detail-section"><h2>Group stays</h2><a class="btn outline" href="#/group-stays?listing=${p.id}">Enquire about a group booking</a></section>`:''}
                ${p.reviews.length?`<section class="detail-section"><h2>Verified guest reviews</h2>${p.reviews.map(review=>`<article class="panel hotel-review"><strong>${review.rating} / 5</strong><p>${escapeHtml(review.comment||'')}</p>${review.reply?`<p><strong>Hotel response</strong><br>${escapeHtml(review.reply)}</p>`:''}</article>`).join('')}</section>`:''}
            </div>
            <aside class="panel booking-panel" id="hotel-booking-panel">
                <h2>Check rooms and prices</h2>
                ${p.rooms.length?`<form id="live-availability-form" onsubmit="checkLiveAvailability(event)" onchange="resetBookingQuote()">
                    <label>Room category<select class="input" name="roomId">${p.rooms.map(room=>`<option value="${room.id}">${escapeHtml(room.name)}</option>`).join('')}</select></label>
                    <div class="booking-field-grid">
                        <label>Check-in<input class="input" type="date" name="checkin" min="${indiaDate()}" value="${selectedDates.checkin}" required></label>
                        <label>Check-out<input class="input" type="date" name="checkout" min="${indiaDate()}" value="${selectedDates.checkout}" required></label>
                        <label>Guests<input class="input" name="guests" type="number" min="1" max="120" value="${selectedDates.guests}" required></label>
                        <label>Rooms<input class="input" name="rooms" type="number" min="1" max="30" value="${selectedDates.rooms}" required></label>
                    </div>
                    <button class="btn wide" type="submit">Check availability</button>
                </form><div id="live-booking-quote" aria-live="polite"></div>`:'<p>No rooms can be booked at the moment.</p>'}
            </aside>
        </div>
        <dialog class="stay-comparison" id="booking-gallery-dialog" aria-label="Property photograph">
            <form method="dialog" class="stay-dialog-close"><button class="btn outline small">Close</button></form><div class="booking-gallery-image"></div>
        </dialog>`;
}
function selectPropertyRoom(button){
    const form=document.getElementById('live-availability-form');
    form.elements.roomId.value=button.dataset.room;
    resetBookingQuote();
    form.closest('aside').scrollIntoView({block:'start'});
    form.elements.checkin.focus({preventScroll:true});
    form.requestSubmit();
}
function resetBookingQuote(){
    bookingQuote=null;
    checkoutRequest?.abort();
    const target=document.getElementById('live-booking-quote');
    if(target)target.innerHTML='';
}
function bookedPrice(quote){
    return `<dl class="booking-price">
        <div><dt>Rooms &middot; ${quote.rooms} &times; ${quote.nights} night${quote.nights===1?'':'s'}</dt><dd>${bookingMoney(quote.subtotal)}</dd></div>
        <div><dt>Taxes</dt><dd>${bookingMoney(quote.tax)}</dd></div>
        <div class="booking-price-total"><dt>Total</dt><dd>${bookingMoney(quote.total)}</dd></div>
    </dl>`;
}
function quoteMarkup(quote){
    const nights=`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Rooms free</th><th>Rate / room</th><th>Tax</th></tr></thead><tbody>
        ${quote.breakdown.map(row=>`<tr><td>${row.date}</td><td>${row.available}</td><td>${row.rate===null?'&mdash;':bookingMoney(row.rate)}</td><td>${row.tax===null?'&mdash;':bookingMoney(row.tax)}</td></tr>`).join('')}
        </tbody></table></div>`;
    if(!quote.available)return `<p class="notice">There are not enough rooms across all selected nights.</p>${nights}`;
    return `${nights}${bookedPrice(quote)}
        ${quote.refundBps?`<p class="notice">${quote.refundBps/100}% refundable until ${bookingDateTime(quote.cancelUntil)}.</p>`:''}
        ${propertyRecord.paymentConfigured?`<form class="booking-guest-form" onsubmit="createLiveHold(event)">
            <h3>Guest information</h3>
            <label>Full name<input class="input" name="name" autocomplete="name" required maxlength="120"></label>
            <label>Email<input class="input" type="email" name="email" autocomplete="email" required maxlength="254"></label>
            <label>Phone<input class="input" type="tel" name="phone" autocomplete="tel" required maxlength="24"></label>
            <p class="notice" data-hold-message></p>
            <button class="btn wide" type="submit">Hold rooms and continue</button>
        </form>`:'<p class="notice">Online payment is currently unavailable.</p>'}`;
}
async function checkLiveAvailability(event){
    event.preventDefault();
    resetBookingQuote();
    const target=document.getElementById('live-booking-quote');
    const query=new URLSearchParams(new FormData(event.target));
    const request=new AbortController();
    checkoutRequest=request;
    target.textContent='Checking availability...';
    try{
        const quote=await reservationApi('properties/'+propertyRecord.id+'/availability?'+query,{signal:request.signal});
        if(request.signal.aborted||!target.isConnected)return;
        bookingQuote=quote;
        holdRequestKey=crypto.randomUUID();
        target.innerHTML=quoteMarkup(quote);
    }catch(error){
        if(!request.signal.aborted&&target.isConnected)target.textContent=error.message;
    }
}
async function createLiveHold(event){
    event.preventDefault();
    const form=event.target;
    const submit=form.querySelector('button');
    const message=form.querySelector('[data-hold-message]');
    const quote=bookingQuote;
    if(!quote?.available)return;
    submit.disabled=true;
    const guest=Object.fromEntries(new FormData(form));
    try{
        await reservationApi('reservations/session');
        const hold=await reservationApi('reservations',{method:'POST',headers:{'Idempotency-Key':holdRequestKey},
            body:JSON.stringify({...quote,...guest})});
        if(form.isConnected)go('/reservation/'+hold.reference);
    }catch(error){
        message.textContent=error.message;
        submit.disabled=false;
    }
}
let razorpayScript;
function loadPaymentScript(){
    if(window.Razorpay)return Promise.resolve();
    if(!razorpayScript)razorpayScript=new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='https://checkout.razorpay.com/v1/checkout.js';
        script.onload=resolve;
        script.onerror=()=>{razorpayScript=null;script.remove();reject(new Error('Payment checkout could not load. Try again.'))};
        document.head.appendChild(script);
    });
    return razorpayScript;
}
async function payForReservation(button){
    const reference=button.dataset.reference;
    button.disabled=true;
    const message=document.getElementById('booking-payment-message');
    try{
        await loadPaymentScript();
        const payment=await reservationApi('reservations/'+reference+'/payment',{
            method:'POST',headers:{'Idempotency-Key':'payment-'+reference},body:'{}'
        });
        if(!button.isConnected)return;
        const checkout=new window.Razorpay({key:payment.key,currency:payment.currency,amount:payment.amount,
            name:'MahakumbhStays',order_id:payment.order,prefill:payment.prefill,theme:{color:'#244d3f'},
            handler(){
                if(!button.isConnected)return;
                message.textContent='Payment submitted. Waiting for gateway confirmation.';
                watchReservation(reference);
            },
            modal:{ondismiss(){button.disabled=false}}
        });
        checkout.on('payment.failed',()=>{message.textContent='Payment was unsuccessful. You can retry while the hold is active.';button.disabled=false});
        checkout.open();
    }catch(error){message.textContent=error.message;button.disabled=false}
}
function watchReservation(reference,attempt=0){
    clearTimeout(reservationTimer);
    if(attempt>=40){
        const button=document.querySelector('[data-pay-reservation]');
        if(button)button.disabled=false;
        return;
    }
    reservationTimer=setTimeout(async()=>{
        const target=document.getElementById('reservation-status');
        if(!target||location.hash!=='#/reservation/'+reference)return;
        try{
            const booking=await reservationApi('reservations/'+reference);
            if(!target.isConnected)return;
            if(booking.status==='held')watchReservation(reference,attempt+1);
            else target.innerHTML=reservationMarkup(booking);
        }catch{if(target.isConnected)watchReservation(reference,attempt+1)}
    },3000);
}
const statusNames={held:'Rooms held',confirmed:'Booking confirmed',expired:'Room hold expired',cancelled:'Booking cancelled'};
function reservationMarkup(booking){
    const canCancel=booking.status==='held'||(booking.status==='confirmed'&&booking.quote.checkin>indiaDate());
    const refund=booking.status==='confirmed'&&Date.now()<=Date.parse(booking.quote.cancelUntil)
        ?Math.round(booking.quote.total*booking.quote.refundBps/10000):0;
    return `<div class="page-head"><div class="breadcrumb"><a href="#/account">My trips</a> / ${booking.reference}</div><h1>${statusNames[booking.status]}</h1></div>
        <div class="panel booking-reservation"><h2>${escapeHtml(booking.property)}</h2><p>${escapeHtml(booking.room)} &middot; ${booking.quote.checkin} to ${booking.quote.checkout}</p>
            <p>Reference <strong>${booking.reference}</strong></p>${bookedPrice(booking.quote)}
            ${booking.status==='held'?`<p class="notice">Hold expires ${bookingDateTime(booking.expiresAt)}.</p>
                <button class="btn" data-pay-reservation data-reference="${booking.reference}" onclick="payForReservation(this)">Pay securely</button>`:''}
            ${booking.notification?`<p role="status">${escapeHtml(booking.notification)}</p>`:''}
            ${booking.refundStatus?`<p>Refund ${bookingMoney(booking.refundAmount)} &middot; ${escapeHtml(booking.refundStatus)}</p>`:''}
            ${canCancel?`<details class="booking-cancel-action"><summary class="text-link">Cancel reservation</summary>
                <p>${booking.status==='held'?'This releases your held rooms.':refund?'Estimated refund '+bookingMoney(refund)+' under the booked cancellation policy.':'This booking is outside its refundable terms.'}</p>
                <button class="btn outline" data-reference="${booking.reference}" onclick="cancelLiveReservation(this)">Confirm cancellation</button>
            </details>`:''}
            <p id="booking-payment-message" role="status"></p></div>`;
}
async function cancelLiveReservation(button){
    button.disabled=true;
    const message=document.getElementById('booking-payment-message');
    try{
        const booking=await reservationApi('reservations/'+button.dataset.reference+'/cancel',{method:'POST',body:'{}'});
        if(button.isConnected)document.getElementById('reservation-status').innerHTML=reservationMarkup(booking);
    }catch(error){message.textContent=error.message;button.disabled=false}
}
async function loadReservation(){
    const container=document.getElementById('reservation-status');
    if(!container)return;
    const ref=location.hash.split('/')[2];
    try{
        const booking=await reservationApi('reservations/'+encodeURIComponent(ref));
        if(container.isConnected)container.innerHTML=reservationMarkup(booking);
    }catch(error){if(container.isConnected)container.textContent=error.message}
}
async function loadBookingDashboard(target){
    try{
        const rows=await reservationApi('reservations');
        if(!target.isConnected)return;
        target.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Property</th><th>Stay</th><th>Total</th><th>Status</th></tr></thead><tbody>
            ${rows.map(row=>`<tr><td><a class="text-link" href="#/reservation/${row.reference}">${row.reference}</a></td><td>${escapeHtml(row.property)}</td>
            <td>${row.quote.checkin} to ${row.quote.checkout}</td><td>${bookingMoney(row.quote.total)}</td><td>${statusNames[row.status]}
            ${row.refundStatus?' &middot; Refund '+escapeHtml(row.refundStatus):''}</td></tr>`).join('')}</tbody></table></div>`:'<p class="notice">No reservations yet.</p>';
    }catch(error){if(target.isConnected)target.textContent=error.message}
}
async function loadBookableProperty(){
    const container=document.getElementById('live-stay');
    if(!container)return;
    const match=location.hash.match(/^#\/stay\/(\d+)\?/);
    if(!match)return;
    try{
        const property=await reservationApi('properties/'+match[1]);
        if(!container.isConnected)return;
        propertyRecord=property;
        container.innerHTML=livePropertyMarkup(property);
        updatePublicRecord('stay',property);
    }catch(error){
        if(!container.isConnected)return;
        if(error.status===404||error.status===503)loadLiveStay();
        else container.textContent=error.message;
    }
}
const bookingRenderBase=render;
render=function(){
    clearTimeout(reservationTimer);
    resetBookingQuote();
    bookingRenderBase();
    loadBookableProperty();
    loadReservation();
    const page=location.hash.slice(2).split('?')[0];
    const main=document.querySelector('main');
    if(!main||page!=='account')return;
    const section=document.createElement('section');
    section.className='container section';
    section.innerHTML=`<h2>My reservations</h2><div class="panel" aria-live="polite">Loading reservations...</div>`;
    main.prepend(section);
    loadBookingDashboard(section.lastElementChild);
};
