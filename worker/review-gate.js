'use strict';
const {z}=require('zod');
const manifestSchema=z.object({
  title:z.string().min(1).max(180),slug:z.string().min(1).max(100),kind:z.string().min(1).max(40),synopsis:z.string().max(4000).default(''),
  chapters:z.array(z.object({chapter_no:z.union([z.string(),z.number()]).transform(String).refine(s=>s.length>0&&s.length<=30),title:z.string().max(180).default(''),pages:z.array(z.string().url()).max(500),text_ar:z.string().max(100000).default('')})).max(500)
});
function importLicensedDraft(db,input,sourceUrl,licenseUrl){
  const manifest=manifestSchema.parse(input);
  return db.transaction(()=>{
    const existing=db.prepare('SELECT id FROM works WHERE slug=?').get(manifest.slug);
    let workId;
    if(existing){
      workId=existing.id;
      db.prepare(`UPDATE works SET title=?,kind=?,synopsis=?,source_url=?,license_url=?,license_confirmed=1,published=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(manifest.title,manifest.kind,manifest.synopsis,sourceUrl,licenseUrl,workId);
    }else{
      workId=db.prepare('INSERT INTO works(title,slug,kind,synopsis,source_url,license_url,license_confirmed,published) VALUES(?,?,?,?,?,?,1,0)').run(manifest.title,manifest.slug,manifest.kind,manifest.synopsis,sourceUrl,licenseUrl).lastInsertRowid;
    }
    const put=db.prepare(`INSERT INTO chapters(work_id,chapter_no,title,pages_json,text_ar,published) VALUES(?,?,?,?,?,0)
      ON CONFLICT(work_id,chapter_no) DO UPDATE SET title=excluded.title,pages_json=excluded.pages_json,text_ar=excluded.text_ar,published=0`);
    for(const c of manifest.chapters)put.run(workId,c.chapter_no,c.title,JSON.stringify(c.pages),c.text_ar);
    return {work_id:workId,chapters_upserted:manifest.chapters.length,published:false};
  })();
}
function replaceLocalizedPage(db,workId,chapterId,index,newPath){
  return db.transaction(()=>{
    const chapter=db.prepare('SELECT pages_json FROM chapters WHERE id=? AND work_id=?').get(chapterId,workId);
    if(!chapter)throw Error('Chapter is not part of the licensed work');
    const pages=JSON.parse(chapter.pages_json);
    if(!Number.isInteger(index)||index<0||index>=pages.length)throw Error('page_index is outside chapter pages');
    pages[index]=newPath;
    // Both visibility changes and the new content commit together, never separately.
    db.prepare('UPDATE works SET published=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(workId);
    db.prepare('UPDATE chapters SET pages_json=?,published=0 WHERE id=?').run(JSON.stringify(pages),chapterId);
    return {review_required:true,published:false};
  })();
}
module.exports={importLicensedDraft,replaceLocalizedPage};
