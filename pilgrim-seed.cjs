const origin='https://simhasthamahakumbh.maharashtra.gov.in';
const reviewed='2026-11-19';
const languages=['en','mr','hi'];
function entry(id,section,path,en,mr,hi,extra={}){
    return {id,section,source:origin+path,reviewed,translations:Object.fromEntries(languages.map((code,i)=>[code,{title:[en,mr,hi][i][0],body:[en,mr,hi][i][1]}])),...extra};
}
const snan=[
    ['first','2027-08-02','First Amrut Snan','पहिले अमृत स्नान','पहला अमृत स्नान','Nashik','नाशिक','नासिक'],
    ['second','2027-08-31','Second Amrut Snan','दुसरे अमृत स्नान','दूसरा अमृत स्नान','Nashik','नाशिक','नासिक'],
    ['third-nashik','2027-09-11','Third Amrut Snan','तिसरे अमृत स्नान','तीसरा अमृत स्नान','Ramtirth, Nashik','रामतीर्थ, नाशिक','रामतीर्थ, नासिक'],
    ['third-trimbak','2027-09-12','Third Amrut Snan','तिसरे अमृत स्नान','तीसरा अमृत स्नान','Kushavarta Tirth, Trimbakeshwar','कुशावर्त तीर्थ, त्र्यंबकेश्वर','कुशावर्त तीर्थ, त्र्यंबकेश्वर']
];
const entries=[
    ...snan.map(([id,date,en,mr,hi,a,b,c])=>entry('snan-'+id,'dates','/snan-calendar',[en,a],[mr,b],[hi,c],{date})),
    entry('sites','locations','/maha-kumbh-information-hub',['Nashik and Trimbakeshwar','Explore Panchavati in Nashik and the Trimbakeshwar pilgrimage area. Use the authority’s visitor hub for details about the sacred sites.'],
        ['नाशिक आणि त्र्यंबकेश्वर','नाशिकमधील पंचवटी आणि त्र्यंबकेश्वर तीर्थक्षेत्राविषयी जाणून घ्या. धार्मिक स्थळांच्या माहितीसाठी प्राधिकरणाचे माहिती केंद्र पाहा.'],
        ['नासिक और त्र्यंबकेश्वर','नासिक की पंचवटी और त्र्यंबकेश्वर तीर्थक्षेत्र के बारे में जानें। धार्मिक स्थलों की जानकारी के लिए प्राधिकरण का सूचना केंद्र देखें।']),
    entry('main-ghats','ghats','/faqs',['Main bathing sites','The two principal bathing sites are Ramtirth in Nashik and Kushavarta Tirth in Trimbakeshwar.'],
        ['मुख्य स्नानस्थळे','नाशिकमधील रामतीर्थ आणि त्र्यंबकेश्वरमधील कुशावर्त तीर्थ ही दोन मुख्य स्नानस्थळे आहेत.'],
        ['मुख्य स्नान स्थल','नासिक का रामतीर्थ और त्र्यंबकेश्वर का कुशावर्त तीर्थ दो मुख्य स्नान स्थल हैं।']),
    entry('reach','transport','/how-to-reach',['Getting to the Kumbh','Check the authority’s road, rail and air guidance before departure. Confirm local traffic restrictions and onward routes in the live updates.'],
        ['कुंभमेळ्याला कसे पोहोचावे','निघण्यापूर्वी रस्ते, रेल्वे आणि हवाई प्रवासाबद्दल प्राधिकरणाचे मार्गदर्शन पाहा. स्थानिक वाहतूक निर्बंध आणि पुढील मार्गांसाठी ताज्या सूचना तपासा.'],
        ['कुंभ मेले तक कैसे पहुँचें','रवाना होने से पहले सड़क, रेल और हवाई यात्रा पर प्राधिकरण का मार्गदर्शन देखें। स्थानीय यातायात प्रतिबंध और आगे के मार्गों के लिए ताज़ा सूचनाएँ जाँचें।']),
    entry('parking','transport','/directions-to-ghats-and-parking',['Ghats, parking and shuttle guidance','Consult the official directions for parking and your onward journey to the ghats. Check current shuttle arrangements on the day you travel.'],
        ['घाट, वाहनतळ आणि शटल मार्गदर्शन','वाहनतळ आणि घाटापर्यंतच्या प्रवासासाठी अधिकृत सूचना पाहा. प्रवासाच्या दिवशी शटलची व्यवस्था तपासा.'],
        ['घाट, पार्किंग और शटल','पार्किंग और घाट तक जाने के लिए आधिकारिक निर्देश देखें। यात्रा के दिन शटल व्यवस्था की पुष्टि करें।']),
    entry('emergency','emergency','/emergency-contacts',['Emergency services','For urgent help, dial the emergency number below.'],['आपत्कालीन सेवा','तातडीच्या मदतीसाठी खालील आपत्कालीन क्रमांकावर संपर्क साधा.'],['आपातकालीन सेवाएँ','तत्काल सहायता के लिए नीचे दिया गया आपातकालीन नंबर मिलाएँ।'],{phone:'112'}),
    entry('ambulance','emergency','/emergency-contacts',['Ambulance','Call the ambulance number for emergency medical transport.'],['रुग्णवाहिका','तातडीच्या वैद्यकीय वाहतुकीसाठी रुग्णवाहिकेच्या क्रमांकावर संपर्क साधा.'],['एम्बुलेंस','आपातकालीन चिकित्सा परिवहन के लिए एम्बुलेंस नंबर पर कॉल करें।'],{phone:'108'}),
    entry('access','accessibility','/accessibility-guidance',['Accessibility guidance','Check the authority’s accessibility guidance and facilities map for confirmed services. Ask the venue about step-free access and assistance before travel.'],
        ['सुलभतेसाठी मार्गदर्शन','उपलब्ध सेवांसाठी प्राधिकरणाचे सुलभता मार्गदर्शन आणि सुविधा नकाशा पाहा. प्रवासापूर्वी पायऱ्यांशिवाय प्रवेश आणि मदतीबाबत ठिकाणाशी संपर्क साधा.'],
        ['सुगम्यता मार्गदर्शन','पुष्ट सेवाओं के लिए प्राधिकरण की सुगम्यता जानकारी और सुविधा मानचित्र देखें। यात्रा से पहले सीढ़ी-रहित प्रवेश और सहायता के बारे में आयोजन स्थल से पूछें।']),
    entry('faq-help','faq','/faqs',['Where can I check local arrangements?','The authority publishes confirmed travel arrangements and safety information on its official site. Check the FAQs and live updates before you leave.'],
        ['स्थानिक व्यवस्था कुठे तपासावी?','प्राधिकरण आपल्या अधिकृत संकेतस्थळावर प्रवास व्यवस्था आणि सुरक्षेची माहिती जाहीर करते. निघण्यापूर्वी प्रश्नोत्तरे आणि ताज्या सूचना पाहा.'],
        ['स्थानीय व्यवस्था कहाँ जाँचें?','प्राधिकरण अपने आधिकारिक पोर्टल पर पुष्ट यात्रा व्यवस्था और सुरक्षा जानकारी प्रकाशित करता है। निकलने से पहले सामान्य प्रश्न और ताज़ा सूचनाएँ देखें।']),
    entry('live-updates','advisories','/live-updates',['Check official live advisories','Use the authority’s live updates for current travel and safety announcements.'],
        ['अधिकृत ताज्या सूचना पाहा','सध्याच्या प्रवास आणि सुरक्षा सूचनांसाठी प्राधिकरणाचे ताजे अपडेट पाहा.'],
        ['आधिकारिक ताज़ा सूचनाएँ देखें','वर्तमान यात्रा और सुरक्षा घोषणाओं के लिए प्राधिकरण के ताज़ा अपडेट देखें।'])
];
module.exports=entries;
