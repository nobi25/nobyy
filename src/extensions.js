'use strict';
const crypto = require('node:crypto');
const { z } = require('zod');

module.exports = function install(app, db, helpers) {
  const { currentUser, requireAuth, requireRole, audit, fail, roles } = helpers;
  db.exec(`CREATE TABLE IF NOT EXISTS notification_state (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    read_at TEXT, hidden INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id, notification_id));`);
  db.exec(`CREATE TABLE IF NOT EXISTS work_visits (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    visited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,work_id));`);

  // Browser state changes must originate from this application and use JSON.
  const origins = new Set((process.env.NOBY_PUBLIC_ORIGINS || '').split(',').filter(Boolean));
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin) {
      let host;
      try { host = new URL(origin).host; } catch { return fail(res, 403, 'مصدر الطلب غير صالح'); }
      if (!origins.has(origin) && host !== req.get('host')) return fail(res, 403, 'مصدر الطلب غير مسموح');
    }
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
      return fail(res, 415, 'يجب إرسال الطلب بصيغة JSON');
    }
    next();
  });

  app.get('/api/works/slug/:slug', (req, res, next) => {
    const user=currentUser(req);
    const work=db.prepare('SELECT id FROM works WHERE slug=? AND published=1').get(req.params.slug);
    if (user && work) db.prepare(`INSERT INTO work_visits(user_id,work_id) VALUES(?,?)
      ON CONFLICT(user_id,work_id) DO UPDATE SET visited_at=CURRENT_TIMESTAMP`).run(user.id,work.id);
    next();
  });

  app.post('/api/reports', (req, res, next) => {
    const tables={work:'works',chapter:'chapters',comment:'comments',user:'users'};
    const table=tables[req.body.target_type];
    if(table){
      if(!Number.isInteger(req.body.target_id)||req.body.target_id<1) return fail(res,400,'حدد هدفًا صالحًا لهذا البلاغ.');
      if(!db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(req.body.target_id)) return fail(res,404,'هدف البلاغ غير موجود.');
    } else if(req.body.target_type==='other' && req.body.target_id!==undefined) return fail(res,400,'البلاغ العام لا يحتاج معرّف هدف.');
    next();
  });

  app.get('/api/profile/preferences', requireAuth, (req,res) => {
    const uid=currentUser(req).id;
    db.prepare(`INSERT OR IGNORE INTO user_preferences(user_id,theme,reader_background) VALUES(?,'light','#f8f6f0')`).run(uid);
    res.json({preferences:db.prepare('SELECT * FROM user_preferences WHERE user_id=?').get(uid)});
  });

  const notifications = uid => db.prepare(`
    SELECT n.*, s.read_at FROM notifications n
    LEFT JOIN notification_state s ON s.notification_id=n.id AND s.user_id=?
    WHERE (n.user_id IS NULL OR n.user_id=?) AND COALESCE(s.hidden,0)=0
    ORDER BY n.id DESC LIMIT 100`).all(uid, uid);

  app.get('/api/notifications', requireAuth, (req, res) => res.json({ notifications: notifications(currentUser(req).id) }));
  app.patch('/api/notifications/read-all', requireAuth, (req, res) => {
    const uid = currentUser(req).id;
    db.prepare(`INSERT INTO notification_state(user_id,notification_id,read_at)
      SELECT ?,id,CURRENT_TIMESTAMP FROM notifications WHERE user_id IS NULL OR user_id=?
      ON CONFLICT(user_id,notification_id) DO UPDATE SET read_at=CURRENT_TIMESTAMP`).run(uid, uid);
    res.json({ ok: true });
  });
  app.patch('/api/notifications/:id/read', requireAuth, (req, res) => {
    const uid = currentUser(req).id;
    const n = db.prepare('SELECT id FROM notifications WHERE id=? AND (user_id IS NULL OR user_id=?)').get(Number(req.params.id), uid);
    if (!n) return fail(res, 404, 'الإشعار غير موجود');
    db.prepare(`INSERT INTO notification_state(user_id,notification_id,read_at) VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,notification_id) DO UPDATE SET read_at=CURRENT_TIMESTAMP`).run(uid, n.id);
    res.json({ ok: true });
  });
  app.delete('/api/notifications', requireAuth, (req, res) => {
    const uid = currentUser(req).id;
    db.prepare(`INSERT INTO notification_state(user_id,notification_id,hidden)
      SELECT ?,id,1 FROM notifications WHERE user_id IS NULL OR user_id=?
      ON CONFLICT(user_id,notification_id) DO UPDATE SET hidden=1`).run(uid, uid);
    res.json({ ok: true });
  });
  app.get('/api/profile', requireAuth, (req, res) => {
    const user = currentUser(req), uid = user.id;
    res.json({
      user,
      progress: db.prepare(`SELECT p.*,w.title,w.slug,w.cover_url,w.kind FROM reading_progress p JOIN works w ON w.id=p.work_id WHERE p.user_id=? AND w.published=1 ORDER BY p.updated_at DESC LIMIT 100`).all(uid),
      favorites: db.prepare(`SELECT f.created_at,w.*, (SELECT COUNT(*) FROM chapters WHERE work_id=w.id AND published=1) chapter_count FROM favorites f JOIN works w ON w.id=f.work_id WHERE f.user_id=? AND w.published=1 ORDER BY f.created_at DESC`).all(uid),
      notifications: notifications(uid),
      wallet: db.prepare('SELECT * FROM wallet_events WHERE user_id=? ORDER BY id DESC LIMIT 100').all(uid),
      achievements: db.prepare(`SELECT a.*,ua.unlocked_at FROM achievements a LEFT JOIN user_achievements ua ON ua.achievement_id=a.id AND ua.user_id=? WHERE a.active=1 ORDER BY a.id`).all(uid),
      gifts: db.prepare('SELECT * FROM gifts WHERE user_id=? ORDER BY id DESC').all(uid),
      preferences: db.prepare('SELECT * FROM user_preferences WHERE user_id=?').get(uid) || { theme: 'light', direction: 'rtl', reader_mode: 'vertical' },
      items: db.prepare('SELECT s.*,ui.acquired_at FROM user_items ui JOIN shop_items s ON s.id=ui.item_id WHERE ui.user_id=?').all(uid)
    });
  });
  app.get('/api/genres', (req, res) => res.json({ categories: db.prepare(`
    SELECT c.id,c.name,c.slug,c.description,COUNT(w.id) work_count FROM categories c
    LEFT JOIN work_categories wc ON wc.category_id=c.id LEFT JOIN works w ON w.id=wc.work_id AND w.published=1
    WHERE c.active=1 GROUP BY c.id ORDER BY c.sort_order,c.name`).all() }));

  app.put('/api/reader/progress', requireAuth, (req, res) => {
    const parsed = z.object({ work_id: z.number().int().positive(), chapter_id: z.number().int().positive(), progress: z.number().min(0).max(1), last_page: z.number().int().min(0).max(10000) }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'بيانات التقدم غير صحيحة');
    const p = parsed.data, uid = currentUser(req).id;
    const chapter = db.prepare(`SELECT c.pages_json,c.text_ar FROM chapters c JOIN works w ON w.id=c.work_id WHERE c.id=? AND c.work_id=? AND c.published=1 AND w.published=1`).get(p.chapter_id, p.work_id);
    if (!chapter) return fail(res, 404, 'الفصل لا يتبع هذا العمل أو غير منشور');
    let pages = []; try { pages = JSON.parse(chapter.pages_json); } catch {}
    if (p.last_page >= Math.max(1,pages.length)) return fail(res, 400, 'رقم الصفحة غير صحيح');
    db.transaction(() => {
      db.prepare(`INSERT INTO reading_progress(user_id,work_id,chapter_id,progress,last_page,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,work_id) DO UPDATE SET chapter_id=excluded.chapter_id,progress=excluded.progress,last_page=excluded.last_page,updated_at=CURRENT_TIMESTAMP`).run(uid,p.work_id,p.chapter_id,p.progress,p.last_page);
      if (!db.prepare(`SELECT id FROM reading_history WHERE user_id=? AND chapter_id=? AND opened_at>=datetime('now','-1 day')`).get(uid,p.chapter_id)) {
        db.prepare('INSERT INTO reading_history(user_id,work_id,chapter_id) VALUES(?,?,?)').run(uid,p.work_id,p.chapter_id);
      }
    })();
    res.json({ ok: true });
  });

  app.post('/api/shop/:id/buy', requireAuth, (req, res) => {
    const uid = currentUser(req).id, id = Number(req.params.id);
    const item = db.prepare('SELECT * FROM shop_items WHERE id=? AND active=1').get(id);
    if (!item) return fail(res,404,'العنصر غير متوفر');
    try {
      const points = db.transaction(() => {
        if (db.prepare('SELECT id FROM user_items WHERE user_id=? AND item_id=?').get(uid,id)) throw Error('OWNED');
        const result = db.prepare('UPDATE users SET points=points-? WHERE id=? AND points>=?').run(item.cost,uid,item.cost);
        if (!result.changes) throw Error('LOW');
        db.prepare('INSERT INTO user_items(user_id,item_id) VALUES(?,?)').run(uid,id);
        const balance = db.prepare('SELECT points FROM users WHERE id=?').get(uid).points;
        const reason = `شراء: ${item.name}`, ref = `shop-${crypto.randomUUID()}`;
        db.prepare('INSERT INTO transactions(user_id,delta,reason,reference) VALUES(?,?,?,?)').run(uid,-item.cost,reason,ref);
        db.prepare('INSERT INTO wallet_events(user_id,delta,balance_after,reason,reference) VALUES(?,?,?,?,?)').run(uid,-item.cost,balance,reason,ref);
        return balance;
      })();
      audit(req,'shop.purchase','shop_item',id);
      res.json({ ok:true, points });
    } catch(e) { return fail(res,e.message==='OWNED'?409:400,e.message==='OWNED'?'هذا العنصر موجود في مجموعتك بالفعل':'نقاطك غير كافية أو تعذر إتمام الشراء'); }
  });

  app.post('/api/tasks/:id/claim', requireAuth, (req,res) => {
    const uid=currentUser(req).id, id=Number(req.params.id);
    const task=db.prepare('SELECT * FROM tasks WHERE id=? AND active=1').get(id);
    if (!task) return fail(res,404,'المهمة غير موجودة');
    let payload={}; try { payload=JSON.parse(task.payload_json); } catch {}
    const count=Math.max(1,Number(payload.count)||1);
    const dailyReads=db.prepare(`SELECT COUNT(DISTINCT chapter_id) n FROM reading_history WHERE user_id=? AND opened_at>=date('now')`).get(uid).n;
    const eligible = {
      read_chapters: dailyReads>=count,
      weekly_reader: db.prepare(`SELECT COUNT(DISTINCT chapter_id) n FROM reading_history WHERE user_id=? AND opened_at>=datetime('now','-7 days')`).get(uid).n>=count,
      rate_work: !!db.prepare('SELECT 1 FROM ratings WHERE user_id=?').get(uid),
      comment: !!db.prepare("SELECT 1 FROM comments WHERE user_id=? AND status='visible'").get(uid),
      favorite: !!db.prepare('SELECT 1 FROM favorites WHERE user_id=?').get(uid),
      finish_chapter: !!db.prepare('SELECT 1 FROM reading_progress WHERE user_id=? AND progress=1').get(uid),
      discover: !!db.prepare(`SELECT wc.category_id FROM work_visits v JOIN work_categories wc ON wc.work_id=v.work_id
        WHERE v.user_id=? AND v.visited_at>=date('now') GROUP BY wc.category_id HAVING COUNT(DISTINCT v.work_id)>=? LIMIT 1`).get(uid,count),
      daily_visit: true
    }[task.task_type] === true;
    try {
      const points=db.transaction(() => {
        if (db.prepare('SELECT 1 FROM task_claims WHERE user_id=? AND task_id=?').get(uid,id)) throw Error('CLAIMED');
        if (!eligible) throw Error('INCOMPLETE');
        db.prepare('INSERT INTO task_claims(user_id,task_id) VALUES(?,?)').run(uid,id);
        db.prepare('UPDATE users SET points=points+? WHERE id=?').run(task.reward,uid);
        const balance=db.prepare('SELECT points FROM users WHERE id=?').get(uid).points;
        const reason=`مكافأة مهمة: ${task.title}`, ref=`task-${crypto.randomUUID()}`;
        db.prepare('INSERT INTO transactions(user_id,delta,reason,reference) VALUES(?,?,?,?)').run(uid,task.reward,reason,ref);
        db.prepare('INSERT INTO wallet_events(user_id,delta,balance_after,reason,reference) VALUES(?,?,?,?,?)').run(uid,task.reward,balance,reason,ref);
        return balance;
      })();
    res.json({ok:true,points});
    } catch(e) { return fail(res,409,e.message==='CLAIMED'?'تمت المطالبة بهذه المهمة مسبقًا':'أكمل شروط المهمة أولًا، ثم طالب بالمكافأة'); }
  });

  app.post('/api/admin/works',requireRole('editor'),(req,res,next)=>{
    if(req.body.status!==undefined&&!['ongoing','completed','paused'].includes(req.body.status))return fail(res,400,'حالة العمل غير صالحة.');
    next();
  });
  app.patch('/api/admin/works/:id',requireRole('editor'),(req,res,next)=>{
    if(req.body.status!==undefined&&!['ongoing','completed','paused'].includes(req.body.status))return fail(res,400,'حالة العمل غير صالحة.');
    if(['published','featured','license_confirmed'].some(key=>req.body[key]!==undefined&&typeof req.body[key]!=='boolean'))return fail(res,400,'حقول الاعتماد والنشر يجب أن تكون منطقية.');
    const work=db.prepare('SELECT published,license_confirmed,license_url FROM works WHERE id=?').get(Number(req.params.id));
    const license=req.body.license_url===undefined?work?.license_url:String(req.body.license_url).trim();
    const confirmed=req.body.license_confirmed===true||work?.license_confirmed===1;
    const published=req.body.published===undefined?work?.published===1:req.body.published;
    if(work && published && (!license||!confirmed))return fail(res,403,'وثق تصريح العمل قبل النشر.');
    next();
  });

  app.get('/api/admin/chapters',requireRole('editor'),(req,res)=>{
    const workId=Number(req.query.work_id);
    if(!Number.isInteger(workId)||workId<1)return fail(res,400,'اختر عملًا لمراجعة فصوله.');
    const chapters=db.prepare(`SELECT c.*,w.title work_title FROM chapters c JOIN works w ON w.id=c.work_id
      WHERE c.work_id=? ORDER BY CAST(c.chapter_no AS REAL) DESC,c.id DESC LIMIT 500`).all(workId).map(c=>{
      try{c.pages=JSON.parse(c.pages_json);}catch{c.pages=[];}
      delete c.pages_json;return c;
    });
    res.json({chapters});
  });
  app.patch('/api/admin/chapters/:id',requireRole('editor'),(req,res)=>{
    const parsed=z.object({published:z.boolean()}).safeParse(req.body);
    if(!parsed.success)return fail(res,400,'حدد حالة نشر صالحة.');
    const chapter=db.prepare(`SELECT c.id,w.license_confirmed,w.license_url FROM chapters c JOIN works w ON w.id=c.work_id WHERE c.id=?`).get(Number(req.params.id));
    if(!chapter)return fail(res,404,'الفصل غير موجود.');
    if(parsed.data.published&&(!chapter.license_confirmed||!chapter.license_url))return fail(res,403,'وثق تصريح العمل قبل اعتماد الفصل.');
    db.prepare('UPDATE chapters SET published=? WHERE id=?').run(parsed.data.published?1:0,chapter.id);
    audit(req,'chapter.review_publish','chapter',chapter.id,{published:parsed.data.published});
    res.json({ok:true});
  });

  // Protect role boundaries even when a previously issued session still exists.
  app.patch('/api/admin/users/:id', requireRole('moderator'), (req,res,next) => {
    const actor=currentUser(req), target=db.prepare('SELECT role FROM users WHERE id=?').get(Number(req.params.id));
    if (target && actor.role!=='owner' && (roles[target.role]>=roles[actor.role] || (req.body.role!==undefined && roles[req.body.role]>=roles[actor.role]))) {
      return fail(res,403,'لا يمكنك تعديل حساب مساوٍ أو أعلى رتبة أو منحه رتبتك');
    }
    next();
  });
};
