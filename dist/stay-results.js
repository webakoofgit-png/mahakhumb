let stayRequest;
let stayView='list';
let currentStayResults;
let comparisonCriteria;
const comparedStays=new Map();
const staySorts=[
    ['recommended','Recommended'],['price','Price: low to high'],
    ['price-desc','Price: high to low'],['distance','Distance: nearest first']
];

function filterOptions(values,current){
    return values.map(([value,label])=>`<option value="${escapeHtml(value)}"${value===current?' selected':''}>${escapeHtml(label)}</option>`).join('');
}
function stayFilters(){
    return `<form class="stay-results-filters" onsubmit="updateResultFilters(event)">
        <div class="stay-filter-heading"><h2>Filters</h2><button class="text-link" type="button" onclick="clearResultFilters()">Clear all</button></div>
        <fieldset class="filter-group"><legend>Nightly price (INR)</legend>
            <div class="stay-price-filter">
                <label>Minimum<input class="input" name="min" type="number" min="0" max="1000000" value="${state.min}"></label>
                <label>Maximum<input class="input" name="max" type="number" min="0" max="1000000" placeholder="Any" value="${state.max===searchDefaults.max?'':state.max}"></label>
            </div>
        </fieldset>
        <div class="filter-group"><label>Accommodation type<select class="input" name="type">${filterOptions(['All stays',...categories].map(type=>[type,type]),state.type)}</select></label></div>
        <div class="filter-group"><label>Rooms<select class="input" name="rooms">${numericStayOptions(1,30,state.rooms,'rooms')}</select></label>
            <label>Guests per room<select class="input" name="capacity">${filterOptions([1,2,3,4,5,6,8,10,12,16,20,30].map(n=>[n,n===1?'Any capacity':n+' or more']),state.capacity)}</select></label>
        </div>
        <div class="filter-group"><label>Landmark<select class="input" name="landmark">${filterOptions([['','Nearest recorded landmark'],...landmarks.map(name=>[name,name])],state.landmark)}</select></label>
            <label>Distance<select class="input" name="radius">${filterOptions([['0:250','Any distance'],['0:1','Within 1 km'],['0:5','Within 5 km'],['0:10','Within 10 km'],['0:25','Within 25 km'],['0:50','Within 50 km'],['15:50','15 to 50 km']],state.minDistance+':'+state.distance)}</select></label>
        </div>
        <fieldset class="filter-group"><legend>Facilities and policies</legend>
            ${stayAmenities.map(name=>`<label class="stay-check"><input type="checkbox" name="amenities" value="${escapeHtml(name)}"${state.amenities.includes(name)?' checked':''}> ${escapeHtml(name)}</label>`).join('')}
            <label class="stay-check"><input type="checkbox" name="verified"${state.verified?' checked':''}> Verified properties</label>
        </fieldset>
        <button class="btn wide" type="submit">Apply filters</button>
    </form>`;
}
function searchChips(){
    const chips=[];
    const add=(key,label,value='')=>chips.push(`<button type="button" data-key="${key}" data-value="${escapeHtml(value)}" onclick="removeResultChip(this)">${escapeHtml(label)} <span aria-hidden="true">&times;</span></button>`);
    if(state.type!==searchDefaults.type)add('type',state.type);
    if(state.min||state.max!==searchDefaults.max)add('price',state.max===searchDefaults.max?'From '+money(state.min):money(state.min)+' to '+money(state.max));
    if(state.rooms!==searchDefaults.rooms)add('rooms',state.rooms+' rooms');
    if(state.capacity>1)add('capacity',state.capacity+'+ guests per room');
    if(state.landmark)add('landmark',state.landmark);
    if(state.minDistance||state.distance!==searchDefaults.distance)add('radius',state.minDistance?state.minDistance+' to '+state.distance+' km':'Within '+state.distance+' km');
    for(const name of state.amenities)add('amenities',name,name);
    if(state.verified)add('verified','Verified properties');
    return chips.join('');
}
function showResultFilterDrawer(){
    const drawer=document.getElementById('stay-filter-drawer');
    drawer.querySelector('.drawer-fields').innerHTML=stayFilters();
    drawer.showModal();
}
function clearResultFilters(){
    const {destination,checkin,checkout,adults,children,guests}=state;
    const drawer=document.getElementById('stay-filter-drawer');
    if(drawer?.open)drawer.close();
    setResultFilters({...searchDefaults,destination,checkin,checkout,adults,children,guests});
}
function removeResultChip(button){
    const {key,value}=button.dataset;
    const changes={
        price:{min:searchDefaults.min,max:searchDefaults.max},
        radius:{distance:searchDefaults.distance,minDistance:0},
        amenities:{amenities:state.amenities.filter(item=>item!==value)}
    };
    setResultFilters(changes[key]||{[key]:searchDefaults[key]});
}
function updateResultFilters(event){
    event.preventDefault();
    const form=event.target;
    const data=new FormData(form);
    const min=Number(data.get('min'));
    const max=data.get('max')===''?searchDefaults.max:Number(data.get('max'));
    if(min>max){
        form.elements.max.setCustomValidity('Maximum price must be at least the minimum price.');
        form.elements.max.reportValidity();
        form.elements.max.addEventListener('input',()=>form.elements.max.setCustomValidity(''),{once:true});
        form.elements.min.addEventListener('input',()=>form.elements.max.setCustomValidity(''),{once:true});
        return;
    }
    const [minDistance,distance]=data.get('radius').split(':').map(Number);
    if(form.closest('dialog')?.open)form.closest('dialog').close();
    setResultFilters({min,max,minDistance,distance,type:data.get('type'),rooms:Number(data.get('rooms')),
        capacity:Number(data.get('capacity')),landmark:data.get('landmark'),amenities:data.getAll('amenities'),
        verified:data.has('verified')});
}
function setResultFilters(changes){
    Object.assign(state,{page:1},changes);
    history.replaceState(null,'',staysHref());
    document.getElementById('stay-filter-chips').innerHTML=searchChips();
    document.getElementById('stay-desktop-filters').innerHTML=stayFilters();
    document.getElementById('stay-results-search').innerHTML=bookingSearchForm(false);
    loadStayResults();
}
function setStayPage(page){
    setResultFilters({page});
    document.getElementById('stay-result-status')?.scrollIntoView({block:'nearest'});
}
function setStayView(view){
    stayView=view;
    document.querySelectorAll('[data-stay-view]').forEach(button=>{
        button.setAttribute('aria-pressed',button.dataset.stayView===view);
    });
    if(currentStayResults)renderStayResults(currentStayResults);
}
function staySkeletons(){
    return `<div class="stay-skeletons" aria-hidden="true">${Array.from({length:3},()=>'<div class="panel stay-skeleton"><span></span><div><i></i><i></i><i></i></div></div>').join('')}</div>`;
}
function resultMap(items){
    const place=state.landmark||(state.destination==='All destinations'?'Nashik':state.destination);
    const locations=items.filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude));
    return `<div class="panel stay-result-map">
        <label>Map location
            <select class="input" onchange="updateResultMap(this)">
                <option value="${escapeHtml(place+' Maharashtra')}">${escapeHtml(place)} area</option>
                ${locations.map(p=>`<option value="${p.latitude},${p.longitude}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
        </label>
        <p class="notice">${locations.length?'Select a mapped property to see its recorded location.':'Property coordinates are unavailable. The map shows the search area.'}</p>
        <a id="stay-area-map-link" class="text-link" href="https://maps.google.com/?q=${encodeURIComponent(place+' Maharashtra')}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
        <iframe id="stay-area-map" loading="lazy" title="Map of the selected search area" src="${mapSource(place+' Maharashtra')}"></iframe>
    </div>`;
}
function mapSource(place){
    return 'https://maps.google.com/maps?output=embed&amp;q='+encodeURIComponent(place);
}
function updateResultMap(select){
    document.getElementById('stay-area-map-link').href='https://maps.google.com/?q='+encodeURIComponent(select.value);
    document.getElementById('stay-area-map').src='https://maps.google.com/maps?output=embed&q='+encodeURIComponent(select.value);
}
function compareButton(p){
    return `<button class="text-link stay-compare-button" data-compare-id="${p.id}" type="button" aria-pressed="${comparedStays.has(p.id)}" onclick="toggleStayCompare(${p.id})">${comparedStays.has(p.id)?'Remove from comparison':'Compare'}</button>`;
}
function toggleStayCompare(id){
    if(comparedStays.has(id))comparedStays.delete(id);
    else{
        if(comparedStays.size===3){toast('Compare up to three stays.');return}
        const property=currentStayResults?.items.find(item=>item.id===id);
        if(!property)return;
        comparedStays.set(id,property);
    }
    const button=document.querySelector('[data-compare-id="'+id+'"]');
    if(button){
        const active=comparedStays.has(id);
        button.setAttribute('aria-pressed',active);
        button.textContent=active?'Remove from comparison':'Compare';
    }
    updateCompareToolbar();
}
function updateCompareToolbar(){
    const bar=document.getElementById('stay-compare-bar');
    if(!bar)return;
    bar.innerHTML=comparedStays.size
        ? `<button class="btn outline small" type="button" onclick="showStayComparison()">Compare stays (${comparedStays.size})</button><button class="text-link" type="button" onclick="clearStayComparison()">Clear comparison</button>`:'';
}
function clearStayComparison(){
    for(const id of [...comparedStays.keys()])toggleStayCompare(id);
    document.querySelector('.stay-compare-button')?.focus();
}
function showStayComparison(){
    const dialog=document.getElementById('stay-comparison');
    const items=[...comparedStays.values()];
    const data=[
        ['Location',p=>p.location],['Category',p=>p.type],
        ['Nightly rate',p=>money(p.nightlyPrice??p.price)],
        ['Capacity per room',p=>p.capacity],
        ['Verified',p=>p.verified?'Yes':'No verified status'],
        ['Amenities',p=>p.amenities.join(', ')||'Unlisted']
    ];
    dialog.querySelector('.stay-compare-table').innerHTML=`<table><thead><tr><th scope="col">Property</th>${items.map(p=>`<th scope="col">${escapeHtml(p.name)}</th>`).join('')}</tr></thead><tbody>${data.map(([label,read])=>`<tr><th scope="row">${label}</th>${items.map(p=>`<td>${escapeHtml(read(p))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    dialog.showModal();
}
function renderStayResults(data){
    currentStayResults=data;
    const status=document.getElementById('stay-result-status');
    status.textContent=`${data.total} ${data.total===1?'stay':'stays'} found`;
    const sort=document.getElementById('stay-sort');
    sort.innerHTML=filterOptions(data.ratedCount?[...staySorts,['rating','Guest rating']]:staySorts,data.sort);
    const target=document.getElementById('stay-result-items');
    if(!data.items.length){
        target.innerHTML='<div class="empty"><h2>No stays match your search</h2><p>Try different dates, a nearby destination, or fewer filters.</p><button class="btn outline" onclick="clearResultFilters()">Clear filters</button></div>';
        return;
    }
    target.innerHTML=`${data.items.some(p=>p.demo)?'<p class="notice stay-result-note">Illustrative listings have sample rates and distances. Live availability is unconfirmed.</p>':''}
        ${stayView==='map'?resultMap(data.items):''}
        <div class="properties">${data.items.map(p=>`<div class="stay-result-card">${card(p)}${compareButton(p)}</div>`).join('')}</div>
        ${data.totalPages>1?`<nav class="stay-pagination" aria-label="Search results pages">
            <button class="btn outline small" onclick="setStayPage(${data.page-1})"${data.page===1?' disabled':''}>Previous</button>
            <span>Page ${data.page} of ${data.totalPages}</span>
            <button class="btn outline small" onclick="setStayPage(${data.page+1})"${data.page===data.totalPages?' disabled':''}>Next</button>
        </nav>`:''}`;
}
async function loadStayResults(){
    const target=document.getElementById('stay-result-items');
    if(!target)return;
    stayRequest?.abort();
    currentStayResults=undefined;
    const criteria=JSON.stringify([state.checkin,state.checkout,state.adults,state.children,state.rooms,state.capacity]);
    if(criteria!==comparisonCriteria){
        comparedStays.clear();
        updateCompareToolbar();
        comparisonCriteria=criteria;
    }
    const request=new AbortController();
    stayRequest=request;
    target.setAttribute('aria-busy','true');
    target.innerHTML=staySkeletons();
    document.getElementById('stay-result-status').textContent='Loading stays...';
    try{
        const response=await fetch('/api/stays?'+staysHref().split('?')[1],{signal:request.signal});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||'Try again in a moment.');
        if(request.signal.aborted||!target.isConnected)return;
        if(data.page!==state.page||data.sort!==state.sort){
            state.page=data.page;
            state.sort=data.sort;
            history.replaceState(null,'',staysHref());
        }
        renderStayResults(data);
    }catch(error){
        if(request.signal.aborted||!target.isConnected)return;
        document.getElementById('stay-result-status').textContent='Could not load stays';
        const message=error instanceof SyntaxError?'The search service returned an invalid response.':error.message;
        target.innerHTML=`<div class="empty"><h2>Search is unavailable</h2><p>${escapeHtml(message)}</p><button class="btn outline" onclick="loadStayResults()">Try again</button></div>`;
    }finally{
        if(!request.signal.aborted)target.removeAttribute('aria-busy');
    }
}
results=function(){
    return `<div class="container">
        <div class="page-head">
            <div class="breadcrumb"><a href="#/">Home</a> / Explore stays</div>
            <h1>Find a place that feels right.</h1>
            <div id="stay-results-search" class="search-box results-booking-search">${bookingSearchForm(false)}</div>
            <p class="notice mt">Travelling with 10 or more people? <a class="text-link" href="#/group-stays">Request a group stay quote &rarr;</a></p>
        </div>
        <div class="results-layout list-mode">
            <aside class="filters stay-desktop-filters" id="stay-desktop-filters">${stayFilters()}</aside>
            <section class="results stay-results" aria-label="Accommodation search results">
                <div class="stay-result-actions">
                    <button class="btn outline small stay-mobile-filters" onclick="showResultFilterDrawer()">Filters</button>
                    <div class="stay-view-buttons" role="group" aria-label="Result view">
                        <button class="btn outline small" data-stay-view="list" onclick="setStayView('list')" aria-pressed="${stayView==='list'}">List</button>
                        <button class="btn outline small" data-stay-view="map" onclick="setStayView('map')" aria-pressed="${stayView==='map'}">Map</button>
                    </div>
                    <label>Sort by <select id="stay-sort" class="input" onchange="setResultFilters({sort:this.value})">${filterOptions(staySorts,state.sort)}</select></label>
                </div>
                <div class="stay-filter-chips" id="stay-filter-chips" aria-label="Active filters">${searchChips()}</div>
                <div class="stay-result-meta"><span id="stay-result-status" role="status"></span><details class="notice"><summary>How we recommend stays</summary><p>Verified properties first, then stays with rates for your dates, then alphabetical order.</p></details></div>
                <div class="stay-compare-bar" id="stay-compare-bar"></div>
                <div id="stay-result-items"></div>
            </section>
        </div>
        <dialog class="stay-filter-drawer" id="stay-filter-drawer" aria-label="Search filters">
            <form method="dialog" class="stay-dialog-close"><button class="btn outline small">Close</button></form><div class="drawer-fields"></div>
        </dialog>
        <dialog class="stay-comparison" id="stay-comparison" aria-labelledby="stay-compare-title">
            <form method="dialog" class="stay-dialog-close"><button class="btn outline small">Close</button></form>
            <h2 id="stay-compare-title">Compare stays</h2><div class="table-wrap stay-compare-table"></div>
        </dialog>
    </div>`;
};
async function loadLiveStay(){
    const target=document.getElementById('live-stay');
    const match=location.hash.match(/^#\/stay\/(\d+)\?/);
    if(!target||!match)return;
    try{
        const response=await fetch('/api/stays/'+match[1]);
        const p=await response.json();
        if(!response.ok)throw new Error(p.error||'Could not load this property.');
        if(!target.isConnected)return;
        document.title=p.name+' - MahakumbhStays';
        target.innerHTML=`<div class="page-head"><div class="breadcrumb"><a href="#/stays">Explore stays</a> / ${escapeHtml(p.name)}</div>
            <h1>${escapeHtml(p.name)}</h1><p>${escapeHtml(p.location)}</p></div>
            <div class="panel live-stay-detail">${p.image?`<img src="${escapeHtml(photo(p.image))}" alt="${escapeHtml(p.name)}">`:''}
            <div><p>${escapeHtml(p.type)} ${p.verified?'<span class="status">Verified</span>':''}</p>
            <p>${escapeHtml(p.description||'')}</p>
            <p>Up to ${p.capacity} guests per room</p>
            <div class="card-amenities">${p.amenities.map(name=>`<span>${escapeHtml(name)}</span>`).join('')}</div>
            <a class="btn" href="#/stays">Search for dates and prices</a></div></div>`;
    }catch(error){
        if(target.isConnected)target.textContent=error.message;
    }
}
const resultsRenderBase=render;
render=function(){
    stayRequest?.abort();
    resultsRenderBase();
    updateCompareToolbar();
    loadStayResults();

};
