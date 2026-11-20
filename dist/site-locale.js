const phraseTable=new Map(siteStrings.map(([key,mr,hi])=>[key.toLowerCase(),{mr,hi}]));
const localizedNodes=new WeakMap();
const localizedAttributes=new WeakMap();
const nativeMessages=new Map();
const pilotLabels=pilgrimSections.map(([id,labels])=>[id,labels[0]]);
const blockedTranslation='script,style,textarea,pre,code,[translate="no"],[contenteditable="true"]';
let loadedPilgrimEntries;
let seoRecord;
const serverMeta={
    path:location.pathname,
    initial:initialSiteRoute?.split('?')[0],
    title:document.title,
    description:document.querySelector('meta[name="description"]')?.content,
    json:document.getElementById('site-schema')?.textContent
};
function translatePhrase(value,locale=activeLocale){
    if(locale==='en'||!value)return value;
    const trim=value.trim();
    if(!trim)return value;
    const match=trim.match(/^([✓◌⌾]\s*)?(.*?)(\s*(?:[↗→←×]|:))?$/);
    const key=match?.[2]||trim;
    let words=phraseTable.get(key.toLowerCase())?.[locale];
    const count=key.match(/^(\d+) (rooms?|adults?|children|guests?)$/i);
    if(!words&&count){
        const unit={room:'Rooms',rooms:'Rooms',adult:'Adults',adults:'Adults',children:'Children',guest:'Guests',guests:'Guests'}[count[2].toLowerCase()];
        words=Number(count[1]).toLocaleString(locale+'-IN')+' '+phraseTable.get(unit.toLowerCase())?.[locale];
    }
    const found=key.match(/^(\d+) stays? found$/);
    if(!words&&found)words=locale==='mr'?`${Number(found[1]).toLocaleString('mr-IN')} निवास सापडले`:`${Number(found[1]).toLocaleString('hi-IN')} आवास मिले`;
    if(!words)return value;
    const start=value.indexOf(trim);
    return value.slice(0,start)+(match?.[1]||'')+words+(match?.[3]||'')+value.slice(start+trim.length);
}
function translateText(node){
    const parent=node.parentElement;
    if(!parent||parent.closest(blockedTranslation)||!node.nodeValue.trim())return;
    const past=localizedNodes.get(node);
    const original=past?.translated===node.nodeValue?past.original:node.nodeValue;
    const translated=translatePhrase(original);
    if(parent.tagName==='OPTION'&&!parent.hasAttribute('value')&&original!==translated)parent.value=parent.value;
    localizedNodes.set(node,{original,translated});
    if(node.nodeValue!==translated)node.nodeValue=translated;
}
function translateAttributes(element){
    if(element.closest(blockedTranslation))return;
    const past=localizedAttributes.get(element)||{};
    for(const attribute of ['aria-label','placeholder','title']){
        const value=element.getAttribute(attribute);
        if(value===null)continue;
        const original=past[attribute]?.translated===value?past[attribute].original:value;
        const translated=translatePhrase(original);
        past[attribute]={original,translated};
        if(translated!==value)element.setAttribute(attribute,translated);
    }
    localizedAttributes.set(element,past);
}
function translateDom(root){
    if(root.nodeType===Node.TEXT_NODE){translateText(root);return}
    if(root.nodeType!==Node.ELEMENT_NODE||root.closest(blockedTranslation))return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode()))translateText(node);
    translateAttributes(root);
    root.querySelectorAll('[aria-label],[placeholder],[title]').forEach(translateAttributes);
}
function siteLanguageControl(){
    const control=document.createElement('label');
    control.className='site-language';
    control.setAttribute('translate','no');
    control.innerHTML=`<select aria-label="${escapeHtml(translatePhrase('Language'))}" onchange="changeSiteLanguage(this.value)">
        <option value="en" lang="en">English</option><option value="mr" lang="mr">मराठी</option><option value="hi" lang="hi">हिन्दी</option></select>`;
    control.firstChild.value=activeLocale;
    return control;
}
function skipButton(){
    const skip=document.createElement('a');
    skip.href='#main-content';
    skip.className='skip-main';
    skip.textContent='Skip to main content';
    skip.addEventListener('click',event=>{
        const main=document.getElementById('main-content');
        if(!main)return;
        event.preventDefault();
        main.focus();
        main.scrollIntoView();
    });
    return skip;
}
function installSiteControls(){
    const header=document.querySelector('header');
    if(!header)return;
    if(!header.querySelector('.site-language')){
        const slot=header.querySelector('.header-actions')||header.querySelector('.nav')||header;
        slot.append(siteLanguageControl());
    }
    if(!document.querySelector('.skip-main'))document.getElementById('app').prepend(skipButton());
}
function changeSiteLanguage(locale){
    activeLocale=siteLocale(locale);
    document.documentElement.lang=activeLocale;
    try{localStorage.setItem('mks-locale',activeLocale)}catch{}
    document.querySelector('.site-language select')?.setAttribute('aria-label',translatePhrase('Language'));
    for(const [field,original] of nativeMessages){
        if(field.isConnected)field.setCustomValidity(original);
    }
    nativeMessages.clear();
    for(const field of document.querySelectorAll('.date-cell input[type="date"]')){
        const preview=field.previousElementSibling;
        if(preview?.matches('.date-visual'))preview.innerHTML=dateVisual(field.value);
    }
    refreshSiteSeo();
    if(document.getElementById('pilgrim-guide'))loadPilgrimGuide();
    translateDom(document.body);
}
document.addEventListener('invalid',event=>{
    const field=event.target;
    if(activeLocale==='en'||typeof field.setCustomValidity!=='function'||!field.validity)return;
    const validity=field.validity;
    const original=nativeMessages.get(field)??(validity.customError?field.validationMessage:'');
    const key=original||(validity.valueMissing?'Enter a value for this field.':validity.typeMismatch&&field.type==='email'?'Enter a valid email address.':
        validity.rangeOverflow||validity.rangeUnderflow?'Enter a value within the allowed range.':'Enter a valid value for this field.');
    const translated=translatePhrase(key);
    if(translated===key)return;
    nativeMessages.set(field,original);
    field.setCustomValidity(translated);
},true);
document.addEventListener('input',event=>{
    const field=event.target;
    if(nativeMessages.has(field)){
        const original=nativeMessages.get(field);
        field.setCustomValidity(original);
        nativeMessages.delete(field);
    }
},true);
function seoTag(selector,tag,attrs){
    let node=document.head.querySelector(selector);
    if(!node){node=document.createElement(tag);document.head.append(node)}
    for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
    return node;
}
function refreshSiteSeo(){
    const [page='',id]=location.hash.replace(/^#\/|^#/,'').split('?')[0].split('/');
    const record=seoRecord?.page===page&&String(seoRecord?.id)===id?seoRecord:null;
    const serverPath=parseSitePath(serverMeta.path);
    const sameServer=serverMeta.initial===(location.hash.split('?')[0]||'#/')&&serverPath?.page===page;
    const cfg=sitePages[page];
    const pathname=cfg?.path||(record?(page==='stay'?propertyPath(record.id,record.name):'/restaurants/'+record.id):sameServer&&serverPath?.id?
        (page==='stay'?serverMeta.path.replace(/^\/(mr|hi)\//,'/'):('/restaurants/'+serverPath.id)):null);
    if(!pathname){
        seoTag('meta[name="robots"]','meta',{name:'robots',content:'noindex'});
        document.querySelector('link[rel="canonical"]')?.remove();
        document.querySelectorAll('link[hreflang]').forEach(link=>link.remove());
        document.getElementById('site-schema')?.remove();
        const shell=sitePath('/',activeLocale);
        if(location.pathname!==shell)history.replaceState(null,'',shell+location.hash);
        return;
    }
    document.querySelector('meta[name="robots"]')?.remove();
    const base=sitePath(pathname,activeLocale);
    if(location.pathname!==base||location.search)history.replaceState(null,'',base+location.hash);
    document.title=record?record.name+' | MahakumbhStays':cfg?siteLabel(cfg.labels,activeLocale)+' | MahakumbhStays':serverMeta.title;
    seoTag('meta[name="description"]','meta',{name:'description',content:(record?.description?.slice(0,160)||(record?record.name+' · '+record.location:cfg?siteLabel(cfg.description,activeLocale):serverMeta.description))||''});
    seoTag('link[rel="canonical"]','link',{rel:'canonical',href:canonicalOrigin+base});
    for(const lang of [...siteLanguages,'x-default']){
        seoTag('link[hreflang="'+lang+'"]','link',{rel:'alternate',hreflang:lang,href:canonicalOrigin+sitePath(pathname,lang)});
    }
    const parents=page==='stay'?['','stays']:page==='restaurant'?['','restaurants']:page?['']:[];
    const list=parents.map(key=>({name:key?siteLabel(sitePages[key].labels,activeLocale):translatePhrase('Home'),item:canonicalOrigin+sitePath(sitePages[key].path,activeLocale)}));
    list.push({name:page?(record?.name|| (cfg?siteLabel(cfg.labels,activeLocale):serverMeta.title.split(' | ')[0])):translatePhrase('Home'),item:canonicalOrigin+base});
    const blocks=[{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:list.map((item,index)=>({...item,'@type':'ListItem',position:index+1}))}];
    if(page==='stay'){
        if(record){
            const item={'@context':'https://schema.org','@type':/hotel|resort|lodge/i.test(record.type)?'Hotel':'LodgingBusiness',
                name:record.name,url:canonicalOrigin+base,address:{'@type':'PostalAddress',addressLocality:record.location,addressCountry:'IN'}};
            if(record.address)item.address.streetAddress=record.address;
            if(record.description)item.description=record.description;
            if(record.image)item.image=new URL(photo(record.image),canonicalOrigin).href;
            blocks.push(item);
        }else if(sameServer&&serverMeta.json){
            const lodging=JSON.parse(serverMeta.json)[1];
            if(lodging)blocks.push({...lodging,url:canonicalOrigin+base});
        }
    }
    seoTag('#site-schema','script',{id:'site-schema',type:'application/ld+json'}).textContent=JSON.stringify(blocks);
}
function updatePublicRecord(page,record){
    seoRecord={...record,page};
    refreshSiteSeo();
}
function pilgrimDate(value){
    return new Intl.DateTimeFormat(activeLocale+'-IN',{dateStyle:'long',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));
}
function pilgrimCard(item){
    const translation=item.translations[activeLocale];
    const heading=escapeHtml(translation.title);
    const content=`${item.date_value?`<p><time datetime="${item.date_value}">${pilgrimDate(item.date_value)}</time></p>`:''}
        <p class="ops-preline">${escapeHtml(translation.body)}</p>
        ${item.phone?`<p><a class="pilgrim-phone text-link" href="tel:${item.phone}">${item.phone}</a></p>`:''}
        <p class="pilgrim-source">
            <a class="text-link" href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">${translatePhrase('Official source')} &nearr;</a>
            <span>${translatePhrase('Source checked')} ${pilgrimDate(item.reviewed_on)}</span>
        </p>`;
    return item.section==='faq'?`<details class="panel" lang="${activeLocale}"><summary>${heading}</summary>${content}</details>`:
        `<article class="panel" lang="${activeLocale}" translate="no"><h3>${heading}</h3>${content}</article>`;
}
async function loadPilgrimGuide(){
    const root=document.getElementById('pilgrim-guide');
    if(!root)return;
    try{
        const entries=loadedPilgrimEntries||=await opsApi('pilgrim');
        if(!root.isConnected)return;
        const sections=pilgrimSections.filter(([key])=>entries.some(item=>item.section===key));
        root.innerHTML=`<div class="page-head">
            <div class="breadcrumb"><a href="#/">${translatePhrase('Home')}</a> / ${translatePhrase('Kumbh guide')}</div>
            <h1 class="serif">${translatePhrase('Nashik Kumbh pilgrim guide')}</h1>
            <p>${translatePhrase('Check the authority’s latest information before travelling.')}</p>
        </div><nav class="pilgrim-toc" aria-label="${translatePhrase('Kumbh guide')}">
            ${sections.map(([key,title])=>`<button class="btn outline small" onclick="document.getElementById('guide-${key}').focus()">${siteLabel(title,activeLocale)}</button>`).join('')}
        </nav>${sections.map(([key,title])=>`<section class="pilgrim-section" id="guide-${key}" aria-labelledby="guide-title-${key}" tabindex="-1">
            <h2 id="guide-title-${key}">${siteLabel(title,activeLocale)}</h2><div class="pilgrim-grid">${entries.filter(item=>item.section===key).map(pilgrimCard).join('')}</div>
        </section>`).join('')}
        <div class="ops-pager"><a class="btn outline small" href="#/support">${translatePhrase('Help and support')}</a><a class="btn outline small" href="#/cabs">${translatePhrase('Cab and transportation')}</a></div>`;
        root.setAttribute('translate','no');
        if(initialSiteAnchor){
            const section=document.getElementById(initialSiteAnchor);
            initialSiteAnchor=null;
            section?.focus();
        }
    }catch{
        if(root.isConnected)root.textContent=translatePhrase('Search is unavailable');
    }
}
let pilgrimAdminEntries=[];
async function openPilgrimCms(){
    const pane=operationsPane,request=++operationsRequest;
    try{
        const rows=await opsApi('pilgrim-cms');
        if(!pane.isConnected||request!==operationsRequest)return;
        pilgrimAdminEntries=rows;
        pane.innerHTML=opButton('Back to CMS','showOperationsSection()')+opSection('Pilgrim assistance CMS',
            opButton('Add guide entry','editPilgrimEntry(-1)')+opTable(['Entry','Section','Source checked','Status',''],rows.map((entry,index)=>[
                oe(entry.translations.en.title),oe(pilotLabels.find(([key])=>key===entry.section)?.[1]),oe(entry.reviewed_on),opStatus(entry.state),
                opButton('Edit',`editPilgrimEntry(${index})`)
            ])));
    }catch(error){if(pane.isConnected)pane.textContent=error.message}
}
function editPilgrimEntry(index){
    const row=pilgrimAdminEntries[index]||{};
    const id=row.id||crypto.randomUUID();
    const labels={en:'English',mr:'Marathi',hi:'Hindi'};
    const translations=siteLanguages.map(lang=>opField(labels[lang]+' title',lang+'Title',row.translations?.[lang]?.title,{maxlength:180})+
        opField(labels[lang]+' text',lang+'Body',row.translations?.[lang]?.body,{type:'textarea',maxlength:4000})).join('');
    operationsPane.innerHTML=opButton('Back to guide entries','openPilgrimCms()')+opSection('Edit guide entry',
        opForm('pilgrim-cms/'+id,
            opField('Section','section',row.section||'dates',{choices:pilotLabels})+
            opField('Publication status','state',row.state||'draft',{choices:['draft','published','archived']})+
            opField('Official source URL','source',row.source_url,{type:'url',maxlength:1024})+
            opField('Source checked on','reviewed',row.reviewed_on||indiaDate(),{type:'date',max:indiaDate()})+
            opField('Bathing or event date','date',row.date_value,{type:'date',optional:true})+
            opField('Emergency number','phone',row.phone,{type:'tel',maxlength:12,optional:true})+
            opField('Hide after date (optional)','expiry',row.expires_on,{type:'date',optional:true})+translations+
            '<label class="ops-check ops-full"><input type="checkbox" name="verified"> I checked these translations and details against the official source.</label>',
            'Save guide entry','pilgrim-save'));
}
const messageObserver=new MutationObserver(changes=>{
    const pending=new Set();
    for(const change of changes){
        if(change.type==='characterData')pending.add(change.target);
        else for(const node of change.addedNodes)pending.add(node);
        if(change.type==='attributes')translateAttributes(change.target);
    }
    for(const node of pending)translateDom(node);
});
const localeRenderBase=render;
render=function(){
    localeRenderBase();
    installSiteControls();
    refreshSiteSeo();
    if(document.getElementById('pilgrim-guide'))loadPilgrimGuide();
    translateDom(document.body);
};
render();
messageObserver.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder']});
