import json, subprocess
from urllib.parse import unquote, urlsplit, parse_qs
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:3000'
copy=json.loads(subprocess.run(['pnpm','exec','tsx','-e',"import {branchSettingsCopyFor} from './client/src/lib/branchSettingsCopy'; console.log(JSON.stringify(branchSettingsCopyFor('en')))"],capture_output=True,text=True,check=True).stdout)
profiles=[{'officeId':office,'address':office+' public address','phone':'+22212345678','timezone':tz,'gps':{'lat':1,'lng':2},'hours':[{'day':1,'closed':False,'work':{'start':'09:00','end':'18:00'},'break':{'start':'13:00','end':'14:00'}}],'employees':[{'id':office+'-contact','name':office+' contact','phone':'+22287654321'}],'version':1} for office,tz in [('nouakchott','Africa/Nouakchott'),('dubai','Asia/Dubai'),('china','Asia/Shanghai'),('turkey','Europe/Istanbul')]]
updates=[];snapshot={'accounts':[],'shipments':[],'invoices':[],'lastSyncedAt':None}
def handle(route):
 req=route.request;names=unquote(urlsplit(req.url).path.split('/api/trpc/')[-1]).split(',');body=json.loads(req.post_data or '{}');output=[]
 for i,name in enumerate(names):
  args=body.get(str(i),body);args=args.get('json',args)
  if name=='auth.me':value={'id':9018,'name':'Office test','role':'user','email':'private@example.test'}
  elif name=='operations.access':value={'role':'admin','userId':9018,'offices':None}
  elif name=='operations.snapshot':value=snapshot
  elif name in ['branches.public','branches.profiles']:value=profiles
  elif name in ['branches.members','operations.members']:value=[]
  elif name=='office.get':value={'office':'nouakchott','version':0,'methods':[{'id':'cash','label':'Cash','enabled':True}]}
  elif name=='branches.dashboard':
   query=json.loads(parse_qs(urlsplit(req.url).query).get('input',['{}'])[0])
   if query:args=query.get(str(i),query).get('json',{})
   office=args.get('officeId','nouakchott');value={'profile':next(p for p in profiles if p['officeId']==office),'shipments':[],'accounts':[],'invoices':[],'financial':True}
  elif name=='branches.update':
   updates.append(args.copy());old=next(p for p in profiles if p['officeId']==args['officeId']);assert args['expectedVersion']==old['version'];value={k:v for k,v in args.items() if k!='expectedVersion'};value['version']=old['version']+1;profiles[profiles.index(old)]=value
  else:value=[]
  output.append({'result':{'data':{'json':value}}})
 route.fulfill(status=200,content_type='application/json',body=json.dumps(output if 'batch=1' in req.url else output[0]))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':390,'height':844});ctx.add_init_script("localStorage.setItem('alrefqaa-language','en')")
 ctx.route('**/api/trpc/**',handle);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.goto(BASE+'/',wait_until='networkidle');text=page.locator('body').inner_text();assert 'china public address' in text and 'china contact' in text and '13:00' in text;assert 'private@example.test' not in text
 page.goto(BASE+'/operations/settings?office=china',wait_until='networkidle');field=page.get_by_label(copy['address'],exact=True);assert field.input_value()=='china public address';field.fill('China revised address');page.get_by_role('button',name=copy['saveProfile'],exact=True).click();page.get_by_text(copy['saved'],exact=True).wait_for();assert updates[-1]['officeId']=='china' and updates[-1]['expectedVersion']==1
 page.goto(BASE+'/operations/offices?office=turkey',wait_until='networkidle');assert 'turkey public address' in page.locator('main').inner_text();page.get_by_label('Office',exact=True).select_option('dubai');page.wait_for_url('**office=dubai');page.get_by_text('dubai public address',exact=False).wait_for();assert 'turkey public address' not in page.locator('main').inner_text()
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1');assert not errors,errors
 print(json.dumps({'publicAddress':True,'publicEmployeePhones':True,'breakHours':True,'settingsOfficeQuery':True,'versionedProfileSave':True,'dashboardOfficeNavigation':True,'mobileLayout':True,'liveDatabaseWrites':0}))
 browser.close()
