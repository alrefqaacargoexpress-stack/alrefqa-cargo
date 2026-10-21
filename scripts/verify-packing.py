import json, math, subprocess
from urllib.parse import unquote,urlsplit
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:3000'
USER_ID=9010
KEY=f'alrefqa-copy-workspace-v2-{USER_ID}'
cp=json.loads(subprocess.run(['pnpm','exec','tsx','-e',"import {packingCopy} from './client/src/lib/packingCopy'; console.log(JSON.stringify(packingCopy))"],capture_output=True,text=True,check=True).stdout)
c=cp['en']; server={'accounts':[],'shipments':[],'invoices':[],'lastSyncedAt':None};sent=[]
def route_api(route):
 req=route.request;names=unquote(urlsplit(req.url).path.split('/api/trpc/')[-1]).split(',');body=json.loads(req.post_data or '{}');output=[]
 for index,name in enumerate(names):
  if name=='auth.me': value={'id':USER_ID,'name':'Packing test','email':'test@example.test','role':'user'}
  elif name=='operations.access': value={'userId':USER_ID,'role':'admin'}
  elif name=='operations.snapshot': value=server
  elif name=='operations.sync':
   args=body.get(str(index),body);changes=args.get('json',args).get('changes',[]);sent.extend(changes);applied=[]
   for change in changes:
    record={**change['data'],'scope':'shared','version':(change['expectedVersion'] or 0)+1}
    key={'account':'accounts','shipment':'shipments','invoice':'invoices'}[change['entity']]
    server[key]=[row for row in server[key] if row['id']!=record['id']]+[record]
    applied.append({'changeId':change['id'],'entity':change['entity'],'record':record})
   value={'applied':applied,'conflicts':[]}
  else:value=[]
  output.append({'result':{'data':{'json':value}}})
 route.fulfill(status=200,content_type='application/json',body=json.dumps(output if 'batch=1' in req.url else output[0]))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':390,'height':844});ctx.add_init_script("if(!localStorage.getItem('alrefqaa-language'))localStorage.setItem('alrefqaa-language','en')")
 ctx.route('**/api/trpc/**',route_api);page=ctx.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 def stored():return page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}'))")
 def shipment(id):return next(s for s in stored()['state']['shipments'] if s['id']==id)
 def new(number,source,rate):
  page.goto(BASE+'/operations/shipments/new',wait_until='networkidle');page.get_by_label(c['shipmentNumber'],exact=True).fill(number)
  page.get_by_label(c['source'],exact=True).select_option(source);page.get_by_label(c['pricePerKg'],exact=True).fill(str(rate));page.get_by_role('button',name=c['createShipment'],exact=True).click()
  page.get_by_label(c['nameOrBrand'],exact=True).wait_for();return page.url.rsplit('/',1)[-1]
 def add(name,weight,pieces,phone=''):
  page.get_by_label(c['nameOrBrand'],exact=True).fill(name);page.get_by_label(c['unitWeight'],exact=True).fill(str(weight));page.get_by_label(c['pieces'],exact=True).fill(str(pieces))
  page.get_by_label(c['phone']+' ('+c['optional']+')',exact=True).fill(phone);page.get_by_role('button',name=c['addGoods'],exact=True).click()
  page.wait_for_function('(label)=>document.querySelector(`input[aria-label="${label}"]`).value===""',arg=c['nameOrBrand'])
 first=new('RF-TEST-001','china',4.5)
 assert shipment(first)['packing']['cartons']==[{'number':1,'closed':False,'goods':[]}]
 add('Brand One',1.001,2)
 page.get_by_role('button',name=c['closeCarton'],exact=True).click()
 page.wait_for_function(f"JSON.parse(localStorage.getItem('{KEY}')).state.shipments.find(s=>s.id==='{first}').packing.cartons.length===2")
 add('brand one',2,3,'+22200022');original=shipment(first)
 assert len(original['packing']['cartons'][0]['goods'])==1 and original['packing']['cartons'][0]['closed']
 grams=sum(round(g['unitWeight']*1000)*g['pieces'] for ct in original['packing']['cartons'] for g in ct['goods'])
 assert original['amount']==round((grams/1000)*4.5,2)
 assert original['packing']['cartons'][0]['goods'][0]['phone']==''
 second=new('RF-TEST-002','turkey',3)
 assert len(stored()['state']['shipments'])==2 and shipment(second)['packing']['cartons'][0]['goods']==[]
 # A client-side path change proves detail state is derived from the correct live shipment.
 page.evaluate('(path)=>{history.pushState({},"",path);dispatchEvent(new PopStateEvent("popstate"));}',f'/operations/shipments/{first}')
 page.get_by_text('RF-TEST-001',exact=True).wait_for();assert page.get_by_text('RF-TEST-002',exact=True).count()==0
 page.reload(wait_until='networkidle');assert shipment(first)['packing']['cartons'][0]['closed'];assert shipment(first)['amount']==original['amount']
 page.goto(BASE+'/operations/customers',wait_until='networkidle');search=page.locator('main input').first;search.fill('00022');assert 'Brand One' in page.locator('main').inner_text()
 search.fill('not-found-customer');assert 'Brand One' not in page.locator('main').inner_text()
 page.goto(BASE+f'/operations/shipments/{first}',wait_until='networkidle');page.get_by_role('button',name=c['closeCarton'],exact=True).click()
 page.wait_for_function(f"JSON.parse(localStorage.getItem('{KEY}')).state.shipments.find(s=>s.id==='{first}').packing.cartons.length===3")
 page.get_by_role('button',name=c['sendShipment'],exact=True).click();page.get_by_role('button',name=c['markDelivered'],exact=True).wait_for();page.get_by_role('button',name=c['markDelivered'],exact=True).click()
 page.wait_for_function(f"JSON.parse(localStorage.getItem('{KEY}')).state.shipments.find(s=>s.id==='{first}').status==='مسلّمة'")
 page.get_by_role('button',name=c['sync'],exact=False).click();page.wait_for_function(f"JSON.parse(localStorage.getItem('{KEY}')).queue.length===0")
 assert len(sent)==2 and shipment(first)['scope']=='shared'
 page.goto(BASE+'/operations/reports',wait_until='networkidle');assert 'RF-TEST-001' in page.locator('main').inner_text() and 'RF-TEST-002' in page.locator('main').inner_text()
 for lang in ('ar','zh','tr','en'):
  page.locator('select').first.select_option(lang);page.wait_for_function('(lang)=>document.documentElement.lang===lang',arg=lang)
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
 page.goto(BASE+f'/operations/shipments/{second}',wait_until='networkidle');page.wait_for_function('navigator.serviceWorker.controller!==null')
 ctx.unroute('**/api/trpc/**');ctx.set_offline(True);page.reload(wait_until='domcontentloaded')
 page.get_by_role('button',name=c['openLocal'],exact=True).click();page.get_by_label(c['nameOrBrand'],exact=True).wait_for();add('Offline Brand',0.125,4)
 assert shipment(second)['packing']['cartons'][0]['goods'][0]['name']=='Offline Brand';assert page.get_by_role('button',name=c['sync'],exact=False).is_disabled()
 assert not errors,errors
 print(json.dumps({'simpleCreation':True,'optionalPhone':True,'decimalWeight':True,'automaticNextCarton':True,'repeatedBrandAggregates':True,'multipleShipments':True,'clientSideSwitch':True,'reloadPreservesOrder':True,'customerPhoneSearch':True,'reportsAndFourLanguages':True,'serverAcknowledgedChanges':len(sent),'offlineDraftSave':True,'liveDatabaseWrites':0}))
 browser.close()
