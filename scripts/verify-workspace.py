import json
from urllib.parse import urlsplit,unquote
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:3000'
user={'id':9002,'name':'Offline test','email':'test@example.test','role':'user'}
data={'accounts':[{'id':'A1','name':'Test client','phone':'+222123456','city':'City','shipments':0,'balance':777.55,'updatedAt':'now','scope':'shared','version':1}],'shipments':[],'invoices':[{'id':'I1','account':'Test client','amount':888.66,'status':'مدفوعة','issuedAt':'2026-10-21','scope':'shared','version':1}],'lastSyncedAt':None}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for role in ('staff','viewer','admin'):
  context=browser.new_context(viewport={'width':390,'height':844})
  context.add_init_script("localStorage.setItem('alrefqaa-language','en')")
  def handler(route):
   names=unquote(urlsplit(route.request.url).path.split('/api/trpc/')[-1]).split(',')
   result=[]
   for name in names:
    value=user if name=='auth.me' else {'userId':9002,'role':role} if name=='operations.access' else data if name=='operations.snapshot' else []
    result.append({'result':{'data':{'json':value}}})
   route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
  context.route('**/api/trpc/**',handler)
  page=context.new_page();page.goto(BASE+'/operations',wait_until='networkidle')
  page.get_by_role('button',name='New account',exact=True).wait_for()
  page.wait_for_function("localStorage.getItem('alrefqaa-operations-last-profile-v1')!==null")
  if role!='admin':
   assert '777.55' not in page.locator('body').inner_text()
   assert '888.66' not in page.locator('body').inner_text()
   assert page.get_by_role('button',name='Invoices',exact=True).count()==0
  if role=='viewer': assert page.get_by_role('button',name='New account',exact=True).is_disabled()
  if role=='admin':
   page.wait_for_function('navigator.serviceWorker.controller !== null')
   context.unroute('**/api/trpc/**')
   context.set_offline(True)
   page.reload(wait_until='domcontentloaded')
   page.get_by_role('button',name="This user's drafts",exact=True).click()
   page.get_by_role('button',name='New account',exact=True).click()
   modal=page.get_by_role('dialog')
   modal.get_by_label('Name',exact=False).fill('Offline created customer')
   modal.get_by_label('Phone',exact=False).fill('+222123456')
   modal.get_by_role('button',name='Save draft',exact=True).click()
   modal.wait_for(state='hidden')
   saved=page.evaluate("JSON.parse(localStorage.getItem('alrefqa-copy-workspace-v2-9002'))")
   assert any(change['data']['name']=='Offline created customer' for change in saved['queue'])
   assert page.get_by_role('button',name='Sync changes',exact=False).is_disabled()
   context.set_offline(False)
  context.close()
 browser.close()
print(json.dumps({'staffFinanceHidden':'passed','viewerReadOnly':'passed','offlineReloadWorkspace':'passed','offlineSaveDraft':'passed','liveDatabaseWrites':0}))
