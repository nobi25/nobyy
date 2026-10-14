'use strict';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds = {manga:'مانجا',manhwa:'مانهوا',manhua:'مانهوا صينية',webtoon:'ويب تون',novel:'رواية'};
const states = {ongoing:'مستمر',completed:'مكتمل',paused:'متوقف'};
const curatedSlugs = ['the-astral-crown','chronicles-of-the-last-gate','moonlit-academy','iron-oath-protocol','the-silent-alchemist'];
let me = null, authMode = 'login', pageContext = {}, renderVersion = 0, homeWorks = [], progressObserver = null;
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${({book:'<path d="M12 5C8 2 4 3 2 4v15c3-1 6-1 10 1 4-2 7-2 10-1V4c-2-1-6-2-10 1Zm0 0v15"/>',arrow:'<path d="M20 12H4m6-6-6 6 6 6"/>',heart:'<path d="M12 20S2 14 2 7a5 5 0 0 1 10-1A5 5 0 0 1 22 7c0 7-10 13-10 13Z"/>',star:'<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.5l-5.7 3 1.1-6.3L2.8 9.7l6.4-.9Z"/>',leaf:'<path d="M20 3C8 2 2 8 6 15c8 7 16 0 14-12ZM5 21 16 8"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'})[name] || ''}</svg>`;
async function api(url, options = {}) {
  const response = await fetch(url, {...options,credentials:'same-origin',headers:{'Content-Type':'application/json',...options.headers}});
  let data = {}; try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || (response.status === 429 ? 'طلبات كثيرة، حاول بعد قليل.' : 'تعذر تنفيذ الطلب، حاول مجددًا.'));
  return data;
}
const post = (url, body = {}, method = 'POST') => api(url,{method,body:JSON.stringify(body)});
function date(value) {
  if (!value) return '';
  const d = new Date(value.includes('T') ? value : value.replace(' ','T')+'Z');
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar',{month:'short',day:'numeric'}).format(d);
}
const number = value => Number(value || 0).toLocaleString('ar');
function empty(title='لا توجد نتائج بعد', subtitle='جرّب بحثًا مختلفًا أو عد لاحقًا.') { return `<div class="empty">${icon('book')}<h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div>`; }
function card(w) {
  return `<article class="work-card"><a class="cover" href="/manga/${encodeURIComponent(w.slug)}" aria-label="تفاصيل ${esc(w.title)}">${w.cover_url ? `<img src="${esc(w.cover_url)}" alt="غلاف ${esc(w.title)}" loading="lazy">` : `<span class="cover-mark">N·</span>`}<span class="tag">${esc(kinds[w.kind]||w.kind)}</span><span class="cover-open">اكتشف الحكاية ${icon('arrow')}</span></a><div class="work-info"><div class="work-subtitle"><span>${esc(states[w.status]||'مستمر')}</span><span class="rating">${icon('star')} ${esc(w.rating||'—')}</span></div><a href="/manga/${encodeURIComponent(w.slug)}"><h3>${esc(w.title)}</h3></a><p>${esc(w.synopsis||'حكاية جديدة بانتظارك.')}</p><div class="meta">${icon('book')} <span>${number(w.chapter_count)} فصل</span><span class="meta-dot">·</span><span>${esc(kinds[w.kind]||'عمل')}</span></div></div></article>`;
}
function chapterCard(c) {
  return `<a class="chapter-card" href="/reader/${encodeURIComponent(c.slug)}/${c.id}"><div class="chapter-cover">${c.cover_url?`<img loading="lazy" src="${esc(c.cover_url)}" alt="">`:'N·'}</div><div class="chapter-info"><small>${esc(kinds[c.kind]||'عمل')} <span>· ${date(c.created_at)}</span></small><h3>${esc(c.work_title)}</h3><p>الفصل ${esc(c.chapter_no)} <span>— ${esc(c.title||'حكاية جديدة')}</span></p></div><span class="chapter-arrow">${icon('arrow')}</span></a>`;
}
function heading(title, kicker, more='') { return `<div class="section-head"><div><span class="eyebrow">${kicker}</span><h2>${title}</h2></div>${more}</div>`; }
function shell(title, kicker, body, subtitle='حكايتك التالية أقرب مما تظن.') {
  return `<section class="page-head"><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${subtitle}</p></section><section class="page-body">${body}</section>`;
}
function pagination(path, params, data) {
  if (data.pages <= 1) return '';
  const current=Number(data.page), start=Math.max(1,current-2), end=Math.min(data.pages,current+2);
  const link=(p,label)=>`<a class="${p===current?'active':''}" ${p===current?'aria-current="page"':''} href="${path}?${new URLSearchParams({...Object.fromEntries(params),page:p})}">${label}</a>`;
  return `<nav class="pagination" aria-label="صفحات النتائج">${current>1?link(current-1,'السابق'):''}${start>1?link(1,'1'):''}${start>2?'<span>…</span>':''}${Array.from({length:end-start+1},(_,i)=>link(start+i,number(start+i))).join('')}${end<data.pages-1?'<span>…</span>':''}${end<data.pages?link(data.pages,number(data.pages)):''}${current<data.pages?link(current+1,'التالي'):''}</nav>`;
}
async function home() {
  const [base,genres,library] = await Promise.all([api('/api/home'),api('/api/genres'),api('/api/works?limit=48')]);
  const picks=curatedSlugs.map(slug=>library.works.find(w=>w.slug===slug)).filter(Boolean);
  homeWorks=picks.length?picks:library.works.slice(0,5);
  const three=homeWorks.slice(0,3);
  const art=three.map((w,i)=>`<a class="hero-book book-${i}" href="/manga/${encodeURIComponent(w.slug)}" aria-label="${esc(w.title)}"><img src="${esc(w.cover_url)}" alt="${esc(w.title)}" fetchpriority="${i===0?'high':'auto'}"><span>${esc(w.title)}</span></a>`).join('');
  const genreIcons=['✧','◈','✦','☾','↗','♡'];
  return `<section class="hero"><div class="hero-copy"><span class="eyebrow"><i class="status-dot"></i> حكايات تستحق أن تُروى</span><h1>بين فصلٍ وآخر،<br><em>عالمٌ جديد.</em></h1><p>مانجا، مانهوا، وحكايات تأخذك أبعد.<br>اكتشف ما تحب، واحفظ مكانك، وعُد متى شئت.</p><div class="actions"><a class="btn primary large" href="/library">اكتشف المكتبة ${icon('arrow')}</a><a class="hero-secondary" href="/latest">${icon('clock')} أحدث الفصول</a></div><div class="hero-proof"><div class="reader-avatars"><span>ن</span><span>ع</span><span>م</span><span>${icon('book')}</span></div><div><b>مساحتك الخاصة للقراءة</b><small>حكاية تليق بذوقك، وتجربة على مهل.</small></div></div></div><div class="hero-art"><div class="orbit"></div><div class="art-caption" dir="ltr">ESCAPE INTO A GOOD STORY.</div>${art}<div class="art-stamp"><span>نادي قرّاء</span><b>نوبي</b><small dir="ltr">EST. 2026</small></div><div class="art-note">قليل من الخيال.<br><b>الكثير من العوالم.</b><span>↙</span></div><span class="art-spark">✧</span></div></section>
    <div class="discovery-strip"><span>${icon('book')} <b>${number(library.total)}</b> عمل في النسخة التجريبية</span><span>${icon('leaf')} قصص لكل الأذواق</span><span>${icon('heart')} مكتبتك، كما تحبّها</span><span class="edition-label" dir="ltr">NOBY / ISSUE 001</span></div>
    <section class="section picks-section">${heading('حكايات نرشّحها لك','01 / على رفّ نوبي',`<a class="text-link" href="/library">تصفّح المكتبة ${icon('arrow')}</a>`)}<div class="selection-tabs" role="group" aria-label="نوع الأعمال المختارة"><button class="active" data-pick-kind="">كل الحكايات</button><button data-pick-kind="manhwa">مانهوا</button><button data-pick-kind="manga">مانجا</button><button data-pick-kind="novel">روايات</button><span>اختيارات صغيرة، مغامرات كبيرة.</span></div><div class="works-grid picks-grid" id="homePicks">${homeWorks.map(card).join('')}</div></section>
    <section class="section latest-section">${heading('فصل جديد، موعد جديد','02 / وصل للتو',`<a class="text-link" href="/latest">كل التحديثات ${icon('arrow')}</a>`)}<div class="chapter-grid">${base.latest.length?base.latest.slice(0,6).map(chapterCard).join(''):empty('الفصول القادمة في الطريق')}</div></section>
    <section class="genre-section">${heading('إلى أي عالم نأخذك؟','03 / اتبع فضولك',`<a class="text-link" href="/genres">كل التصنيفات ${icon('arrow')}</a>`)}<div class="genre-grid home-genres">${genres.categories.slice(0,6).map((g,i)=>`<a class="genre-tile" href="/library?genre=${encodeURIComponent(g.slug)}"><span class="genre-icon">${genreIcons[i]}</span><h3>${esc(g.name)}</h3><small>${number(g.work_count)} حكاية</small><span class="genre-arrow">↖</span></a>`).join('')}</div></section>
    <section class="club-section"><div class="club-symbol">${icon('book')}</div><div><span class="eyebrow">حكايات تجمعنا</span><h2>القراءة أجمل،<br>حين تكون لك مساحة.</h2><p>احفظ حكاياتك المفضلة، تابع من حيث توقفت،<br>وشارك رأيك مع قرّاء يشبهونك.</p></div><a class="btn primary large" href="${me?'/profile':'/register'}">${me?'إلى مكتبتي':'انضم إلى نادي نوبي'} ${icon('arrow')}</a><span class="club-doodle">✧</span></section>`;
}
async function library() {
  const q=new URLSearchParams(location.search), params=new URLSearchParams(q);
  params.set('category',q.get('genre')||q.get('category')||'');
  const [data,g]=await Promise.all([api('/api/works?'+params),api('/api/genres')]);
  const options=(list,key)=>Object.entries(list).map(([v,l])=>`<option value="${esc(v)}" ${q.get(key)===v?'selected':''}>${l}</option>`).join('');
  const body=`<form class="filter-bar" id="libraryFilters"><label class="filter-search">ابحث عن حكاية<input name="q" value="${esc(q.get('q')||'')}" placeholder="عنوان العمل…"></label><label>النوع<select name="kind"><option value="">كل الأنواع</option>${options(kinds,'kind')}</select></label><label>التصنيف<select name="genre"><option value="">كل التصنيفات</option>${g.categories.map(c=>`<option value="${esc(c.slug)}" ${q.get('genre')===c.slug?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>الحالة<select name="status"><option value="">كل الحالات</option>${options(states,'status')}</select></label><label>الترتيب<select name="sort">${options({latest:'الأحدث',views:'الأكثر قراءة',rating:'الأعلى تقييمًا',title:'أبجديًا'},'sort')}</select></label><button class="btn primary">تطبيق ${icon('arrow')}</button></form><div class="results-heading"><span>${number(data.total)} حكاية بانتظارك</span><a class="text-link" href="/library">مسح الفلاتر</a></div><div class="works-grid">${data.works.length?data.works.map(card).join(''):empty('لم نجد حكاية مطابقة','غيّر كلمات البحث أو أزل بعض الفلاتر.')}</div>${pagination('/library',q,data)}`;
  return shell('المكتبة','على رفوف نوبي',body,'تصفّح على مهل. هناك دائمًا حكاية لم تكتشفها بعد.');
}
async function latest() {
  const q=new URLSearchParams(location.search),d=await api('/api/latest?'+q),sort=q.get('sort')||'updated_at';
  return shell('أحدث الفصول','موعدك مع الحكاية',`<div class="tabs">${Object.entries({updated_at:'الأحدث',rating:'الأعلى تقييمًا',views:'الأكثر قراءة'}).map(([v,t])=>`<a class="${sort===v?'active':''}" href="/latest?sort=${v}">${t}</a>`).join('')}<small>${number(d.total)} فصل منشور</small></div><div class="chapter-grid">${d.chapters.length?d.chapters.map(chapterCard).join(''):empty('لا توجد فصول بعد')}</div>${pagination('/latest',q,d)}`);
}
async function genres() {
  const d=await api('/api/genres');
  return shell('اتبع فضولك','تصنيفات الحكايات',`<div class="genre-grid large-genres">${d.categories.map((g,i)=>`<a class="genre-tile" href="/library?genre=${encodeURIComponent(g.slug)}"><span class="genre-index">${String(i+1).padStart(2,'0')}</span><h3>${esc(g.name)}</h3><small>${number(g.work_count)} عمل</small><span class="genre-arrow">↖</span></a>`).join('')}</div>`,'خيال؟ مغامرة؟ أم شيء لم تقرأه من قبل؟');
}
async function workPage(slug) {
  const {work:w}=await api('/api/works/slug/'+encodeURIComponent(slug));
  const [community,profile]=await Promise.all([api('/api/works/'+w.id+'/community'),me?api('/api/profile'):null]);
  const favorite=profile?.favorites.some(x=>x.id===w.id),progress=profile?.progress.find(x=>x.work_id===w.id);
  pageContext={type:'work',work:w};
  const first=w.chapters[w.chapters.length-1];
  const continueId=progress?.chapter_id||first?.id;
  return `<section class="work-hero"><a class="breadcrumb" href="/library">المكتبة / ${esc(kinds[w.kind]||'عمل')}</a><div class="work-cover"><img src="${esc(w.cover_url)}" alt="غلاف ${esc(w.title)}"></div><div class="work-intro"><span class="eyebrow">${esc(kinds[w.kind])} <span>·</span> ${esc(states[w.status])}</span><h1>${esc(w.title)}</h1><p>${esc(w.synopsis)}</p><div class="chips">${w.categories.map(c=>`<a href="/library?genre=${encodeURIComponent(c.slug)}">${esc(c.name)}</a>`).join('')}</div><div class="detail-stats"><span>${icon('star')} <b>${esc(community.rating.average||'—')}</b> / 10</span><span>${icon('book')} <b>${number(w.chapters.length)}</b> فصل</span><span>${esc(w.author||'نوبي')}</span></div><div class="actions">${continueId?`<a class="btn primary large" href="/reader/${encodeURIComponent(w.slug)}/${continueId}">${progress?'أكمل القراءة':'ابدأ الحكاية'} ${icon('arrow')}</a>`:'<span class="btn disabled">الفصول قادمة قريبًا</span>'}<button class="btn ghost" data-favorite="${w.id}" aria-pressed="${!!favorite}">${icon('heart')} ${favorite?'في مكتبتي':'أضف للمفضلة'}</button></div><small class="demo-label">عمل تجريبي ضمن نسخة المعاينة</small></div></section>
  <section class="section">${heading('فصول الحكاية','خطوة أخرى في هذا العالم',`<label class="chapter-search-label"><input id="chapterSearch" placeholder="ابحث برقم الفصل أو عنوانه…" aria-label="البحث في الفصول"></label>`)}<div class="chapter-list">${w.chapters.length?w.chapters.map(c=>`<a data-chapter-label="${esc(c.chapter_no+' '+c.title)}" href="/reader/${encodeURIComponent(w.slug)}/${c.id}"><span class="chapter-number">${esc(c.chapter_no)}</span><div><b>${esc(c.title||'الفصل '+c.chapter_no)}</b><small>${date(c.created_at)}</small></div><span class="text-link">اقرأ ${icon('arrow')}</span></a>`).join(''):empty('لا توجد فصول منشورة')}</div><p id="chapterNoResults" class="hidden empty">لا توجد فصول تطابق بحثك.</p></section>
  <section class="section community-section">${heading('على هامش الحكاية','آراء القراء',`<button class="text-link" data-report="work" data-target="${w.id}">الإبلاغ عن مشكلة</button>`)}<div class="community-layout"><div class="panel rating-panel"><span class="eyebrow">ما رأيك بالحكاية؟</span><strong>${esc(community.rating.average||'—')}<small>/ 10</small></strong><p>${number(community.rating.count)} تقييم من القراء</p><form id="ratingForm"><label>تقييمك من 10<select name="score">${Array.from({length:10},(_,i)=>`<option value="${10-i}">${10-i} / 10</option>`).join('')}</select></label><button class="btn primary wide">أرسل تقييمك</button></form></div><div><form id="commentForm" class="comment-form"><label>شارك انطباعك<textarea name="body" rows="3" minlength="2" maxlength="1200" required placeholder="رأيك يضيف شيئًا للحكاية…"></textarea></label><div><small>ناقش باحترام، وتجنّب كشف الأحداث.</small><button class="btn primary">نشر التعليق ←</button></div></form><div class="comment-stream">${community.comments.length?community.comments.map(c=>`<article><div class="comment-avatar">${esc(c.username[0])}</div><div><b>${esc(c.username)}</b><small>${date(c.created_at)}</small><p>${esc(c.body)}</p></div><button class="icon-btn" aria-label="الإبلاغ عن التعليق" data-report="comment" data-target="${c.id}">⋯</button></article>`).join(''):empty('كن أول من يكتب انطباعًا','الحكايات الجيدة تفتح أحاديث جميلة.')}</div></div></div></section>`;
}
async function reader(slug,id) {
  const d=await api('/api/reader/'+encodeURIComponent(id)),c=d.chapter;
  pageContext={type:'reader',chapter:c,progress:d.progress};
  const text=c.text_ar?.split(/\n\s*\n/).filter(Boolean)||[];
  return `<section class="reader-shell"><div class="reader-top"><a href="/manga/${encodeURIComponent(c.slug)}">${icon('arrow')} ${esc(c.work_title)}</a><span>الفصل ${esc(c.chapter_no)} — ${esc(c.title)}</span><button class="text-link" data-report="chapter" data-target="${c.id}">بلاغ</button></div><div class="reader-toolbar"><div><button data-reader-mode="vertical">عمودي</button><button data-reader-mode="single">صفحة واحدة</button><button id="readerFit">ملاءمة العرض</button></div><label>الخلفية<select id="readerBackground"><option value="paper">ورق</option><option value="dark">ليلي</option><option value="white">أبيض</option></select></label><small id="readerProgressLabel">${me?'تقدمك يُحفظ أثناء القراءة':'سجّل الدخول لحفظ تقدمك'}</small></div><div id="singlePageControls" class="single-controls hidden"><button id="previousPage" class="btn ghost">الصفحة السابقة</button><span id="pageCount"></span><button id="nextPage" class="btn ghost">الصفحة التالية</button></div><article class="reader-pages" data-work="${c.work_id}" data-chapter="${c.id}">${c.pages.length?c.pages.map((p,i)=>`<figure data-page="${i}"><img loading="${i===0?'eager':'lazy'}" src="${esc(p)}" alt="الصفحة ${i+1} من الفصل ${esc(c.chapter_no)}"><figcaption>صفحة ${number(i+1)}</figcaption></figure>`).join(''):text.length?`<div class="novel-text"><span class="eyebrow">نص تجريبي للمعاينة</span><h1>${esc(c.title)}</h1>${text.map(p=>`<p>${esc(p)}</p>`).join('')}<div id="textEnd" data-page="0" class="text-end">✧ نهاية الفصل ✧</div></div>`:empty('لا توجد صفحات منشورة','أبلغنا عن المشكلة إن كانت هذه الحكاية متاحة سابقًا.')}</article><div class="reader-nav">${d.previous?`<a class="btn ghost" href="/reader/${encodeURIComponent(c.slug)}/${d.previous.id}">الفصل السابق</a>`:'<span>بداية الحكاية</span>'}<a class="text-link" href="/manga/${encodeURIComponent(c.slug)}">قائمة الفصول</a>${d.next?`<a class="btn primary" href="/reader/${encodeURIComponent(c.slug)}/${d.next.id}">الفصل التالي ${icon('arrow')}</a>`:'<span>وصلت إلى آخر فصل</span>'}</div></section>`;
}
async function profile() {
  if (!me) return shell('مكتبتك تنتظرك','نادي قرّاء نوبي',`<div class="auth-wall">${icon('book')}<h2>كل حكاياتك، في مكان واحد.</h2><p>سجّل الدخول لحفظ المفضلة ومتابعة تقدمك.</p><button class="btn primary" data-auth="login">أهلًا بعودتك ←</button></div>`);
  const d=await api('/api/profile');me=d.user;syncAuth();
  const history=d.progress.map(x=>`<a class="history-row" href="/reader/${encodeURIComponent(x.slug)}/${x.chapter_id}"><img src="${esc(x.cover_url)}" alt=""><div><b>${esc(x.title)}</b><small>صفحة ${number(x.last_page+1)} · ${number(Math.round(x.progress*100))}%</small><progress value="${x.progress}" max="1"></progress></div>${icon('arrow')}</a>`).join('');
  return shell('مكتبتي','مكانك في نوبي',`<div class="profile-head"><span class="profile-avatar">${esc(me.username[0])}</span><div><h2>${esc(me.username)}</h2><small>${esc(me.email)}</small></div><strong>✦ ${number(me.points)} نقطة</strong><button class="btn ghost" id="logoutBtn">تسجيل الخروج</button></div><div class="profile-grid"><section class="panel"><span class="eyebrow">أكمل من حيث توقفت</span><h2>سجل القراءة</h2>${history||empty('مغامرتك الأولى لم تبدأ بعد')}<a class="text-link" href="/library">اكتشف حكاية ←</a></section><section class="panel"><span class="eyebrow">آخر الأخبار</span><h2>إشعاراتك</h2>${d.notifications.length?d.notifications.slice(0,4).map(n=>`<article class="notification ${n.read_at?'':'unread'}"><b>${esc(n.title)}</b><p>${esc(n.body)}</p><small>${date(n.created_at)}</small></article>`).join(''):empty('لا توجد إشعارات جديدة')}</section></div><section class="section inset">${heading('حكايات أحببتها','رف المفضلة')}<div class="works-grid">${d.favorites.length?d.favorites.map(card).join(''):empty('رفّك ما زال فارغًا','اضغط أضف للمفضلة في صفحة أي عمل.')}</div></section><details class="panel password-panel"><summary>تغيير كلمة المرور</summary><form id="passwordForm"><label>كلمة المرور الحالية<input name="current_password" type="password" required autocomplete="current-password"></label><label>كلمة المرور الجديدة<input name="new_password" type="password" minlength="14" maxlength="128" required autocomplete="new-password"></label><small>14 حرفًا على الأقل، مختلفة عن الحالية.</small><button class="btn primary">حفظ كلمة المرور</button></form></details>${me.role!=='reader'?'<a class="btn ghost" href="/admin.html">إلى لوحة الإدارة ←</a>':''}`);
}
async function store() {
  const [shop,tasks,p]=await Promise.all([api('/api/shop'),api('/api/tasks'),me?api('/api/profile'):null]);
  if(p){me=p.user;syncAuth();}
  const owned=new Set(p?.items.map(x=>x.id)||[]);
  return shell('سوق نوبي','مكافآت صغيرة لقراءات كبيرة',`<div class="wallet"><div><span class="eyebrow">محفظة الحكايات</span><h2>لكل قراءة، أثر.</h2><p>اجمع النقاط من مهامك، واستبدلها بما يناسبك.</p></div><div><small>رصيدك الحالي</small><strong>✦ ${number(me?.points)}</strong><small>نقاط تجريبية — لا توجد مدفوعات مالية</small></div></div><section class="section inset">${heading('مهام القراءة','خطوة صغيرة، مكافأة جديدة')}<p class="demo-label">في هذه النسخة تُصرف كل مهمة مرة واحدة لكل حساب؛ ليست مكافأة متكررة يوميًا.</p><div class="task-grid">${tasks.tasks.map(t=>`<article class="task-card"><span class="task-symbol">${icon('book')}</span><h3>${esc(t.title)}</h3><p>${esc(t.description)}</p><div><strong>+ ${number(t.reward)} نقطة</strong><button class="btn ghost" data-claim-task="${t.id}" ${t.claimed_at?'disabled':''}>${t.claimed_at?'تم الاستلام':'استلم المكافأة'}</button></div></article>`).join('')}</div></section><section class="section inset">${heading('اختر مكافأتك','من سوق النقاط')}<p class="demo-label">كتالوج تجريبي: الاستبدال يسجّل ملكية العنصر في حسابك، ولا يفعّل اشتراكًا أو مؤثرًا مدفوعًا.</p><div class="shop-grid">${shop.items.map((x,i)=>`<article class="shop-item"><span class="shop-symbol">${['✦','◈','✧','❋'][i%4]}</span><small>${esc(x.item_type)}</small><h3>${esc(x.name)}</h3><p>${esc(x.description)}</p><strong>${number(x.cost)} نقطة</strong><button class="btn ${owned.has(x.id)?'ghost':'primary'} wide" data-buy="${x.id}" ${owned.has(x.id)?'disabled':''}>${owned.has(x.id)?'في مجموعتك':me?'استبدال بالنقاط':'سجّل الدخول للاستبدال'}</button></article>`).join('')}</div></section>`);
}
function support() {
  return shell('نحن هنا للحكاية ولك','الدعم والبلاغات',`<div class="support-layout"><div class="panel"><span class="eyebrow">صوتك يصنع الفرق</span><h2>هل هناك ما يحتاج انتباهنا؟</h2><p>مشكلة في القراءة، محتوى مخالف، أو استفسار متعلق بالحقوق. أرسل التفاصيل لتظهر في صندوق مراجعة الإدارة.</p><button class="btn primary" data-report="other">أرسل بلاغًا ${icon('arrow')}</button></div><div class="faq"><details open><summary>كيف أحفظ تقدّم القراءة؟</summary><p>سجّل الدخول، وسيُحفظ تقدمك مع وصولك إلى الصفحات أثناء القراءة، لا بمجرد تحميلها.</p></details><details><summary>هل القصص المعروضة أعمال فعلية؟</summary><p>هذه بيانات وقصص تجريبية لمعاينة وظائف المنصة. لا نعرضها كأعمال تجارية مرخّصة.</p></details><details><summary>كيف أستخدم نقاطي؟</summary><p>أكمل شروط المهمة، ثم استلم مكافأتها من السوق. الاستبدال التجريبي يحفظ ملكية العنصر في حسابك دون دفع مالي.</p></details><details><summary>هل توجد استعادة كلمة المرور بالبريد؟</summary><p>لم يتم ربط مزوّد بريد بعد. تغيير كلمة المرور متاح من حسابك عند معرفة كلمة المرور الحالية.</p></details></div></div>`,'نحافظ معًا على مساحة تحترم القراءة والقراء.');
}
async function render() {
  const version=++renderVersion,path=location.pathname;
  progressObserver?.disconnect();pageContext={};
  $('#view').setAttribute('aria-busy','true');
  $('#view').innerHTML='<div class="loading-state"><span class="brand-mark">N·</span><p>نفتح لك باب الحكاية…</p></div>';
  let html,title;
  try {
    if(path==='/'||path==='/index.html'){html=await home();title='بين فصلٍ وآخر، عالمٌ جديد';}
    else if(path==='/library'){html=await library();title='المكتبة';}
    else if(path==='/latest'){html=await latest();title='أحدث الفصول';}
    else if(path==='/genres'){html=await genres();title='التصنيفات';}
    else if(path.startsWith('/manga/')){html=await workPage(decodeURIComponent(path.split('/')[2]));title=pageContext.work?.title;}
    else if(path.startsWith('/reader/')){html=await reader(decodeURIComponent(path.split('/')[2]),path.split('/')[3]);title=pageContext.chapter?.work_title;}
    else if(['/profile','/profile/history','/profile/favorites','/notifications'].includes(path)){html=await profile();title='مكتبتي';}
    else if(path==='/store'||path==='/tasks'){html=await store();title='سوق نوبي';}
    else if(path==='/support'){html=support();title='الدعم';}
    else if(path==='/login'||path==='/register'){html=shell('حكاياتك بانتظارك','نادي قراء نوبي','<div class="auth-wall"><button class="btn primary" data-auth="'+(path==='/register'?'register':'login')+'">'+(path==='/register'?'إنشاء حساب':'تسجيل الدخول')+'</button></div>');title='نادي قراء نوبي';}
    else {html=shell('ضاعت هذه الصفحة بين الفصول','404','<div class="auth-wall"><p>لم نجد الصفحة المطلوبة.</p><a class="btn primary" href="/">عد إلى الحكاية ←</a></div>');title='صفحة غير موجودة';}
    if(version!==renderVersion)return;
    $('#view').innerHTML=html;document.title='نوبي — '+title;
    $$('.main-nav a').forEach(a=>{const active=a.getAttribute('href')===path;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    bindView();
    if(path==='/login'||path==='/register')openAuth(path==='/register');
  } catch(e) {
    if(version!==renderVersion)return;
    $('#view').innerHTML=shell('تعذر فتح الحكاية','لحظة، نحاول من جديد',`<div class="auth-wall"><p>${esc(e.message)}</p><button class="btn primary" id="retryPage">حاول مجددًا ←</button><a class="text-link" href="/">العودة للرئيسية</a></div>`);
    $('#retryPage').onclick=()=>render();
  } finally { if(version===renderVersion)$('#view').removeAttribute('aria-busy'); }
}
