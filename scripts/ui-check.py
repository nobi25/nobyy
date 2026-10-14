from pathlib import Path
import os, json, time, tempfile, subprocess, shutil
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
preview='https://8328-ilnlb75cbiq0fm6i5gg2o-72054fe0.sg2.manus.computer'
results=[]
temp=tempfile.mkdtemp(prefix='noby-ui-')
env={**os.environ,'NODE_ENV':'test','PUBLIC_PREVIEW':'false','PORT':'3138','DATABASE_PATH':temp+'/test.sqlite','SESSION_DIR':temp+'/sessions','SESSION_SECRET':'isolated-ui-test-session-12345678901234567890','ADMIN_EMAIL':'owner@uitest.invalid','ADMIN_PASSWORD':'Fixture-UI-Owner-123!'}
server=None
try:
    subprocess.run(['node','scripts/seed.js'],cwd=root,env=env,check=True,stdout=subprocess.DEVNULL)
    server=subprocess.Popen(['node','src/server.js'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1366,'height':900})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(preview);page.wait_for_selector('.hero')
        for width in [1366,768,390,360]:
            page.set_viewport_size({'width':width,'height':900})
            geometry=page.evaluate('({viewport:innerWidth,document:document.documentElement.scrollWidth})')
            if geometry['document']>width+1:
                page.screenshot(path=str(root/'responsive-defect.png'),full_page=True)
                raise AssertionError('Horizontal overflow '+str(geometry))
            results.append('no horizontal overflow at '+str(width))
        light=page.locator('body').evaluate('e=>getComputedStyle(e).backgroundColor')
        page.locator('#themeToggle').click()
        dark=page.locator('body').evaluate('e=>getComputedStyle(e).backgroundColor')
        assert light!=dark;results.append('light/dark visibly distinct')
        page.locator('#themeToggle').click()
        page.locator('#searchToggle').click();page.locator('#globalSearch').fill('التاج')
        page.wait_for_selector('#suggestions a');results.append('search suggestions from API')
        page.locator('#globalSearchForm button').click();page.wait_for_selector('.filter-bar')
        assert page.locator('.work-card').count()==1;results.append('Arabic search filtered library')
        page.close()
        page=browser.new_page(viewport={'width':1366,'height':900})
        page.on('pageerror',lambda e:errors.append(str(e)))
        for attempt in range(40):
            try:page.goto('http://127.0.0.1:3138');break
            except Exception:time.sleep(.1)
        page.wait_for_selector('.hero')
        page.locator('#registerOpen').click()
        page.locator('#authForm [name=email]').fill('ui@uitest.invalid')
        page.locator('#authForm [name=username]').fill('ui_reader')
        page.locator('#authForm [name=password]').fill('Fixture-UI-Reader-123!')
        page.locator('#authSubmit').click();page.wait_for_selector('#profileBtn:not(.hidden)')
        assert page.locator('#authModal').evaluate('e=>e.classList.contains("hidden")');results.append('registration persists real session')
        page.goto('http://127.0.0.1:3138/manga/the-astral-crown');page.wait_for_selector('[data-favorite]')
        page.locator('[data-favorite]').click();page.wait_for_selector('[data-favorite][aria-pressed=true]')
        results.append('favorite state updates')
        page.locator('#chapterSearch').fill('99999')
        assert page.locator('.chapter-list>a:visible').count()==0;results.append('chapter search filters')
        page.locator('#chapterSearch').fill('')
        page.locator('[data-report=work]').click()
        assert page.locator('#reportForm [name=target_id]').input_value()!='';results.append('report retains entity ID')
        page.locator('#reportModal .modal-close').click()
        page.locator('.work-intro .btn.primary').click();page.wait_for_selector('.reader-pages')
        page.locator('[data-reader-mode=single]').click()
        assert page.locator('.reader-pages figure:visible').count()==1
        page.locator('#nextPage').click()
        assert page.locator('.reader-pages figure:visible').get_attribute('data-page')=='1';results.append('single-page next button works')
        page.locator('#readerFit').click();assert page.locator('.reader-pages').evaluate('e=>e.classList.contains("fit-wide")');results.append('reader fit-width works')
        page.goto('http://127.0.0.1:3138/profile');page.wait_for_selector('.profile-head')
        assert page.locator('.works-grid .work-card').count()==1;results.append('personal favorites shown')
        page.locator('#logoutBtn').click();page.wait_for_selector('#loginOpen:not(.hidden)');results.append('logout')
        page.locator('#loginOpen').click()
        page.locator('#authForm [name=email]').fill('owner@uitest.invalid')
        page.locator('#authForm [name=password]').fill('Fixture-UI-Owner-123!')
        page.locator('#authSubmit').click();page.wait_for_selector('#profileBtn:not(.hidden)')
        page.goto('http://127.0.0.1:3138/admin.html');page.wait_for_selector('#stats .stat')
        page.wait_for_function('document.querySelector("#apiStatus").textContent==="متصل"')
        for tab in ['works','reports','users','automation','analytics']:
            page.locator('.nav[data-page='+tab+']').click()
            page.wait_for_function('(p)=>!document.querySelector("#page-"+p).classList.contains("hidden")',arg=tab)
        results.append('admin API telemetry and navigation')
        assert not errors,errors
        results.append('no uncaught JavaScript page errors')
        browser.close()
    print(json.dumps({'status':'PASS','checks':results},ensure_ascii=False,indent=2))
finally:
    if server:server.terminate();server.wait(timeout=10)
    shutil.rmtree(temp,ignore_errors=True)
