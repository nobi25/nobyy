'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'noby-review-gate-'));
process.env.DATABASE_PATH=path.join(temp,'test.sqlite');
const db=require('../src/db');
const {importLicensedDraft,replaceLocalizedPage}=require('../worker/review-gate');
let checks=0;
const check=(c,message)=>{assert.ok(c,message);checks++;};
try{
  const wid=db.prepare("INSERT INTO works(title,slug,kind,license_url,license_confirmed,published) VALUES('Original','fixture','manga','https://example.org/license',1,1)").run().lastInsertRowid;
  const cid=db.prepare("INSERT INTO chapters(work_id,chapter_no,pages_json,published) VALUES(?,'1',?,1)").run(wid,JSON.stringify(['https://example.org/old.jpg'])).lastInsertRowid;
  const manifest={title:'Reviewed import pending',slug:'fixture',kind:'manga',chapters:[{chapter_no:'1',pages:['https://example.org/new.jpg'],text_ar:'Draft text'}]};
  const result=importLicensedDraft(db,manifest,'https://example.org/manifest','https://example.org/license');
  check(result.published===false,'import reports draft');
  check(db.prepare('SELECT published FROM works WHERE id=?').get(wid).published===0,'existing published work becomes draft');
  check(db.prepare('SELECT published FROM chapters WHERE id=?').get(cid).published===0,'existing published chapter becomes draft');
  check(JSON.parse(db.prepare('SELECT pages_json FROM chapters WHERE id=?').get(cid).pages_json)[0]==='https://example.org/new.jpg','draft contains new page');
  db.prepare('UPDATE works SET published=1 WHERE id=?').run(wid);db.prepare('UPDATE chapters SET published=1 WHERE id=?').run(cid);
  assert.throws(()=>importLicensedDraft(db,{...manifest,chapters:[{chapter_no:'1',pages:['invalid']}]}));checks++;
  check(db.prepare('SELECT published FROM works WHERE id=?').get(wid).published===1,'invalid import does not change visibility');
  replaceLocalizedPage(db,wid,cid,0,'/generated/fixture.jpg');
  check(db.prepare('SELECT published FROM works WHERE id=?').get(wid).published===0,'localized work becomes draft');
  check(db.prepare('SELECT published FROM chapters WHERE id=?').get(cid).published===0,'localized chapter becomes draft');
  check(JSON.parse(db.prepare('SELECT pages_json FROM chapters WHERE id=?').get(cid).pages_json)[0]==='/generated/fixture.jpg','localized draft page');
  db.prepare('UPDATE works SET published=1 WHERE id=?').run(wid);db.prepare('UPDATE chapters SET published=1 WHERE id=?').run(cid);
  assert.throws(()=>replaceLocalizedPage(db,wid,cid,9,'/generated/invalid.jpg'));checks++;
  check(db.prepare('SELECT published FROM works WHERE id=?').get(wid).published===1,'failed localization leaves prior content unchanged');
  console.log(`PASS: ${checks} review-gate checks; no network or LLM calls.`);
}finally{db.close();fs.rmSync(temp,{recursive:true,force:true});}
