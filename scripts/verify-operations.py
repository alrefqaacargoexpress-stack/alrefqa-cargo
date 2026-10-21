import json, os
from urllib.parse import urlsplit, unquote
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TEST_BASE_URL','http://127.0.0.1:3000')
ROLE=os.environ.get('TEST_ROLE','admin')
state={'accounts':[],'shipments':[],'invoices':[],'lastSyncedAt':None}
requests=[]

def mock_route(route):
 request=route.request
 names=unquote(urlsplit(request.url).path.split('/api/trpc/')[-1]).split(',')
 body=json.loads(request.post_data or '{}')
 output=[]
 for index,name in enumerate(names):
  if name=='auth.me': data={'id':9001,'openId':'test-only','name':'Test Operator','email':'test@example.test','role':'user'}
  elif name=='operations.access': data={'userId':9001,'role':ROLE}
  elif name=='operations.snapshot': data=state
  elif name=='operations.members': data=[]
  elif name=='operations.sync':
   payload=body.get(str(index),body)
   changes=payload.get('json',payload).get('changes',[])
   requests.append(changes)
   applied=[]
   for change in changes:
    record={**change['data'],'scope':'shared','version':(change['expectedVersion'] or 0)+1}
    applied.append({'changeId':change['id'],'entity':change['entity'],'record':record})
    key={'account':'accounts','shipment':'shipments','invoice':'invoices'}[change['entity']]
    state[key]=[row for row in state[key] if row['id']!=record['id']]+[record]
   data={'applied':applied,'conflicts':[]}
  else: data=None
  output.append({'result':{'data':{'json':data}}})
 route.fulfill(status=200,content_type='application/json',body=json.dumps(output if 'batch=1' in request.url else output[0]))

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1366,'height':900},service_workers='block')
 context.add_init_script("localStorage.setItem('alrefqaa-language','en')")
 page=context.new_page();errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('dialog',lambda dialog:dialog.accept())
 # Test the real unauthenticated application before adding a network-only test double.
 page.goto(BASE+'/operations',wait_until='networkidle')
 page.get_by_role('heading',name='Sign in required').wait_for()
 assert page.get_by_role('button',name='New account',exact=True).count()==0
 context.route('**/api/trpc/**',mock_route)
 page.reload(wait_until='networkidle')
 page.get_by_role('button',name='New account',exact=True).wait_for()
 page.get_by_role('button',name='New account',exact=True).click()
 dialog=page.get_by_role('dialog')
 dialog.get_by_label('Name',exact=False).fill('Browser test customer')
 dialog.get_by_label('Phone',exact=False).fill('+22200123456')
 dialog.get_by_role('button',name='Save draft',exact=True).click()
 page.get_by_role('dialog').wait_for(state='hidden')
 workspace=page.evaluate("JSON.parse(localStorage.getItem('alrefqa-copy-workspace-v2-9001'))")
 assert workspace['queue'][0]['entity']=='account'
 assert workspace['queue'][0]['data']['phone']=='+22200123456'
 assert workspace['state']['accounts'][0]['city']
 page.get_by_role('button',name='New shipment',exact=True).click()
 dialog=page.get_by_role('dialog')
 dialog.get_by_label('Tracking',exact=False).fill('RF-TEST-001')
 dialog.get_by_label('Account',exact=False).fill('Browser test customer')
 dialog.get_by_label('Route',exact=False).fill('China - Mauritania')
 dialog.get_by_role('button',name='Save draft',exact=True).click()
 page.get_by_role('dialog').wait_for(state='hidden')
 workspace=page.evaluate("JSON.parse(localStorage.getItem('alrefqa-copy-workspace-v2-9001'))")
 assert len(workspace['queue'])==2
 assert workspace['state']['shipments'][0]['eta']
 page.get_by_role('button',name='Invoices',exact=True).click()
 page.get_by_role('button',name='New invoice',exact=True).click()
 dialog=page.get_by_role('dialog')
 dialog.get_by_label('Account',exact=False).fill('Browser test customer')
 dialog.get_by_label('Amount',exact=False).fill('25.12')
 dialog.get_by_label('Status',exact=False).select_option('مدفوعة')
 dialog.get_by_role('button',name='Save draft',exact=True).click()
 page.get_by_role('dialog').wait_for(state='hidden')
 page.get_by_role('button',name='Sync changes',exact=False).click()
 page.wait_for_function("JSON.parse(localStorage.getItem('alrefqa-copy-workspace-v2-9001')).queue.length===0")
 assert len(requests[0])==3
 workspace=page.evaluate("JSON.parse(localStorage.getItem('alrefqa-copy-workspace-v2-9001'))")
 assert workspace['state']['invoices'][0]['amount']==25.12
 assert workspace['state']['accounts'][0]['scope']=='shared'
 page.locator('select').first.select_option('zh')
 assert not errors,errors
 print(json.dumps({'unauthenticatedGate':'passed','accountForm':'passed','shipmentForm':'passed','invoiceForm':'passed','receiptAcknowledgment':'passed','changesSent':len(requests[0]),'liveDatabaseWrites':0}))
 browser.close()
