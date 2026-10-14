#!/usr/bin/env node
/* Publisher-authorized HTTPS JSON import only. All imported updates are drafts. */
require('dotenv').config();
const dns=require('node:dns/promises');
const net=require('node:net');
const crypto=require('node:crypto');
const Database=require('better-sqlite3');
const path=require('node:path');
const {importLicensedDraft}=require('./review-gate');
const db=new Database(path.resolve(process.env.DATABASE_PATH||'./data/noby.sqlite'));
db.pragma('foreign_keys = ON');
const args=Object.fromEntries(process.argv.slice(2).reduce((result,value,index,all)=>{
  if(value.startsWith('--'))result.push([value.slice(2),all[index+1]&&!all[index+1].startsWith('--')?all[index+1]:true]);
  return result;
},[]));
const allowed=new Set((process.env.INGEST_ALLOWLIST||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean));
function privateIp(ip){
  if(net.isIPv4(ip)){const p=ip.split('.').map(Number);return p[0]===10||p[0]===127||p[0]===0||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]>=224;}
  if(net.isIPv6(ip)){const x=ip.toLowerCase();return x==='::1'||x==='::'||x.startsWith('fc')||x.startsWith('fd')||x.startsWith('fe80:')||x.startsWith('::ffff:127.')||x.startsWith('::ffff:10.');}
  return true;
}
async function safeUrl(raw){
  let u;try{u=new URL(raw);}catch{throw Error('Invalid URL');}
  if(u.protocol!=='https:')throw Error('Only HTTPS URLs are accepted');
  if(u.username||u.password)throw Error('Credentials in URLs are forbidden');
  const host=u.hostname.toLowerCase();if(!allowed.has(host))throw Error(`Host ${host} is not on INGEST_ALLOWLIST`);
  if(net.isIP(host)){if(privateIp(host))throw Error('Private IPs are forbidden');}
  else{const records=await dns.lookup(host,{all:true,verbatim:true});if(!records.length||records.some(r=>privateIp(r.address)))throw Error('Host resolves to a private or restricted address');}
  return u;
}
async function fetchSafe(url){
  const u=await safeUrl(url),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch(u,{signal:controller.signal,redirect:'manual',headers:{Accept:'application/json','User-Agent':'Noby-LicensedImporter/1.1 (contact: site-admin)'}});
    if(r.status>=300&&r.status<400)throw Error('Redirects are disabled; use the final allowlisted HTTPS URL');
    if(!r.ok)throw Error(`Source returned HTTP ${r.status}`);
    if(!(r.headers.get('content-type')||'').includes('application/json'))throw Error('Source must provide a publisher-authorized application/json manifest');
    if(Number(r.headers.get('content-length')||0)>2_000_000)throw Error('Manifest too large');
    const text=await r.text();if(text.length>2_000_000)throw Error('Manifest too large');
    return JSON.parse(text);
  }finally{clearTimeout(timer);}
}
(async()=>{
  try{
    if(!args.url||!args['license-url']||args['license-confirmed']!==true)throw Error('Usage: node worker/pipeline.js --url https://allowed.example/manifest.json --license-confirmed --license-url https://allowed.example/license');
    if(!allowed.size)throw Error('INGEST_ALLOWLIST is empty. Add only authorized publishers.');
    const license=await safeUrl(args['license-url']);
    const manifest=await fetchSafe(args.url);
    if(!manifest||!manifest.title||!manifest.kind||!Array.isArray(manifest.chapters)||manifest.chapters.length>500)throw Error('Manifest requires title, kind and chapters[] (max 500)');
    const workSlug=String(manifest.slug||manifest.title).toLowerCase().normalize('NFKD').replace(/[^a-z0-9\u0600-\u06ff]+/g,'-').replace(/^-|-$/g,'').slice(0,100)||crypto.randomBytes(6).toString('hex');
    // Complete network checks before opening the database transaction.
    const chapters=[];
    for(const c of manifest.chapters){
      if(c.chapter_no===undefined||!Array.isArray(c.pages)||c.pages.length>500)throw Error('Each chapter needs chapter_no and pages[] (max 500)');
      const pages=[];for(const raw of c.pages)pages.push((await safeUrl(raw)).href);
      chapters.push({chapter_no:String(c.chapter_no).slice(0,30),title:String(c.title||'').slice(0,180),pages,text_ar:String(c.text_ar||'').slice(0,100000)});
    }
    const result=importLicensedDraft(db,{title:String(manifest.title).slice(0,180),slug:workSlug,kind:String(manifest.kind).slice(0,40),synopsis:String(manifest.synopsis||'').slice(0,4000),chapters},args.url,license.href);
    console.log(JSON.stringify({ok:true,...result,review_required:true,license_url:license.href},null,2));
  }catch(e){console.error(`Import stopped: ${e.message}`);process.exitCode=1;}
  finally{db.close();}
})();
