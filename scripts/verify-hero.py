import json
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:3000'
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for language,width,height in [('ar',390,844),('en',1024,800),('ar',1440,1000),('zh',1024,800),('tr',1024,800)]:
        context=browser.new_context(viewport={'width':width,'height':height},service_workers='block')
        context.add_init_script(f"localStorage.setItem('alrefqaa-language','{language}')")
        def api(route):
            name=route.request.url.split('/api/trpc/')[-1].split('?')[0]
            value={'office':'nouakchott','name':'مكتب نواكشوط','methods':[],'version':0} if name=='office.public' else []
            data={'result':{'data':{'json':value}}}
            route.fulfill(status=200,content_type='application/json',body=json.dumps([data] if 'batch=1' in route.request.url else data))
        context.route('**/api/trpc/**',api)
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE,wait_until='networkidle')
        hero=page.locator('main > section').first
        image=hero.locator('img');image.wait_for()
        assert image.evaluate('(img)=>img.complete && img.naturalWidth>0')
        heading=hero.locator('h1:visible');assert heading.count()==1
        bounds=hero.bounding_box();h=heading.bounding_box()
        if language=='ar' and width>=1024:assert h['x']>=width/2,{'rtlHeading':h,'width':width}
        for link in hero.locator('a:visible').all():
            b=link.bounding_box()
            assert b['y']>=bounds['y'] and b['y']+b['height']<=bounds['y']+bounds['height']+1,{'clippedLink':b,'hero':bounds,'language':language}
            target=link.get_attribute('href');assert target in ('#offices','#tracking') and page.locator(target).count()==1
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        assert page.locator('#services').count()==0
        assert not errors,errors
        if language=='ar' and width==1440:hero.screenshot(path='test-results/hero-desktop.png')
        results.append({'language':language,'width':width,'imageLoaded':True,'textAndLinksNotClipped':True})
        context.close()
    browser.close()
print(json.dumps({'hero':results,'liveDatabaseWrites':0}))
