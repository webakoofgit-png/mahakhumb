const fs=require('node:fs');
const path=require('node:path');
const {pool}=require('./booking-db.cjs');
const {getListing}=require('./stay-api.cjs');
const pilgrim=require('./pilgrim-content.cjs');
const {siteLanguages,sitePages,sitePath,siteLabel,propertyPath,parseSitePath,pilgrimSections}=require('./dist/site-routes.js');

const source=fs.readFileSync(path.join(__dirname,'dist','index.html'),'utf8');
const siteOrigin=new URL(process.env.SITE_ORIGIN||process.env.APP_ORIGIN||'http://localhost:'+(process.env.PORT||3000)).origin;
const escaped=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const structured=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const urlFor=(pathname,locale='en')=>siteOrigin+sitePath(pathname,locale);
function alternate(pathname){
    return [...siteLanguages,'x-default'].map(lang=>({lang,url:urlFor(pathname,lang)}));
}
function send(req,res,status,mime,value){
    res.writeHead(status,{'Content-Type':mime+'; charset=utf-8','Cache-Control':mime==='text/html'?'no-cache':'public, max-age=300'});
    res.end(req.method==='HEAD'?undefined:value);
}
const seoPropertySql=`FROM mks_listings l LEFT JOIN mks_property_workflow w ON w.listing_id=l.id
    WHERE l.demo=0 AND COALESCE(w.state,'approved')='approved'`;
async function propertyRecord(id){
    if(pool){
        const [[row]]=await pool.execute(`SELECT l.id,l.name,l.description,l.location,l.address,l.image,l.latitude,l.longitude,l.type ${seoPropertySql} AND l.id=?`,[id]);
        return row;
    }
    const result=await getListing(id);
    return result.status===200&&result.body.demo===false?result.body:null;
}
async function restaurantRecord(id){
    if(!pool)return null;
    const [[row]]=await pool.execute("SELECT id,name,address,description,location FROM mks_veg_restaurants WHERE id=? AND state='approved' AND verified=1",[id]);
    return row;
}
async function sitemap(req,res){
    const paths=Object.values(sitePages).map(page=>page.path);
    if(pool){
        const [[properties],[restaurants]]=await Promise.all([
            pool.query(`SELECT l.id,l.name ${seoPropertySql} ORDER BY l.id LIMIT 14000`),
            pool.query("SELECT id FROM mks_veg_restaurants WHERE state='approved' AND verified=1 ORDER BY id LIMIT 2000")
        ]);
        paths.push(...properties.map(p=>propertyPath(p.id,p.name)),...restaurants.map(r=>'/restaurants/'+r.id));
    }
    const content=paths.flatMap(pathname=>siteLanguages.map(locale=>`<url><loc>${escaped(urlFor(pathname,locale))}</loc>${
        alternate(pathname).map(a=>`<xhtml:link rel="alternate" hreflang="${a.lang}" href="${escaped(a.url)}"/>`).join('')}</url>`)).join('\n');
    send(req,res,200,'application/xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${content}</urlset>`);
}
function breadcrumb(page,pathname,label,locale){
    const list=[{name:siteLabel(['Home','मुख्यपृष्ठ','मुखपृष्ठ'],locale),item:urlFor('/',locale)}];
    const parent=page==='stay'?'stays':page==='restaurant'?'restaurants':null;
    if(parent)list.push({name:siteLabel(sitePages[parent].labels,locale),item:urlFor(sitePages[parent].path,locale)});
    if(page)list.push({name:label,item:urlFor(pathname,locale)});
    return {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:list.map(({name,item},index)=>({'@type':'ListItem',position:index+1,name,item}))};
}
function lodging(property,pathname,locale){
    const item={'@context':'https://schema.org','@type':/hotel|resort|lodge/i.test(property.type)?'Hotel':'LodgingBusiness',name:property.name,url:urlFor(pathname,locale),
        address:{'@type':'PostalAddress',addressLocality:property.location,addressCountry:'IN'}};
    if(property.address)item.address.streetAddress=property.address;
    if(property.description)item.description=property.description;
    if(property.image&&/^(https:\/\/|\/?(?:media|assets)\/)/.test(property.image))item.image=new URL(property.image,siteOrigin).href;
    if(Number.isFinite(property.latitude)&&Number.isFinite(property.longitude))item.geo={'@type':'GeoCoordinates',latitude:property.latitude,longitude:property.longitude};
    return item;
}
function guideMarkup(entries,locale){
    const sections=pilgrimSections.map(([id,labels])=>({id,title:siteLabel(labels,locale),items:entries.filter(row=>row.section===id)}))
        .filter(section=>section.items.length);
    if(!sections.length)return '';
    const format=new Intl.DateTimeFormat(locale+'-IN',{dateStyle:'long',timeZone:'UTC'});
    function time(value){
        return `<time datetime="${escaped(value)}">${format.format(new Date(value))}</time>`;
    }
    const sourceLabel=siteLabel(['Official source','?????? ?????','???????? ?????'],locale);
    const checkedLabel=siteLabel(['Source checked','????? ??????','????? ?? ???? ???'],locale);
    const navigation=`<nav class="pilgrim-toc" aria-label="${escaped(siteLabel(sitePages.guide.labels,locale))}">
        ${sections.map(section=>`<a class="btn outline small" href="#guide-${section.id}">${escaped(section.title)}</a>`).join('')}</nav>`;
    return navigation+sections.map(section=>`<section class="pilgrim-section" id="guide-${section.id}" aria-labelledby="guide-title-${section.id}">
        <h2 id="guide-title-${section.id}">${escaped(section.title)}</h2><div class="pilgrim-grid">${section.items.map(row=>{
            const copy=row.translations[locale];
            const content=`${row.date_value?`<p>${time(row.date_value)}</p>`:''}<p>${escaped(copy.body)}</p>
                ${row.phone?`<p><a class="pilgrim-phone text-link" href="tel:${escaped(row.phone)}">${escaped(row.phone)}</a></p>`:''}
                <p class="pilgrim-source"><a href="${escaped(row.source_url)}">${sourceLabel}</a><span>${checkedLabel} ${time(row.reviewed_on)}</span></p>`;
            return section.id==='faq'?`<details class="panel"><summary>${escaped(copy.title)}</summary>${content}</details>`:
                `<article class="panel"><h3>${escaped(copy.title)}</h3>${content}</article>`;
        }).join('')}</div></section>`).join('');
}
async function route(req,res,url){
    if(url.pathname==='/index.html'){
        res.writeHead(301,{Location:'/'+url.search});res.end();return true;
    }
    if(url.pathname==='/robots.txt'){
        send(req,res,200,'text/plain','User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: '+siteOrigin+'/sitemap.xml\n');
        return true;
    }
    if(url.pathname==='/sitemap.xml'){await sitemap(req,res);return true}
    const route=parseSitePath(url.pathname);
    if(!route)return false;
    const {locale,page}=route;
    let property,restaurant,entries=[];
    if(page==='stay')property=await propertyRecord(route.id);
    if(page==='restaurant')restaurant=await restaurantRecord(route.id);
    if(page==='guide'&&pool)entries=await pilgrim.list(true);
    const missing=(page==='stay'&&!property)||(page==='restaurant'&&!restaurant);
    if(missing){
        send(req,res,404,'text/html',`<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="robots" content="noindex"><title>MahakumbhStays</title><a href="${sitePath('/stays',locale)}">${escaped(siteLabel(sitePages.stays.labels,locale))}</a></html>`);
        return true;
    }
    const record=property||restaurant,config=sitePages[page];
    const pathname=property?propertyPath(property.id,property.name):restaurant?'/restaurants/'+restaurant.id:config.path;
    if((page==='stay'||page==='restaurant')&&url.pathname!==sitePath(pathname,locale)){
        res.writeHead(301,{Location:sitePath(pathname,locale)+url.search});res.end();return true;
    }
    const label=record?record.name:siteLabel(config.labels,locale);
    const snippet=record?.description?.trim().replace(/\s+/g,' ').slice(0,160);
    const description=snippet||(record?record.name+' · '+record.location:siteLabel(config.description,locale));
    const internal=property?'/stay/'+property.id:restaurant?'/restaurant/'+restaurant.id:page?'/'+page:'/';
    const params=new URLSearchParams(url.search);
    if(property)params.set('catalog','live');
    const initial='#'+internal+(params.size?'?'+params:'');
    const schemas=[breadcrumb(page,pathname,label,locale),...(property?[lodging(property,pathname,locale)]:[])];
    const preload=page===''?`<link rel="preload" as="image" href="/assets/indian-homestay-640.webp" media="(max-width:760px)">
        <link rel="preload" as="image" href="/assets/indian-homestay-1280.webp" media="(min-width:761px)">`:'';
    const tags=`${preload}<title>${escaped(label)} | MahakumbhStays</title><meta name="description" content="${escaped(description)}">
        <link rel="canonical" href="${escaped(urlFor(pathname,locale))}">${alternate(pathname).map(a=>`<link rel="alternate" hreflang="${a.lang}" href="${escaped(a.url)}">`).join('')}
        <script type="application/ld+json" id="site-schema">${structured(schemas)}</script>`;
    const links=Object.entries(sitePages).map(([,item])=>`<a href="${sitePath(item.path,locale)}">${escaped(siteLabel(item.labels,locale))}</a>`).join(' ');
    const snapshot=`<main class="container section" id="main-content"><h1>${escaped(label)}</h1><p>${escaped(description)}</p>
        ${record?.address?`<address>${escaped(record.address)}</address>`:''}${guideMarkup(entries,locale)}<nav>${links}</nav></main>`;
    send(req,res,200,'text/html',source.replace('<html lang="en">',`<html lang="${locale}" data-route="${escaped(initial)}" data-localized="${route.explicit||page?'true':'false'}">`)
        .replace('<!-- page-meta -->',()=>tags).replace('<!-- page-snapshot -->',()=>snapshot));
    return true;
}
module.exports={route};
