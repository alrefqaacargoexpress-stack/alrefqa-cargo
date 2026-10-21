import json, os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:3000')
OUTPUT = os.path.join(os.path.dirname(__file__), '..', 'test-results')
os.makedirs(OUTPUT, exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width in (390, 1366):
        context = browser.new_context(viewport={'width':width,'height':900})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE, wait_until='networkidle')
        for lang in ('ar','en','zh','tr'):
            page.locator('select').first.select_option(lang)
            page.wait_for_function('(lang) => document.documentElement.lang === lang', arg=lang)
            assert page.evaluate('document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
            assert page.locator('h1').inner_text().strip()
            assert page.locator('#offices article').count() == 4
            assert page.locator('#services article').count() == 4
            assert page.evaluate('Array.from(document.querySelectorAll("a[href^=\\"#\\"]")).every(a=>document.getElementById(a.getAttribute("href").slice(1)))')
            assert page.evaluate('Array.from(document.querySelectorAll("a[href*=\\"wa.me\\"]")).every(a=>!a.href.includes("wa.me/+"))')
            header_overflow = page.evaluate('document.querySelector("header").scrollWidth > window.innerWidth + 1')
            if header_overflow: raise AssertionError(f'Header overflow at {width}px in {lang}')
            results.append({'case':f'{lang}-{width}','ok':True,'direction':page.evaluate('document.documentElement.dir')})
        page.locator('select').first.select_option('en')
        page.locator('#tracking button').click()
        assert page.locator('#tracking [role=alert]').count() == 1
        assert 'Please' in page.locator('#tracking [role=alert]').inner_text() or page.locator('#tracking [role=alert]').inner_text()
        page.screenshot(path=os.path.join(OUTPUT,f'public-{width}.png'),full_page=True)
        page.reload(wait_until='networkidle')
        assert page.evaluate('document.documentElement.lang') == 'en'
        assert not errors, errors
        context.close()
    browser.close()
with open(os.path.join(OUTPUT,'public-results.json'),'w') as f: json.dump(results,f,indent=2)
print(json.dumps({'passed':len(results),'cases':results},ensure_ascii=False))
