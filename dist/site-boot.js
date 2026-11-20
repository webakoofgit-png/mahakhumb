const serverLocale=siteLocale(document.documentElement.lang);
const initialSiteRoute=document.documentElement.dataset.route;
let savedLocale;
try{savedLocale=localStorage.getItem('mks-locale')}catch{}
let activeLocale=document.documentElement.dataset.localized==='true'?serverLocale:siteLocale(savedLocale);
document.documentElement.lang=activeLocale;
let initialSiteAnchor=/^#guide-[a-z]+$/.test(location.hash)?location.hash.slice(1):null;
if((!location.hash||initialSiteAnchor)&&initialSiteRoute&&initialSiteRoute!=='#/'){
    history.replaceState(null,'',location.pathname+initialSiteRoute);
}
function pictureVariants(image){
    if(!/^\/assets\/indian-[a-z-]+-1280\.webp$/.test(image||''))return '';
    return `srcset="${image.replace('-1280.webp','-640.webp')} 640w, ${image} 1280w" sizes="(max-width: 760px) 95vw, 420px" width="1280" height="853" decoding="async"`;
}
const siteCanonical=document.querySelector('link[rel="canonical"]');
const canonicalOrigin=siteCanonical?new URL(siteCanonical.href).origin:location.origin;
const driverScript=document.createElement('script');driverScript.defer=true;driverScript.src='/driver-dashboard.js';document.head.appendChild(driverScript);
