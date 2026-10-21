import json, subprocess
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:3000'
USER=9020
KEY=f'alrefqa-copy-workspace-v2-{USER}'
cp=json.loads(subprocess.run(['pnpm','exec','tsx','-e',"import {packingCopy} from './client/src/lib/packingCopy'; console.log(JSON.stringify(packingCopy))"],capture_output=True,text=True,check=True).stdout)
c=cp['en']; db={'accounts':[],'shipments':[],'invoices':[],'lastSyncedAt':None}; sent=[]
def mock(route):
 req=route.request; names=unquote(urlsplit(req.url).path.split('/api/trpc/')[-1]).split(','); body=json.loads(req.post_data or '{}'); output=[]
 for i,name in enumerate(names):
  if name=='auth.me':value={'id':USER,'name':'Correction test','role':'user'}
  elif name=='operations.access':value={'userId':USER,'role':'admin'}
  elif name=='operations.snapshot':value=db
  elif name=='operations.sync':
   changes=body.get(str(i),body).get('json',{}).get('changes',[]);applied=[];sent.extend(changes)
   for change in changes:
    record={**change['data'],'scope':'shared','version':(change['expectedVersion'] or 0)+1}
    db['shipments']=[s for s in db['shipments'] if s['id']!=record['id']]+[record]
    applied.append({'changeId':change['id'],'entity':'shipment','record':record})
   value={'applied':applied,'conflicts':[]}
  else:value=[]
  output.append({'result':{'data':{'json':value}}})
 route.fulfill(status=200,content_type='application/json',body=json.dumps(output if 'batch=1' in req.url else output[0]))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':390,'height':844});ctx.add_init_script("if(!localStorage.getItem('alrefqaa-language'))localStorage.setItem('alrefqaa-language','en')")
 ctx.route('**/api/trpc/**',mock);page=ctx.new_page();dialogs=[];cancel=[False];errors=[]
 def dialog(d):
  dialogs.append(d.message)
  if cancel[0]:d.dismiss()
  else:d.accept()
 page.on('dialog',dialog);page.on('pageerror',lambda e:errors.append(str(e)))
 def stored():return page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}'))")
 def goods():return stored()['state']['shipments'][0]['packing']['cartons'][0]['goods']
 def add(name,weight,count,phone=''):
  page.get_by_label(c['nameOrBrand'],exact=True).fill(name);page.get_by_label(c['unitWeight'],exact=True).fill(str(weight));page.get_by_label(c['pieces'],exact=True).fill(str(count));page.get_by_label(c['phone']+' ('+c['optional']+')',exact=True).fill(phone)
  page.get_by_role('button',name=c['addGoods'],exact=True).click();page.wait_for_function('(label)=>document.querySelector(`input[aria-label="${label}"]`).value===""',arg=c['nameOrBrand'])
 page.goto(BASE+'/operations/shipments/new',wait_until='networkidle')
 page.get_by_label(c['shipmentNumber'],exact=True).fill('RF-CORRECTION-01');page.get_by_label(c['source'],exact=True).select_option('china');page.get_by_label(c['pricePerKg'],exact=True).fill('4');page.get_by_label(c['mruPriceLabel'],exact=True).fill('120')
 page.get_by_role('button',name=c['createShipment'],exact=True).click();page.get_by_label(c['nameOrBrand'],exact=True).wait_for();detail=page.url
 add('Brand One',2,3);add('brand one',4,2,'+22200123')
 assert len(goods())==2
 assert page.locator('article details').count()==1
 group=page.locator('article details').first;summary=group.locator('summary').inner_text()
 assert '14 kg' in summary and c['repetitions'] in summary and c['actualPieces'] in summary
 assert stored()['state']['shipments'][0]['packing']['pricePerKgMRU']==120
 assert '1,680.00 MRU' in page.locator('main').inner_text()
 # Search matches the phone but the group retains its full actual quantity and weight.
 search=page.get_by_label(c['searchShipment'],exact=True);search.fill('00123');assert page.locator('article details').count()==1;assert '14 kg' in page.locator('article details summary').inner_text()
 search.fill('not-present');assert page.locator('article details').count()==0;search.fill('1');assert page.locator('article details').count()==1;search.fill('')
 group.locator('summary').click();cancel[0]=True;group.get_by_role('button',name=c['delete'],exact=True).first.click()
 assert all('deleted' not in row for row in goods());assert 'Brand One' in dialogs[-1] and '3' in dialogs[-1] and '2' in dialogs[-1]
 cancel[0]=False;group.get_by_role('button',name=c['delete'],exact=True).first.click();page.wait_for_function(f"Boolean(JSON.parse(localStorage.getItem('{KEY}')).state.shipments[0].packing.cartons[0].goods[0].deleted)")
 assert len(goods())==2 and goods()[0]['deleted']['reason'];assert stored()['state']['shipments'][0]['amount']==4*2*4
 assert '960.00 MRU' in page.locator('main').inner_text()
 page.reload(wait_until='networkidle');assert goods()[0]['deleted'];page.get_by_label(c['showDeleted'],exact=True).check();group=page.locator('article details').first;group.locator('summary').click();group.get_by_role('button',name=c['restore'],exact=True).click()
 page.wait_for_function(f"!JSON.parse(localStorage.getItem('{KEY}')).state.shipments[0].packing.cartons[0].goods[0].deleted")
 assert stored()['state']['shipments'][0]['amount']==(2*3+4*2)*4
 assert '1,680.00 MRU' in page.locator('main').inner_text()
 # Search the shipment list by stored customer phone, not just the tracking number.
 page.goto(BASE+'/operations/shipments',wait_until='networkidle');page.locator('main input').first.fill('00123');assert 'RF-CORRECTION-01' in page.locator('main').inner_text()
 page.goto(detail,wait_until='networkidle');page.get_by_role('button',name=c['closeCarton'],exact=True).click();page.wait_for_function(f"JSON.parse(localStorage.getItem('{KEY}')).state.shipments[0].packing.cartons.length===2")
 page.get_by_role('button',name=c['sendShipment'],exact=True).click();page.get_by_role('button',name=c['markDelivered'],exact=True).wait_for()
 page.locator('article details').first.locator('summary').click();assert page.get_by_role('button',name=c['delete'],exact=True).count()==0
 for lang in ('ar','zh','tr','en'):
  page.locator('select').first.select_option(lang);page.wait_for_function('(lang)=>document.documentElement.lang===lang',arg=lang);assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
 assert not errors,errors
 print(json.dumps({'mruPrice':True,'sourcePricePreserved':True,'oneGroupedItemPerRepeatedName':True,'repetitionAndPhysicalCounts':True,'phoneAndCartonSearch':True,'cancelDelete':True,'deleteOneNotAll':True,'recalculatedMRU':True,'persistentTombstone':True,'restoredExactEntry':True,'noDeletionAfterShipment':True,'fourLanguagesPhoneLayout':True,'liveDatabaseWrites':0}))
 browser.close()
