const {pool,transaction}=require('./booking-db.cjs');
const {fail,json}=require('./booking-engine.cjs');
const {audit,requirePermission,text}=require('./operations-auth.cjs');
const {validSearchDate}=require('./dist/stay-catalog.js');
const sections=['dates','locations','ghats','transport','emergency','accessibility','faq','advisories'];
const languages=['en','mr','hi'];
const today=()=>new Date(Date.now()+19800000).toISOString().slice(0,10);
async function list(publicOnly=false){
    const [rows]=await pool.execute(`SELECT id,section,translations,date_value,phone,source_url,reviewed_on,expires_on,state
        FROM mks_pilgrim_entries ${publicOnly?"WHERE state='published' AND (expires_on IS NULL OR expires_on>=?)":''}
        ORDER BY COALESCE(date_value,'9999-12-31'),id`,publicOnly?[today()]:[]);
    return rows.map(row=>({...row,translations:json(row.translations)}));
}
function officialSource(input){
    let url;
    try{url=new URL(text(input,1024))}catch{throw fail(400,'Enter an official HTTPS source URL.')}
    if(url.protocol!=='https:'||!/(^|\.)gov\.in$/.test(url.hostname)||url.username||url.password||url.port){
        throw fail(400,'Use an official Indian government HTTPS source (gov.in).');
    }
    return url.href;
}
async function save(user,id,input){
    requirePermission(user,'cms');
    if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id||'')||!sections.includes(input.section)||!['draft','published','archived'].includes(input.state))throw fail(400,'Choose a valid guide entry, section and publication status.');
    const translations=Object.fromEntries(languages.map(lang=>[lang,{title:text(input[lang+'Title'],180),body:text(input[lang+'Body'],4000)}]));
    const source=officialSource(input.source);
    const reviewed=input.reviewed,expiry=input.expiry||null,date=input.date||null,phone=input.phone||null;
    if(!validSearchDate(reviewed)||reviewed>today())throw fail(400,'Enter the date on which you verified the source.');
    if((expiry&&(!validSearchDate(expiry)||expiry<reviewed))||(date&&!validSearchDate(date))||(input.section==='dates'&&!date))throw fail(400,'Enter valid event and expiry dates.');
    if((phone&&!/^\d{3,12}$/.test(phone))||(input.section==='emergency'&&!phone))throw fail(400,'Enter an official emergency number using digits only.');
    if(input.state==='published'&&input.verified!==true)throw fail(400,'Confirm the content against the official source before publishing.');
    return transaction(async db=>{
        const [[prior]]=await db.execute('SELECT state,source_url FROM mks_pilgrim_entries WHERE id=? FOR UPDATE',[id]);
        await db.execute(`INSERT INTO mks_pilgrim_entries(id,section,translations,date_value,phone,source_url,reviewed_on,expires_on,state) VALUES (?,?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE section=VALUES(section),translations=VALUES(translations),date_value=VALUES(date_value),phone=VALUES(phone),
            source_url=VALUES(source_url),reviewed_on=VALUES(reviewed_on),expires_on=VALUES(expires_on),state=VALUES(state)`,
            [id,input.section,JSON.stringify(translations),date,phone,source,reviewed,expiry,input.state]);
        await audit(db,user,'pilgrim.content.save',id,{before:prior,after:{state:input.state,source,reviewed}});
        return {id};
    });
}
module.exports={list,save,sections};
