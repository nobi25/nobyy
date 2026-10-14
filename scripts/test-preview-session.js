'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'noby-preview-session-'));
const env={...process.env,PORT:'3140',NODE_ENV:'test',PUBLIC_PREVIEW:'true',DATABASE_PATH:path.join(temp,'test.sqlite'),SESSION_DIR:path.join(temp,'sessions'),SESSION_SECRET:'isolated-preview-session-test-1234567890',NOBY_PUBLIC_ORIGINS:'https://test-preview.invalid',ADMIN_EMAIL:'',ADMIN_PASSWORD:''};
const child=spawn(process.execPath,[path.join(__dirname,'../src/server.js')],{env,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:3140/api/health')).ok)break;}catch{}await sleep(100);}
    const headers={'Content-Type':'application/json','X-Forwarded-Proto':'https',Origin:'https://test-preview.invalid'};
    const r=await fetch('http://127.0.0.1:3140/api/auth/register',{method:'POST',headers,body:JSON.stringify({email:'preview@fixture.invalid',username:'preview_fixture',password:'Isolated-Preview-123!'})});
    assert.equal(r.status,201);
    const cookie=r.headers.get('set-cookie');assert.ok(cookie.includes('Secure'));assert.ok(cookie.includes('SameSite=None'));assert.ok(cookie.includes('HttpOnly'));
    const me=await fetch('http://127.0.0.1:3140/api/me',{headers:{...headers,Cookie:cookie.split(';')[0]}});
    assert.ok((await me.json()).user);assert.ok(!me.headers.has('x-frame-options'));assert.ok(!me.headers.get('content-security-policy').includes('frame-ancestors'));
    console.log('PASS: 7 HTTPS Preview checks — Secure, HttpOnly, SameSite=None, session persistence, allowed origin, embedding headers.');
  }catch(e){console.error(e.stack);process.exitCode=1;}
  finally{child.kill('SIGTERM');await sleep(200);fs.rmSync(temp,{recursive:true,force:true});}
})();
