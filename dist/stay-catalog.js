const images={hotel:'/assets/indian-budget-1280.webp',resort:'/assets/indian-retreat-1280.webp',room:'/assets/indian-retreat-1280.webp',home:'/assets/indian-homestay-1280.webp',tent:'/assets/indian-tent-village-1280.webp',temple:'https://upload.wikimedia.org/wikipedia/commons/3/39/Trimbakeshwar_temple_front_view.jpg',river:'https://upload.wikimedia.org/wikipedia/commons/6/64/Nasik%2C_Ramkund_%286362131297%29.jpg',bed:'/assets/indian-budget-1280.webp'};
const properties=[
{id:1,name:'Godavari Grove Retreat',location:'Nashik City',type:'Premium Hotels & Resorts',price:4200,distance:5.2,image:images.resort,tag:'A little more extraordinary',capacity:4,amenities:['Wi-Fi','Parking','Air conditioning','Attached bathroom']},
{id:2,name:'The Courtyard at Trimbak',location:'Trimbakeshwar',type:'Homestays',price:2800,distance:1.2,image:images.home,tag:'Feel at home',capacity:6,amenities:['Wi-Fi','Parking','Attached bathroom']},
{id:3,name:'Panchavati Heritage Stay',location:'Panchavati / Ramkund',type:'Budget Hotels',price:1800,distance:.8,image:images.hotel,tag:'Close to the sacred ghats',capacity:3,amenities:['Wi-Fi','Air conditioning','Attached bathroom']},
{id:4,name:'Sahyadri Canvas Camp',location:'Surrounding Areas',type:'Tent Cities',price:2200,distance:8,image:images.tent,tag:'Under the open sky',capacity:4,amenities:['Parking','Attached bathroom']},
{id:5,name:'Shanti Pilgrim Dharamshala',location:'Trimbakeshwar',type:'Dharamshalas',price:900,distance:.6,image:images.bed,tag:'Simple, peaceful stays',capacity:6,amenities:['Parking','Attached bathroom']},
{id:6,name:'Nashik Road Comfort Inn',location:'Nashik Road',type:'Budget Hotels',price:1500,distance:9.4,image:images.room,tag:'Easy arrivals',capacity:3,amenities:['Wi-Fi','Parking','Air conditioning','Attached bathroom']},
{id:7,name:'Vineyard Hills Resort',location:'Surrounding Areas',type:'Premium Hotels & Resorts',price:6500,distance:12,image:images.resort,tag:'Space to slow down',capacity:4,amenities:['Wi-Fi','Parking','Air conditioning','Attached bathroom']},
{id:8,name:'Ramkund Family Homestay',location:'Panchavati / Ramkund',type:'Homestays',price:2400,distance:.4,image:images.home,tag:'Made for families',capacity:8,amenities:['Wi-Fi','Parking','Attached bathroom']},
{id:9,name:'Anand Yatri Niwas',location:'Nashik City',type:'Dharamshalas',price:1100,distance:3.6,image:images.hotel,tag:'A restful pilgrimage',capacity:5,amenities:['Parking','Attached bathroom']},
{id:10,name:'Trimbak Valley Tent Village',location:'Trimbakeshwar',type:'Tent Cities',price:3200,distance:4.1,image:images.tent,tag:'A stay closer to nature',capacity:4,amenities:['Parking','Attached bathroom']}
];
const locations=['Nashik City','Trimbakeshwar','Panchavati / Ramkund','Nashik Road','Surrounding Areas','Sinnar','Igatpuri'];
const categories=['Budget Hotels','Premium Hotels & Resorts','Homestays','Dharamshalas','Tent Cities','Dormitories','Lodges','Hotels','Resorts'];
const stayDestinations=['All destinations','Nashik',...locations];
const landmarks=['Ramkund','Trimbakeshwar temple','Nashik','Trimbakeshwar','Godavari Ghats'];
const searchDefaults={destination:'All destinations',checkin:'2027-07-15',checkout:'2027-07-17',guests:2,rooms:1,type:'All stays',min:0,max:1000000,page:1,amenities:[],sort:'recommended',capacity:1,distance:250,minDistance:0,landmark:'',adults:2,children:0,verified:false};
const stayAmenities=['Air conditioning','Non-AC','Parking','Wi-Fi','Attached bathroom','Family-friendly','Wheelchair accessibility','Pure veg restaurant','Jain food','Free cancellation','Bulk group accommodation'];
function destinationLocations(destination){
    if(destination==='All destinations')return [];
    if(destination==='Nashik')return ['Nashik City','Nashik Road','Panchavati / Ramkund','Nashik'];
    if(destination==='Surrounding Areas')return ['Surrounding Areas','Sinnar','Igatpuri'];
    return [destination];
}
function validSearchDate(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
    const date=new Date(value+'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10)===value;
}
function parseStaySearch(params){
    const choice=(key,values)=>values.includes(params.get(key))?params.get(key):searchDefaults[key];
    const number=(key,min,max)=>{
        const value=params.get(key);
        return /^\d+$/.test(value||'') && +value>=min && +value<=max?+value:searchDefaults[key];
    };
    const checkin=params.get('checkin'),checkout=params.get('checkout');
    const validDates=validSearchDate(checkin)&&validSearchDate(checkout)&&checkout>checkin;
    const adults=number('adults',1,16),children=number('children',0,12);
    const distance=number('distance',1,250);
    return {...searchDefaults,
        destination:choice('destination',stayDestinations),type:choice('type',['All stays',...categories]),
        checkin:validDates?checkin:searchDefaults.checkin,checkout:validDates?checkout:searchDefaults.checkout,
        adults,children,guests:adults+children,rooms:number('rooms',1,30),page:number('page',1,10000),
        min:number('min',0,1000000),max:number('max',0,1000000),capacity:number('capacity',1,30),
        distance,minDistance:Math.min(distance,number('minDistance',0,50)),
        landmark:choice('landmark',landmarks),verified:params.get('verified')==='true',
        sort:choice('sort',['recommended','price','price-desc','distance','rating']),
        amenities:params.getAll('amenities').filter(item=>stayAmenities.includes(item))
    };
}

if(typeof module!=='undefined')module.exports={properties,searchDefaults,parseStaySearch,validSearchDate,destinationLocations};
