import json, os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TEST_BASE_URL','http://127.0.0.1:3000')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844})
 page=context.new_page();errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.goto(BASE,wait_until='networkidle')
 page.wait_for_function('navigator.serviceWorker.controller !== null',timeout=30000)
 cached=page.evaluate('''async()=>{ const result=[];for(const key of await caches.keys())for(const request of await (await caches.open(key)).keys())result.push(new URL(request.url).pathname);return result;}''')
 assert any(path.startswith('/assets/') and path.endswith('.js') for path in cached)
 assert not any(path.startswith('/api/') or path.startswith('/manus-oauth/') for path in cached),cached
 context.set_offline(True)
 page.reload(wait_until='domcontentloaded')
 page.locator('#services').wait_for(timeout=15000)
 assert page.locator('#offices article').count()==4
 page.locator('select').first.select_option('zh')
 page.wait_for_function('document.documentElement.lang==="zh"')
 assert not errors,errors
 context.set_offline(False)
 print(json.dumps({'offlineReload':'passed','languageSwitchOffline':'passed','cachedFiles':len(cached),'sensitiveApiCached':False}))
 browser.close()
