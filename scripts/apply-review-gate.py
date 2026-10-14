from pathlib import Path
p=Path(__file__).resolve().parents[1]/'worker'/'auto-localizer.js'
s=p.read_text()
if "require('./review-gate')" not in s:
    needle="const db=new Database(path.resolve(process.env.DATABASE_PATH||'./data/noby.sqlite'));"
    assert s.count(needle)==1
    s=s.replace(needle,"const {replaceLocalizedPage}=require('./review-gate');\n"+needle+"\ndb.pragma('foreign_keys = ON');")
old="db.prepare('UPDATE chapters SET pages_json=? WHERE id=?').run(JSON.stringify(pages),chapter.id);"
new="replaceLocalizedPage(db,work.id,chapter.id,index,pages[index]);"
if old in s:
    assert s.count(old)==1
    s=s.replace(old,new)
assert new in s
p.write_text(s)
print('Localization commits new pages and draft visibility atomically; external providers were not called.')
