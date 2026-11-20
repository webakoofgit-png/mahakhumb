const staySearchRenderBase=render;
const searchIcons={hotel:'<path d="M5 28V6h17v22M9 10h2m4 0h2M9 15h2m4 0h2M9 20h2m4 0h2M11 28v-5h6v5M22 14h6v14M2 28h28"/>',home:'<path d="m3 15 13-11 13 11M7 12v16h18V12M13 28V18h6v10M11 12h3m4 0h3"/>',temple:'<path d="M5 28h22M8 28V17h16v11M5 17h22L16 6ZM16 6V2m0 0h7l-7 4M13 28v-7h6v7M7 31h18"/>',tent:'<path d="m2 28 14-23 14 23ZM16 5v23M9 28l7-12 7 12M12 5l4 3 4-3"/>',family:'<circle cx="11" cy="10" r="4"/><circle cx="24" cy="11" r="3"/><path d="M3 28v-7c0-7 16-7 16 0v7M21 18c5-2 10 1 10 5v5M8 28v-7m6 7v-7"/>',all:'<path d="M4 4h10v10H4ZM20 4h10v10H20ZM4 20h10v10H4ZM20 20h10v10H20Z"/>'};
function stayIcon(key){return `<svg viewBox="0 0 34 34" aria-hidden="true">${searchIcons[key]}</svg>`}
const quickBookingCategories=[
    ['all','All stays','All stays'],
    ['hotel','Hotels','Budget Hotels'],
    ['hotel','Resorts','Premium Hotels & Resorts'],
    ['temple','Dharamshalas','Dharamshalas'],
    ['home','Homestays','Homestays'],
    ['hotel','Dormitories','Dormitories'],
    ['family','Group Accommodation','#/group-stays'],
    ['all','Cab Services','#/cabs'],
    ['all','Pure Veg Restaurants','#/restaurants'],
    ['tent','Tent cities','Tent Cities']
];
function dateVisual(value){
    if(!validSearchDate(value))return '<span>Select a date</span>';
    const date=new Date(value+'T12:00:00');
    return `<strong>${date.getDate()}</strong><span>${date.toLocaleDateString(activeLocale+'-IN',{month:'short'})} '${String(date.getFullYear()).slice(2)}</span><small>${date.toLocaleDateString(activeLocale+'-IN',{weekday:'long'})}</small>`;
}
function updateStayCategory(select){
    select.form.closest('.reference-search')?.querySelectorAll('button.stay-service').forEach(button=>{
        const active=button.dataset.category===select.value;
        button.classList.toggle('active',active);
        button.setAttribute('aria-pressed',active);
    });
}
function selectStayCategory(button){
    const select=button.closest('.reference-search').querySelector('[name="type"]');
    select.value=button.dataset.category;
    updateStayCategory(select);
}
function numericStayOptions(min,max,current,label){
    return Array.from({length:max-min+1},(_,index)=>{
        const value=min+index;
        return `<option value="${value}" ${value===current?'selected':''}>${value} ${label}</option>`;
    }).join('');
}
function searchDateField(name,label){
    const value=state[name];
    return `<div class="stay-search-cell date-cell"><label for="stay-${name}">${label} <span aria-hidden="true">&#8964;</span></label><div class="date-visual" aria-hidden="true">${dateVisual(value)}</div><input id="stay-${name}" name="${name}" type="date" value="${value}" required onchange="this.previousElementSibling.innerHTML=dateVisual(this.value)"></div>`;
}
function bookingSearchForm(home=true){
    return `<form class="stay-search-form" onsubmit="submitStaySearch(event)">
        <div class="stay-search-fields">
            <div class="stay-search-cell destination-cell"><label for="stay-destination">Destination</label><select id="stay-destination" name="destination">${stayDestinations.map(value=>`<option value="${value}" ${value===state.destination?'selected':''}>${{'Surrounding Areas':'Nearby areas','All destinations':'All destinations'}[value]||value}</option>`).join('')}</select><small>Maharashtra, India</small></div>
            ${searchDateField('checkin','Check-in')}${searchDateField('checkout','Check-out')}
            <div class="stay-search-cell party-cell"><label for="stay-rooms">Rooms & guests</label><div>
                <select id="stay-rooms" name="rooms" aria-label="Rooms">${numericStayOptions(1,home?4:30,state.rooms,'rooms')}</select>
                <select name="adults" aria-label="Adults">${numericStayOptions(1,16,state.adults,'adults')}</select>
                <select name="children" aria-label="Children">${numericStayOptions(0,12,state.children,'children')}</select>
            </div></div>
            <div class="stay-search-cell budget-cell"><label for="stay-type">Accommodation type</label><select id="stay-type" name="type" onchange="updateStayCategory(this)">${['All stays',...categories].map(value=>`<option ${value===state.type?'selected':''}>${value}</option>`).join('')}</select><label for="stay-budget">Price per night</label><select id="stay-budget" name="budget">${[...new Set([searchDefaults.max,1500,2000,2500,5000,state.max])].map(value=>`<option value="${value}" ${value===state.max?'selected':''}>${value===searchDefaults.max?'Any budget':'Up to '+money(value)}</option>`).join('')}</select></div>
        </div>
        ${home?`<div class="stay-trending"><span>Popular searches:</span>${['Nashik City','Trimbakeshwar','Panchavati / Ramkund'].map(value=>`<button type="button" data-destination="${value}" onclick="this.form.elements.destination.value=this.dataset.destination">${value==='Panchavati / Ramkund'?'Near Ramkund':value}</button>`).join('')}</div>`:''}
        <button class="${home?'stay-search-submit':'btn results-search-submit'}" type="submit">Search stays <span aria-hidden="true">&rarr;</span></button>
    </form>`;
}
function staySearchMarkup(){
    return `<div class="stay-services" role="group" aria-label="Quick booking categories">${quickBookingCategories.map(([icon,label,value])=>{
        const content=stayIcon(icon)+`<span>${label}</span>`;
        if(value.startsWith('#'))return `<a class="stay-service" href="${value}">${content}</a>`;
        const active=state.type===value;
        return `<button type="button" class="stay-service ${active?'active':''}" data-category="${value}" aria-pressed="${active}" onclick="selectStayCategory(this)">${content}</button>`;
    }).join('')}</div>
    <div class="stay-search-meta"><div><span class="stay-standard">&#10003; Up to 4 rooms</span><a href="#/group-stays">&#9676; Group enquiries <small>For larger groups</small></a></div><p>Find your stay for <strong>Nashik Kumbh 2027</strong> <span>&middot;</span> <a href="#/list-property">List your property &#8599;</a></p></div>
    ${bookingSearchForm()}`;
}
function submitStaySearch(event){
    event.preventDefault();
    const data=new FormData(event.target);
    const checkin=data.get('checkin'),checkout=data.get('checkout');
    if(checkout<=checkin){toast('Choose a check-out date after check-in.');return}
    const adults=+data.get('adults'),children=+data.get('children');
    if(event.target.closest('.reference-search'))Object.assign(state,searchDefaults);
    Object.assign(state,{page:1,checkin,checkout,adults,children,guests:adults+children,
        destination:data.get('destination'),rooms:+data.get('rooms'),type:data.get('type'),max:+data.get('budget')});
    goToStays();
}
render=function(){
    staySearchRenderBase();
    const search=document.querySelector('.booking-search');
    if(search){
        search.classList.add('reference-search');
        search.innerHTML=staySearchMarkup();
        document.querySelector('.booking-hero')?.classList.add('reference-hero');
    }
};
