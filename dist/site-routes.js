const siteLanguages=['en','mr','hi'];
const sitePages={
    '':{path:'/',labels:['Stays for Nashik Kumbh','नाशिक कुंभासाठी निवास','नासिक कुंभ के लिए ठहराव'],
        description:['Find accommodation and plan your visit to the Nashik and Trimbakeshwar Simhastha Kumbh.','नाशिक आणि त्र्यंबकेश्वर सिंहस्थ कुंभासाठी निवास शोधा आणि प्रवासाचे नियोजन करा.','नासिक और त्र्यंबकेश्वर सिंहस्थ कुंभ के लिए आवास खोजें और अपनी यात्रा की योजना बनाएँ।']},
    stays:{path:'/stays',labels:['Find accommodation','निवास शोधा','आवास खोजें'],
        description:['Search hotels, homestays and pilgrim accommodation by location, travel dates, and room preferences.','ठिकाण, प्रवासाच्या तारखा आणि खोल्यांच्या पसंतीनुसार हॉटेल, होमस्टे आणि यात्रेकरू निवास शोधा.','स्थान, यात्रा की तिथियों और कमरों की पसंद के अनुसार होटल, होमस्टे और तीर्थयात्री आवास खोजें।']},
    guide:{path:'/pilgrim-guide',labels:['Nashik Kumbh pilgrim guide','नाशिक कुंभ यात्रेकरू मार्गदर्शिका','नासिक कुंभ तीर्थयात्री मार्गदर्शिका'],
        description:['Official bathing dates, ghats, transportation, accessibility guidance and emergency contacts for Nashik Kumbh.','नाशिक कुंभाच्या अधिकृत स्नानतारखा, घाट, वाहतूक, सुलभता आणि आपत्कालीन संपर्क.','नासिक कुंभ की आधिकारिक स्नान तिथियाँ, घाट, परिवहन, सुगम्यता और आपातकालीन संपर्क।']},
    'group-stays':{path:'/group-stays',labels:['Bulk group accommodation','समूह निवास','समूह आवास'],
        description:['Request a group accommodation quote for pilgrimages, tours and family groups of ten or more.','दहा किंवा अधिक व्यक्तींच्या यात्रा, सहली आणि कुटुंबांसाठी समूह निवासाचा दर मागवा.','दस या अधिक लोगों की तीर्थयात्रा, भ्रमण और परिवारों के लिए समूह आवास का मूल्य प्रस्ताव माँगें।']},
    cabs:{path:'/transport',labels:['Cab and transportation','टॅक्सी आणि वाहतूक','टैक्सी और परिवहन'],
        description:['Request local transport, airport or railway pickup, hotel-to-ghat travel and group trips.','स्थानिक वाहतूक, विमानतळ किंवा रेल्वे स्थानकावरून पिकअप, हॉटेल ते घाट आणि समूह प्रवासासाठी चौकशी करा.','स्थानीय परिवहन, हवाई अड्डे या रेलवे स्टेशन से पिकअप, होटल से घाट और समूह यात्रा का अनुरोध करें।']},
    restaurants:{path:'/restaurants',labels:['Pure veg restaurants','शुद्ध शाकाहारी उपाहारगृहे','शुद्ध शाकाहारी रेस्तराँ'],
        description:['Browse verified pure vegetarian dining with Jain and Satvik options and group seating.','जैन आणि सात्त्विक पर्याय व समूह आसनव्यवस्था असलेली सत्यापित शुद्ध शाकाहारी उपाहारगृहे शोधा.','जैन और सात्त्विक विकल्प तथा समूह बैठने की सुविधा वाले सत्यापित शुद्ध शाकाहारी रेस्तराँ खोजें।']},
    'list-property':{path:'/list-your-property',labels:['List your property','तुमची मालमत्ता नोंदवा','अपनी संपत्ति सूचीबद्ध करें'],
        description:['Apply to list a hotel or rental stay for Nashik Kumbh travellers.','नाशिक कुंभ प्रवाशांसाठी हॉटेल किंवा भाड्याचे निवासस्थान नोंदवण्यासाठी अर्ज करा.','नासिक कुंभ यात्रियों के लिए होटल या किराये का आवास सूचीबद्ध करने के लिए आवेदन करें।']},
    support:{path:'/support',labels:['Help and support','मदत आणि सहाय्य','सहायता और समर्थन'],
        description:['Get help with travel enquiries, accommodation and accessibility requests.','प्रवास, निवास आणि सुलभतेसंबंधी चौकशीसाठी मदत मिळवा.','यात्रा, आवास और सुगम्यता संबंधी अनुरोधों के लिए सहायता पाएँ।']}
};
const pilgrimSections=[
    ['dates',['Important bathing dates','???????????? ??????????','?????????? ????? ???????']],
    ['locations',['Religious locations','??????? ?????','??????? ????']],
    ['ghats',['Ghats','???','???']],
    ['transport',['Transportation guidance','?????? ??????????','?????? ??????????']],
    ['emergency',['Emergency contacts','????????? ??????','????????? ??????']],
    ['accessibility',['Accessibility assistance','?????????? ??????','???????? ??????']],
    ['faq',['FAQs','??????? ??????? ?????? ??????','????? ???? ???? ???? ??????']],
    ['advisories',['Travel advisories','?????? ?????','?????? ???????']]
];
function siteLocale(locale){return siteLanguages.includes(locale)?locale:'en'}
function siteLabel(values,locale){return values[siteLanguages.indexOf(siteLocale(locale))]}
function sitePath(path,locale){return siteLocale(locale)==='en'?path:'/'+locale+(path==='/'?'':path)}
function propertyPath(id,name){
    const slug=String(name).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90).replace(/-+$/,'');
    return '/stays/'+id+'-'+(slug||'property');
}
function parseSitePath(pathname){
    const segments=pathname.split('/').filter(Boolean);
    const explicit=siteLanguages.includes(segments[0]);
    const locale=explicit?segments.shift():'en';
    const path='/'+segments.join('/');
    const page=Object.keys(sitePages).find(key=>sitePages[key].path===path);
    if(page!==undefined)return {locale,page,explicit};
    const property=path.match(/^\/stays\/(\d+)(?:-[a-z0-9-]+)?$/i);
    if(property)return {locale,page:'stay',id:Number(property[1]),explicit};
    const restaurant=path.match(/^\/restaurants\/(\d+)$/);
    if(restaurant)return {locale,page:'restaurant',id:Number(restaurant[1]),explicit};
    return null;
}
if(typeof module!=='undefined')module.exports={siteLanguages,sitePages,siteLocale,siteLabel,sitePath,propertyPath,parseSitePath,pilgrimSections};
