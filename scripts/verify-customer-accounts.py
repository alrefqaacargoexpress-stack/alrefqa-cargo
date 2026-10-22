import json, subprocess
from urllib.parse import unquote, urlsplit
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
BASE = 'http://127.0.0.1:3000'
USER = 99102
stamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
copy = json.loads(subprocess.run(['pnpm','exec','tsx','-e',"import {customerAccountCopy} from './client/src/lib/customerAccountCopy';console.log(JSON.stringify(customerAccountCopy))"], capture_output=True, text=True, check=True).stdout)['ar']
accounts = [{'id':'account-initial','name':'حساب أصلي','phone':'+22211111111','city':'','shipments':0,'balance':0,'officeId':'nouakchott','scope':'shared','version':1,'updatedAt':stamp}]
shipments = [{'id':'unrelated-shipment','tracking':'SHIP-1','account':'بضاعة ليست حساب عميل','route':'دبي إلى نواكشوط','service':'جوي','status':'في الطريق','eta':stamp,'amount':0,'officeId':'nouakchott','scope':'shared','version':1}]
entries, invoices, saved = [], [], []
def api(route):
    req = route.request
    if '/api/trpc/' not in req.url:
        route.fulfill(status=404, body='isolated test'); return
    names = unquote(urlsplit(req.url).path.split('/api/trpc/')[-1]).split(',')
    body = json.loads(req.post_data or '{}')
    result = []
    for index, name in enumerate(names):
        raw = body.get(str(index), body); args = raw.get('json', raw)
        if name == 'auth.me': value = {'id':USER,'name':'اختبار واجهة','email':'test@example.test','role':'user'}
        elif name == 'operations.access': value = {'userId':USER,'role':'accountant','offices':['nouakchott'],'homeOffice':'nouakchott'}
        elif name == 'operations.snapshot': value = {'accounts':accounts,'shipments':shipments,'invoices':invoices,'lastSyncedAt':stamp}
        elif name == 'finance.snapshot': value = {'offices':['nouakchott'],'homeOffice':'nouakchott','invoices':invoices,'entries':entries,'lastReadAt':stamp}
        elif name == 'office.public': value = {'office':'nouakchott','name':'مكتب نواكشوط','methods':[],'version':0}
        elif name == 'operations.sync':
            applied=[]
            for change in args['changes']:
                assert change['entity']=='account', 'unrelated operation was sent'
                record = {**change['data'],'scope':'shared','version':1}
                accounts.append(record); saved.append(change)
                applied.append({'changeId':change['id'],'entity':'account','record':record})
            value={'applied':applied,'conflicts':[]}
        elif name == 'finance.sync':
            applied=[]
            assert len(args['commands'])==1
            for command in args['commands']:
                assert command['kind']=='customer_movement'
                p=command['payload']; kind='customer_credit' if p['direction']=='credit' else 'customer_debit'
                item={'id':p['movementId'],'kind':kind,'customerId':p['customerId'],'customerName':next(a['name'] for a in accounts if a['id']==p['customerId']),'officeId':p['officeId'],'amount':p['amount'],'currency':p['currency'],'date':p['date'],'description':p['description'],'actorId':USER,'actorName':'اختبار واجهة','recordedAt':stamp}
                if not any(e['id']==item['id'] for e in entries): entries.append(item)
                applied.append({'commandId':command['id'],'entries':[item]}); saved.append(command)
            value={'applied':applied,'conflicts':[]}
        else: value=[]
        result.append({'result':{'data':{'json':value}}})
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result if 'batch=1' in req.url else result[0]))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
    context.add_init_script("localStorage.setItem('alrefqaa-language','ar')")
    context.route('**/api/**',api)
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('dialog',lambda dialog:dialog.accept())
    page.goto(BASE+'/operations/customers',wait_until='networkidle')
    assert 'بضاعة ليست حساب عميل' not in page.locator('main').inner_text()
    page.get_by_role('button',name=copy['newAccount'],exact=True).click()
    page.get_by_label(copy['name'],exact=True).fill('عميل الحساب الجديد')
    page.get_by_label(copy['phone'],exact=True).fill('+22212345678')
    page.get_by_role('button',name=copy['save'],exact=True).click()
    page.get_by_text('عميل الحساب الجديد',exact=True).wait_for(timeout=15000)
    assert len(accounts)==2 and accounts[-1]['city']==''
    customer=accounts[-1]
    page.goto(BASE+'/operations/customers/'+customer['id'],wait_until='networkidle')
    page.get_by_label(copy['amount'],exact=True).fill('75.50')
    page.get_by_label(copy['addDescription'],exact=True).fill('دفعة لصالح العميل')
    page.get_by_role('button',name=copy['saveMovement'],exact=True).click()
    page.get_by_text(copy['sharedSuccess'],exact=True).wait_for(timeout=15000)
    assert len(entries)==1 and entries[0]['amount']==75.5
    assert page.get_by_label(copy['amount'],exact=True).input_value()==''
    assert 'بضاعة ليست حساب عميل' not in page.locator('main').inner_text()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    page.goto(BASE+'/operations?tab=accounts&office=nouakchott',wait_until='networkidle')
    page.wait_for_url('**/operations/customers?office=nouakchott')
    assert not errors, errors
    print(json.dumps({'accountCreationWithoutCity':True,'accountListExcludesGoods':True,'specificAccountAcknowledged':True,'customerCreditPostedOnce':True,'inputClearedOnlyAfterAcknowledgement':True,'legacyOfficeLinkRedirects':True,'mobileNoOverflow':True,'liveDatabaseWrites':0}))
    browser.close()
