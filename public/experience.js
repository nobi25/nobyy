'use strict';
let toastTimer, searchTimer, searchVersion=0, readerController=null, modalReturnFocus=null, brandSettings={};
function toast(message) {
  $('#toast').textContent=message;$('#toast').classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4000);
}
function go(url) {
  history.pushState({},'',url);closeDrawers();window.scrollTo({top:0,behavior:'instant'});render();
}
function closeDrawers() {
  ['search','notifications'].forEach(name=>{$('#'+name+'Drawer').classList.add('hidden');$('#'+name+'Toggle').setAttribute('aria-expanded','false');});
}
function syncAuth() {
  $('#loginOpen').classList.toggle('hidden',!!me);$('#registerOpen').classList.toggle('hidden',!!me);$('#profileBtn').classList.toggle('hidden',!me);
  if(me)$('#profileBtn').textContent=me.username[0];
}
function applyPreferences() {
  const theme=localStorage.getItem('noby-theme')||'light';
  document.documentElement.dataset.theme=theme;
  document.documentElement.dir=localStorage.getItem('noby-direction')||'rtl';
  $('#themeToggle').setAttribute('aria-label',theme==='light'?'تفعيل المظهر الليلي':'تفعيل المظهر العاجي');
  if(theme==='light'&&/^#[0-9a-f]{6}$/i.test(brandSettings.primary_color||''))document.documentElement.style.setProperty('--accent',brandSettings.primary_color);
  else document.documentElement.style.removeProperty('--accent');
}
async function applyAccountPreferences() {
  if(!me)return;
  const {preferences:p}=await api('/api/profile/preferences');
  for(const [key,value] of Object.entries({theme:p.theme,direction:p.direction,'reader-mode':p.reader_mode,'reader-width':p.page_width,'reader-gap':p.reader_gap})){
    if(value!==undefined&&value!==null)localStorage.setItem('noby-'+key,String(value));
  }
  const color=String(p.reader_background||'').toLowerCase();
  const background=color==='#ffffff'?'white':['#121916','#0b0f19'].includes(color)?'dark':'paper';
  localStorage.setItem('noby-reader-background',background);
  applyPreferences();
}
function openModal(id) {
  modalReturnFocus=document.activeElement;$('#'+id).classList.remove('hidden');document.body.classList.add('modal-open');
  setTimeout(()=>$('#'+id+' input:not([type="hidden"]):not(.honeypot), #'+id+' select, #'+id+' button')?.focus(),0);
}
function closeModal(id) {
  $('#'+id).classList.add('hidden');document.body.classList.remove('modal-open');modalReturnFocus?.focus();
}
function openAuth(register=false) {
  authMode=register?'register':'login';$('#authForm').reset();$('#authError').textContent='';
  $('#authTitle').textContent=register?'حكايتك تبدأ هنا':'أهلًا بعودتك';
  $('#authSubtitle').textContent=register?'أنشئ مكتبتك الخاصة، ودع فضولك يقودك.':'حكاياتك ومكتبتك بانتظارك.';
  $('#usernameLabel').classList.toggle('hidden',!register);$('#usernameLabel input').required=register;
  $('#passwordHint').classList.toggle('hidden',!register);
  $('#authForm [name="password"]').autocomplete=register?'new-password':'current-password';
  $('#authForm [name="password"]').minLength=register?10:1;
  $('#authSubmit').textContent=register?'انضم إلى نوبي ←':'تسجيل الدخول ←';
  $('#authSwitch').textContent=register?'لديك حساب؟ أهلًا بعودتك':'ليس لديك حساب؟ انضم إلينا';
  openModal('authModal');
}
function openReport(type='other',id=null) {
  const form=$('#reportForm');form.reset();form.target_type.value=type;form.target_id.value=id||'';
  form.target_type.disabled=true;$('#reportMessage').textContent='';openModal('reportModal');
}
async function loadNotifications() {
  const box=$('#notificationsList');
  if(!me){box.innerHTML=empty('صندوقك ينتظرك','سجّل الدخول لاستقبال إشعاراتك.');return;}
  try {
    const d=await api('/api/notifications');
    box.innerHTML=d.notifications.length?d.notifications.slice(0,8).map(n=>`<article class="notification ${n.read_at?'':'unread'}"><b>${esc(n.title)}</b><p>${esc(n.body)}</p><small>${date(n.created_at)}</small></article>`).join(''):empty('كل شيء هادئ هنا','لا توجد إشعارات جديدة.');
  } catch(e){box.innerHTML=empty('تعذر جلب الإشعارات',e.message);}
}
async function busy(button,action) {
  if(button.disabled)return;
  button.disabled=true;button.setAttribute('aria-busy','true');
  try {await action();} catch(e){toast(e.message);} finally {button.disabled=false;button.removeAttribute('aria-busy');}
}
async function refreshMe(){const d=await api('/api/me');me=d.user;syncAuth();}
function bindView() {
  readerController?.abort();
  $$('[data-auth]').forEach(b=>b.onclick=()=>openAuth(b.dataset.auth==='register'));
  $$('[data-report]').forEach(b=>b.onclick=()=>openReport(b.dataset.report,Number(b.dataset.target)||null));
  $$('[data-pick-kind]').forEach(b=>b.onclick=()=>{
    $$('[data-pick-kind]').forEach(x=>x.classList.toggle('active',x===b));
    const list=b.dataset.pickKind?homeWorks.filter(w=>w.kind===b.dataset.pickKind):homeWorks;
    $('#homePicks').innerHTML=list.length?list.map(card).join(''):empty('قريبًا على هذا الرف','استكشف باقي الأنواع في المكتبة.');
  });
  $('#libraryFilters')?.addEventListener('submit',e=>{e.preventDefault();const q=new URLSearchParams(new FormData(e.currentTarget));go('/library?'+q);});
  $('#chapterSearch')?.addEventListener('input',e=>{
    const q=e.target.value.toLowerCase().trim();let visible=0;
    $$('[data-chapter-label]').forEach(x=>{const match=x.dataset.chapterLabel.toLowerCase().includes(q);x.classList.toggle('hidden',!match);if(match)visible++;});
    $('#chapterNoResults').classList.toggle('hidden',visible>0);
  });
  $('[data-favorite]')?.addEventListener('click',e=>{
    if(!me)return openAuth();const b=e.currentTarget;
    busy(b,async()=>{const d=await post('/api/profile/favorites/'+b.dataset.favorite);b.setAttribute('aria-pressed',String(d.favorite));b.innerHTML=icon('heart')+(d.favorite?' في مكتبتي':' أضف للمفضلة');toast(d.favorite?'حُفظت الحكاية على رفّك':'أزلنا الحكاية من المفضلة');});
  });
  $('#ratingForm')?.addEventListener('submit',e=>{
    e.preventDefault();if(!me)return openAuth();const f=e.currentTarget;
    busy(f.querySelector('button'),async()=>{await post('/api/works/'+pageContext.work.id+'/rating',{score:Number(f.score.value)});toast('شكرًا، أصبح رأيك جزءًا من الحكاية');render();});
  });
  $('#commentForm')?.addEventListener('submit',e=>{
    e.preventDefault();if(!me)return openAuth();const f=e.currentTarget;
    busy(f.querySelector('button'),async()=>{const d=await post('/api/comments',{work_id:pageContext.work.id,body:f.body.value.trim()});toast(d.moderated?'تم استلام تعليقك للمراجعة':'نُشر تعليقك. شكرًا لمشاركتك');render();});
  });
  $$('[data-claim-task]').forEach(b=>b.onclick=()=>{
    if(!me)return openAuth();busy(b,async()=>{await post('/api/tasks/'+b.dataset.claimTask+'/claim');await refreshMe();toast('أُضيفت المكافأة إلى محفظتك');render();});
  });
  $$('[data-buy]').forEach(b=>b.onclick=()=>{
    if(!me)return openAuth();busy(b,async()=>{await post('/api/shop/'+b.dataset.buy+'/buy');await refreshMe();toast('أُضيف العنصر التجريبي إلى مجموعتك');render();});
  });
  $('#logoutBtn')?.addEventListener('click',e=>busy(e.currentTarget,async()=>{await post('/api/auth/logout');me=null;syncAuth();toast('إلى حكاية قريبة');go('/');}));
  $('#passwordForm')?.addEventListener('submit',e=>{
    e.preventDefault();const f=e.currentTarget;
    busy(f.querySelector('button'),async()=>{await post('/api/auth/change-password',{current_password:f.current_password.value,new_password:f.new_password.value});f.reset();toast('تم تغيير كلمة المرور وتجديد الجلسة');});
  });
  if(pageContext.type==='reader')bindReader();
}
function bindReader() {
  readerController=new AbortController();const {signal}=readerController;
  const c=pageContext.chapter,area=$('.reader-pages'),figures=$$('.reader-pages figure');
  let index=pageContext.progress?.chapter_id===c.id?Math.min(figures.length-1,pageContext.progress.last_page):0;
  index=Math.max(0,index);let mode=localStorage.getItem('noby-reader-mode')||'vertical',saveTimer,lastValue=-1;
  const width=Math.max(480,Math.min(1400,Number(localStorage.getItem('noby-reader-width'))||900));
  const gap=Math.max(0,Math.min(80,Number(localStorage.getItem('noby-reader-gap')??12)));
  area.style.maxWidth=width+'px';figures.forEach(f=>f.style.marginBottom=gap+'px');
  const save=async(progress,lastPage)=>{
    if(!me||signal.aborted||Math.abs(lastValue-progress)<0.02)return;
    lastValue=progress;
    try{await post('/api/reader/progress',{work_id:c.work_id,chapter_id:c.id,progress:Math.max(0,Math.min(1,progress)),last_page:lastPage},'PUT');if(!signal.aborted)$('#readerProgressLabel').textContent='حُفظ تقدمك · '+number(Math.round(progress*100))+'%';}
    catch(e){if(!signal.aborted)$('#readerProgressLabel').textContent='تعذر حفظ تقدمك؛ تأكد من تسجيل الدخول.';}
  };
  const update=()=>{
    if(!me||signal.aborted)return;
    const vh=window.innerHeight;
    if(figures.length){
      const visible=figures.filter(f=>{const r=f.getBoundingClientRect();return r.top<vh*.8&&r.bottom>0&&!f.classList.contains('hidden');});
      const figure=visible.at(-1);if(!figure)return;
      const i=Number(figure.dataset.page),r=figure.getBoundingClientRect();
      const fraction=Math.min(1,Math.max(0,(vh-r.top)/Math.max(1,r.height)));
      save((i+fraction)/figures.length,i);
    }else if($('#textEnd')){
      const text=$('.novel-text'),r=text.getBoundingClientRect();
      save(Math.min(1,Math.max(0,(vh-r.top)/Math.max(1,r.height))),0);
    }
  };
  const schedule=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(update,600);};
  const applyMode=()=>{
    area.classList.toggle('single',mode==='single');
    figures.forEach((f,i)=>f.classList.toggle('hidden',mode==='single'&&i!==index));
    $('#singlePageControls').classList.toggle('hidden',mode!=='single'||!figures.length);
    if(figures.length){$('#pageCount').textContent=number(index+1)+' / '+number(figures.length);$('#previousPage').disabled=index===0;$('#nextPage').disabled=index===figures.length-1;}
    $$('[data-reader-mode]').forEach(b=>b.classList.toggle('active',b.dataset.readerMode===mode));
    schedule();
  };
  $$('[data-reader-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.readerMode;localStorage.setItem('noby-reader-mode',mode);applyMode();if(me)post('/api/profile/preferences',{reader_mode:mode},'PATCH').catch(e=>toast(e.message));});
  $('#nextPage').onclick=()=>{index=Math.min(figures.length-1,index+1);applyMode();area.scrollIntoView({block:'start',behavior:'smooth'});};
  $('#previousPage').onclick=()=>{index=Math.max(0,index-1);applyMode();area.scrollIntoView({block:'start',behavior:'smooth'});};
  $('#readerFit').onclick=e=>{const wide=area.classList.toggle('fit-wide');area.style.maxWidth=wide?'100%':width+'px';e.currentTarget.classList.toggle('active',wide);};
  const background=localStorage.getItem('noby-reader-background')||'paper';
  $('#readerBackground').value=background;area.dataset.background=background;
  $('#readerBackground').onchange=e=>{area.dataset.background=e.target.value;localStorage.setItem('noby-reader-background',e.target.value);if(me)post('/api/profile/preferences',{reader_background:{paper:'#f8f6f0',dark:'#121916',white:'#ffffff'}[e.target.value]},'PATCH').catch(err=>toast(err.message));};
  if(!figures.length)$$('[data-reader-mode]').forEach(b=>{b.disabled=true;});
  applyMode();
  if(pageContext.progress?.chapter_id===c.id&&index>0&&mode==='vertical')requestAnimationFrame(()=>figures[index]?.scrollIntoView({block:'start'}));
  window.addEventListener('scroll',schedule,{passive:true,signal});
  window.addEventListener('resize',schedule,{passive:true,signal});
  figures.forEach(f=>f.querySelector('img').addEventListener('load',schedule,{signal}));
  signal.addEventListener('abort',()=>clearTimeout(saveTimer));
}
function bindGlobal() {
  applyPreferences();syncAuth();$('#year').textContent=new Date().getFullYear();
  document.addEventListener('click',e=>{
    const a=e.target.closest('a[href]');
    if(!a||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target==='_blank'||a.hasAttribute('download'))return;
    const u=new URL(a.href,location.href);
    if(u.origin!==location.origin||u.pathname==='/admin.html'||u.hash)return;
    e.preventDefault();go(u.pathname+u.search);
  });
  $('#loginOpen').onclick=e=>{e.preventDefault();e.stopPropagation();openAuth(false);};
  $('#registerOpen').onclick=e=>{e.preventDefault();e.stopPropagation();openAuth(true);};
  $$('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
  document.addEventListener('keydown',e=>{
    const modal=$('.modal:not(.hidden)');
    if(e.key==='Escape'){if(modal)closeModal(modal.id);else closeDrawers();}
    if(e.key==='Tab'&&modal){const nodes=[...modal.querySelectorAll('button:not([disabled]), input:not([type="hidden"]):not(.honeypot), select, textarea, a[href]')].filter(x=>x.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
  $('#searchToggle').onclick=()=>{const open=$('#searchDrawer').classList.contains('hidden');closeDrawers();$('#searchDrawer').classList.toggle('hidden',!open);$('#searchToggle').setAttribute('aria-expanded',String(open));if(open)$('#globalSearch').focus();};
  $('#notificationsToggle').onclick=()=>{const open=$('#notificationsDrawer').classList.contains('hidden');closeDrawers();$('#notificationsDrawer').classList.toggle('hidden',!open);$('#notificationsToggle').setAttribute('aria-expanded',String(open));if(open)loadNotifications();};
  $('#readAllNotifications').onclick=e=>{if(!me)return openAuth();busy(e.currentTarget,async()=>{await post('/api/notifications/read-all',{},'PATCH');loadNotifications();});};
  $('#clearNotifications').onclick=e=>{if(!me)return openAuth();busy(e.currentTarget,async()=>{await api('/api/notifications',{method:'DELETE'});loadNotifications();});};
  $('#themeToggle').onclick=()=>{const theme=document.documentElement.dataset.theme==='light'?'dark':'light';localStorage.setItem('noby-theme',theme);applyPreferences();if(me)post('/api/profile/preferences',{theme},'PATCH').catch(e=>toast(e.message));};
  $('#globalSearchForm').onsubmit=e=>{e.preventDefault();const q=$('#globalSearch').value.trim();go('/library?'+new URLSearchParams({q}));};
  $('#globalSearch').oninput=e=>{
    const q=e.target.value.trim(),version=++searchVersion;clearTimeout(searchTimer);
    if(q.length<2){$('#suggestions').innerHTML='';return;}
    searchTimer=setTimeout(async()=>{try{const d=await api('/api/search/suggest?q='+encodeURIComponent(q));if(version!==searchVersion)return;$('#suggestions').innerHTML=d.suggestions.length?d.suggestions.map(w=>`<a href="/manga/${encodeURIComponent(w.slug)}"><b>${esc(w.title)}</b><small>${esc(kinds[w.kind])}</small>${icon('arrow')}</a>`).join(''):empty('لا نتائج لهذا العنوان');}catch(err){if(version===searchVersion)$('#suggestions').innerHTML=empty('تعذر البحث',err.message);}},250);
  };
  $('#authSwitch').onclick=()=>openAuth(authMode==='login');
  $('#authForm').onsubmit=async e=>{
    e.preventDefault();const f=e.currentTarget,b=$('#authSubmit');b.disabled=true;$('#authError').textContent='';
    const body={email:f.email.value,password:f.password.value,website:f.website.value};if(authMode==='register')body.username=f.username.value;
    try{
      const d=await post('/api/auth/'+authMode,body);me=d.user;
      const check=await api('/api/me');
      if(!check.user){me=null;throw Error('المتصفح لم يحفظ جلسة الدخول. افتح المعاينة في تبويب مستقل واسمح بملفات تعريف الارتباط.');}
      me=check.user;await applyAccountPreferences();syncAuth();closeModal('authModal');toast('أهلًا بك، '+me.username);
      if(['/login','/register'].includes(location.pathname))go('/profile');else render();
    }catch(err){$('#authError').textContent=err.message;}finally{b.disabled=false;}
  };
  $('#reportForm').onsubmit=async e=>{
    e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;$('#reportMessage').textContent='';
    const body={target_type:f.target_type.value,reason:f.reason.value,details:f.details.value};if(f.target_id.value)body.target_id=Number(f.target_id.value);
    try{const d=await post('/api/reports',body);$('#reportMessage').textContent='استلمنا بلاغك رقم '+d.id+'. شكرًا لاهتمامك.';f.details.value='';}catch(err){$('#reportMessage').textContent=err.message;}finally{b.disabled=false;}
  };
  window.onpopstate=()=>{closeDrawers();render();};
}
bindGlobal();
Promise.all([api('/api/me'),api('/api/site')]).then(async ([account,site])=>{
  brandSettings=site.settings||{};
  $$('.brand-name').forEach(label=>{
    if(brandSettings.site_name)label.firstChild.nodeValue=String(brandSettings.site_name).split('&')[0].trim();
    if(brandSettings.logo_text)label.querySelector('small').textContent=brandSettings.logo_text;
  });
  if(brandSettings.site_description)$('meta[name="description"]').content=brandSettings.site_description;
  me=account.user;if(me)await applyAccountPreferences();applyPreferences();syncAuth();render();
}).catch(()=>render());
