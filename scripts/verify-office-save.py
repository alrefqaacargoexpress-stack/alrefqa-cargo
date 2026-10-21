import copy, json, subprocess
from urllib.parse import unquote, urlsplit, parse_qs
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3000'
script = "import {branchSettingsCopyFor} from './client/src/lib/branchSettingsCopy'; import {publicShippingCopyFor} from './client/src/lib/publicShippingCopy'; import {walletCopyFor} from './client/src/lib/walletCopy'; console.log(JSON.stringify({profile:branchSettingsCopyFor('en'), shipping:publicShippingCopyFor('en'), wallet:walletCopyFor('en')}))"
labels = json.loads(subprocess.run(['pnpm','exec','tsx','-e',script],capture_output=True,text=True,check=True).stdout)
c, s, w = labels['profile'], labels['shipping'], labels['wallet']
profiles = [{'officeId':office,'address':'Saved '+office+' address','phone':'','timezone':tz,'gps':{'lat':0,'lng':0},'hours':[],'employees':[{'id':'legacy-contact','name':'Existing contact','phone':'+22212345678'}],'version':1} for office,tz in [('nouakchott','Africa/Nouakchott'),('dubai','Asia/Dubai'),('china','Asia/Shanghai'),('turkey','Europe/Istanbul')]]
wallet = {'office':'nouakchott','version':0,'methods':[{'id':id,'label':label,'enabled':True} for id,label in [('bankily','Bankily'),('masrvi','Masrvi'),('gazapay','Gazapay'),('sedad','Sedad'),('cash','Cash')]]}
state = {'accounts':[],'shipments':[],'invoices':[],'lastSyncedAt':None}
requests = []; failures = {'profile': 'INTERNAL_SERVER_ERROR'}

def response_error(code, path):
    return {'error':{'json':{'message':'test-'+code,'code':-32000,'data':{'code':code,'httpStatus':409 if code=='CONFLICT' else 500,'path':path}}}}

def args_for(req, index):
    raw = json.loads(req.post_data or '{}') if req.method == 'POST' else json.loads(parse_qs(urlsplit(req.url).query).get('input',['{}'])[0])
    value = raw.get(str(index),raw)
    return value.get('json',value) or {}

def public_wallet():
    result=[]
    for method in wallet['methods']:
        if not method.get('enabled') or not method.get('showToCustomers'): continue
        if method['id'] != 'cash' and not method.get('accountNumber'): continue
        result.append({k:method[k] for k in ['id','label','accountNumber','accountName','instructions'] if method.get(k)})
    return {'office':'nouakchott','methods':result}

def handle(route):
    req=route.request; names=unquote(urlsplit(req.url).path.split('/api/trpc/')[-1]).split(','); output=[]
    for i,name in enumerate(names):
        args=args_for(req,i)
        if name=='auth.me': value={'id':9087,'name':'Test manager','role':'user','email':'private@example.test'}
        elif name=='operations.access': value={'role':'admin','userId':9087,'offices':None,'membershipVersion':0}
        elif name=='operations.snapshot': value=state
        elif name in ['branches.public','branches.profiles']: value=profiles
        elif name in ['branches.members','operations.members']: value=[]
        elif name=='office.get': value=wallet
        elif name=='office.public': value=public_wallet()
        elif name=='branches.update':
            requests.append(copy.deepcopy(args))
            if failures['profile']:
                output.append(response_error(failures['profile'],name)); failures['profile']=None; continue
            old=next(p for p in profiles if p['officeId']==args['officeId'])
            assert 'baseProfile' in args and args['baseProfile']['officeId']==old['officeId']
            desired={k:v for k,v in args.items() if k not in ['baseProfile','expectedVersion']}
            old.update(copy.deepcopy(desired)); old['version']+=1; value=old
        elif name=='office.update':
            assert args['expectedVersion']==wallet['version']; wallet['methods']=args['methods'];wallet['version']+=1;value=wallet
        else:
            raise AssertionError('Unexpected API: '+name)
        output.append({'result':{'data':{'json':copy.deepcopy(value)}}})
    route.fulfill(status=200,content_type='application/json',body=json.dumps(output if 'batch=1' in req.url else output[0]))

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':390,'height':844});ctx.add_init_script("localStorage.setItem('alrefqaa-language','en')")
    ctx.route('**/api/trpc/**',handle);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:d.accept());page.set_default_timeout(8000)
    page.goto(BASE+'/operations/settings?office=china',wait_until='networkidle')
    assert page.get_by_role('heading',name=c['employees'],exact=True).count()==0
    address=page.get_by_label(c['address'],exact=True);address.fill('New China address')
    page.get_by_label(s['seaAddress'],exact=True).fill('Owner-entered China sea warehouse')
    rates={'airRegular':'400','airExpress':'600','sensitive':'800','sea':'1200'}
    for key,amount in rates.items():page.get_by_label(s['serviceLabels'][key],exact=True).fill(amount)
    page.get_by_label(s['unit'],exact=False).nth(3).select_option('m3')
    save=page.get_by_role('button',name=c['saveProfile'],exact=True)
    save.click();page.get_by_text(s['saveFailed'],exact=True).wait_for()
    assert page.get_by_text(s['conflictError'],exact=True).count()==0
    assert address.input_value()=='New China address'
    assert page.get_by_label(s['serviceLabels']['airRegular'],exact=True).input_value()=='400'
    save.click();page.get_by_text(c['saved'],exact=True).wait_for()
    assert requests[-1]['expectedVersion']==1
    assert requests[-1]['gps']=={'lat':0,'lng':0}
    assert requests[-1]['employees'][0]['id']=='legacy-contact'
    assert requests[-1]['shippingRates']['sea']=={'amount':1200,'currency':'MRU','unit':'m3'}
    # A real conflict keeps the draft and a cancelled reload does not erase it.
    address.fill('Conflicting unsaved draft');failures['profile']='CONFLICT';save.click()
    page.get_by_text(s['conflictError'],exact=True).wait_for();assert address.input_value()=='Conflicting unsaved draft'
    print('Verified profile errors, draft retention and acknowledged save', flush=True)
    page.goto(BASE+'/operations/settings?office=nouakchott',wait_until='networkidle')
    bank=page.locator('article').filter(has=page.locator('input[value="Bankily"]'))
    bank.get_by_label(w['accountNumber'],exact=True).fill('+22298765432')
    bank.get_by_label(w['accountName'],exact=True).fill('Owner entered beneficiary')
    bank.get_by_label(w['instructions'],exact=True).fill('Use shipment reference in transfer note')
    bank.get_by_label(w['showToCustomers'],exact=False).check()
    page.get_by_role('button',name=w['save'],exact=True).click();page.get_by_text(w['saved'],exact=True).wait_for()
    page.goto(BASE+'/',wait_until='networkidle');text=page.locator('body').inner_text()
    for value in ['Owner-entered China sea warehouse','400','600','800','1200','MRU','Owner entered beneficiary','+22298765432']:
        assert value in text.replace(',', ''),value
    assert '20066062' not in text and '22106435' not in text,'Old fixed wallet numbers must not bypass public settings'
    assert 'private@example.test' not in text
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
    bankily=next(m for m in wallet['methods'] if m['id']=='bankily');bankily['showToCustomers']=False
    page.reload(wait_until='networkidle');assert '+22298765432' not in page.locator('body').inner_text()
    assert not errors,errors
    print(json.dumps({'serverFailureNotMisreportedAsConflict':True,'draftPreservedOnFailureAndConflict':True,'baselineSentWithSave':True,'legacyGpsAndContactsPreserved':True,'fourPublicRatesAndSeaAddress':True,'walletSavedAndCustomerVisible':True,'walletPrivacyAndNoHardcodedNumbers':True,'mobileLayout':True,'liveDatabaseWrites':0}))
    browser.close()
