"""Read-only UI checks: every /api request is fulfilled by this test, never a live write."""
import asyncio
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:3000'
RESULT = {'found': True, 'shipment': {'tracking': 'RF-TEST-123', 'status': 'in_transit', 'stage': 'dubai_customs', 'branch': 'dubai', 'updatedAt': '2026-10-22T12:00:00.000Z', 'source': 'dubai', 'goods': [{'cartonNumber': 1, 'name': 'OWN-TEST-GOODS', 'pieces': 2, 'unitWeight': 0.25, 'weight': 0.5}], 'totalPieces': 2, 'totalWeight': 0.5}}

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        for language in ('ar', 'en', 'zh', 'tr'):
            context = await browser.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
            await context.add_init_script(f"localStorage.setItem('alrefqaa-language', '{language}');")
            calls = []
            async def route_api(route):
                request = route.request
                if 'publicTracking.lookup' in request.url:
                    assert request.method == 'POST', 'lookup must not use GET'
                    assert '+222' not in request.url and 'phone' not in request.url, 'no phone in URL'
                    body = json.loads(request.post_data or '{}')
                    params = body.get('0', body).get('json', {})
                    calls.append(params)
                    if params.get('tracking') == 'RF-LATE':
                        await asyncio.sleep(0.3)
                    data = RESULT if params.get('phone') == '+22233331234' else {'found': False}
                    envelope = {'result': {'data': {'json': data}}}
                    response = [envelope] if 'batch=1' in request.url else envelope
                    await route.fulfill(status=200, content_type='application/json', body=json.dumps(response), headers={'Cache-Control': 'no-store'})
                elif '/api/platform/config.js' in request.url:
                    await route.continue_()
                else:
                    # Prevent any incidental API from accessing real business data.
                    envelope = {'result': {'data': {'json': None}}}
                    await route.fulfill(status=200, content_type='application/json', body=json.dumps([envelope] if 'batch=1' in request.url else envelope))
            await context.route('**/api/**', route_api)
            page = await context.new_page()
            await page.goto(BASE + '/track', wait_until='networkidle')
            assert await page.title() == 'مؤسسة الرفكة للشحن'
            await page.locator('#public-tracking-number').wait_for()
            submit = page.locator('button[type=submit]')
            assert await submit.is_disabled()
            await page.locator('#public-tracking-number').fill('RF-TEST-123')
            await page.locator('#public-tracking-phone').fill('+22233331234')
            await submit.click()
            await page.get_by_text('OWN-TEST-GOODS', exact=True).wait_for()
            assert len(await page.locator('[aria-current=step]').all()) == 1
            assert 'phone' not in page.url and '+222' not in page.url
            storage = await page.evaluate('JSON.stringify(localStorage)')
            assert '+22233331234' not in storage and 'OWN-TEST-GOODS' not in storage
            await page.locator('#public-tracking-phone').fill('+22233339999')
            assert await page.get_by_text('OWN-TEST-GOODS', exact=True).count() == 0
            await submit.click()
            await page.locator('[role=alert]').wait_for()
            assert await page.get_by_text('OWN-TEST-GOODS', exact=True).count() == 0
            # Late result must be discarded after the input changes.
            await page.locator('#public-tracking-number').fill('RF-LATE')
            await page.locator('#public-tracking-phone').fill('+22233331234')
            await submit.click()
            await page.locator('#public-tracking-phone').fill('+22233339999')
            await page.wait_for_timeout(500)
            assert await page.get_by_text('OWN-TEST-GOODS', exact=True).count() == 0
            overflow = await page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
            assert not overflow, 'page-wide mobile overflow'
            print(json.dumps({'language': language, 'phoneAndShipmentPOST': True, 'wrongPhoneHidden': True, 'lateResultDiscarded': True, 'noPersonalLocalStorage': True, 'mobileFits': True}, ensure_ascii=False))
            await context.close()
        await browser.close()
    print('Public portal UI checks passed. No live business API write was sent.')

if __name__ == '__main__':
    asyncio.run(main())
