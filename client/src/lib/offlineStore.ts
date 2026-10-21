import { EMPTY_STATE, type Entity, type EntityRecord, type LocalState, type PendingChange, type SyncResult } from '@shared/operations';
import { workspaceSchema } from '@shared/localValidation';
export type { Account, Shipment, Invoice, DataScope, LocalState, PendingChange } from '@shared/operations';
export type Workspace = { state:LocalState; queue:PendingChange[]; revision?:number };
const PREFIX='alrefqa-copy-workspace-v2-';
const collections={account:'accounts',shipment:'shipments',invoice:'invoices'} as const;
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
export const emptyWorkspace=():Workspace=>({state:clone(EMPTY_STATE),queue:[],revision:0});
function storage():Storage {
 try { if(typeof window==='undefined')throw new Error('unavailable');return window.localStorage; }
 catch { throw new Error('تعذر الوصول إلى التخزين المحلي. لم يتم حذف بياناتك. اسمح بالتخزين أو استخدم متصفحًا آخر.'); }
}
function parseStored(raw:string):Workspace {
 try { return workspaceSchema.parse(JSON.parse(raw)) as Workspace; }
 catch { throw new Error('تعذر قراءة البيانات المحلية. حُفظت النسخة الأصلية دون تغيير؛ صدّرها للمراجعة قبل المتابعة.'); }
}
export function loadWorkspace(userId:number|string):Workspace {
 const raw=storage().getItem(`${PREFIX}${userId}`);
 return raw?parseStored(raw):emptyWorkspace();
}
let lockDatabase:Promise<IDBDatabase>|null=null;
function openLockDatabase():Promise<IDBDatabase> {
 if(!lockDatabase)lockDatabase=new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('تعذر تأمين الحفظ المحلي في هذا المتصفح.'));return;}
  const request=indexedDB.open('alrefqaa-workspace-locks',1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('locks'))request.result.createObjectStore('locks');};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
 return lockDatabase;
}
async function underLock(key:string,write:()=>void):Promise<void> {
 if(typeof navigator!=='undefined'&&navigator.locks){await navigator.locks.request(key,()=>write());return;}
 // IndexedDB read/write transactions serialize across tabs when Web Locks is unavailable.
 const db=await openLockDatabase();
 await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('locks','readwrite');
  const request=tx.objectStore('locks').get(key);
  request.onsuccess=()=>{try {write();tx.objectStore('locks').put(Date.now(),key);}catch(error){tx.abort();reject(error);}};
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('تعذر تأمين الحفظ المحلي.'));
 });
}
export async function saveWorkspace(userId:number|string,value:Workspace):Promise<void> {
 const key=`${PREFIX}${userId}`;
 workspaceSchema.parse(value);
 await underLock(key,()=>{
  const store=storage();const raw=store.getItem(key);const current=raw?parseStored(raw):emptyWorkspace();
  if((current.revision??0)!==(value.revision??0))throw new Error('تغيرت هذه المساحة في تبويب آخر. لم نكتب فوقها. صدّر المسودة الحالية ثم أعد تحميل البيانات قبل الحفظ.');
  const revision=(current.revision??0)+1;
  try {store.setItem(key,JSON.stringify({...value,revision}));value.revision=revision;}
  catch {throw new Error('لم تُحفظ التغييرات: التخزين المحلي محظور أو ممتلئ. لا تغلق النافذة قبل نسخ بياناتك.');}
 });
}
function putRecord(state:LocalState,entity:Entity,record:EntityRecord):LocalState {
 const key=collections[entity];const list=state[key] as EntityRecord[];
 return {...state,[key]:list.some(item=>item.id===record.id)?list.map(item=>item.id===record.id?record:item):[...list,record]};
}
export function stageChange(workspace:Workspace,entity:Entity,data:EntityRecord,label:string,action?:PendingChange['action']):Workspace {
 const key=collections[entity];const pending=workspace.queue.filter(change=>change.entity===entity&&change.recordId===data.id);const previous=pending.at(-1);
 const saved=(workspace.state[key] as EntityRecord[]).find(item=>item.id===data.id);
 const change:PendingChange={id:crypto.randomUUID(),recordId:data.id,entity,label,createdAt:new Date().toISOString(),expectedVersion:previous?previous.expectedVersion:saved?.version??null,data:{...data,scope:'pending'},...((action??previous?.action)?{action:action??previous?.action}:{})};
 const base=pending.find(item=>!item.action);
 // Preserve a pending upsert before an explicit archive action on a shared row.
 // The server must receive the cargo edit first, then an identical archive payload at its next version.
 const prefix=entity==='shipment'&&change.action&&base&&base.expectedVersion!==null?[base]:[];
 if(prefix.length)change.expectedVersion=base!.expectedVersion!+1;
 return {...workspace,state:putRecord(workspace.state,entity,change.data),queue:[...workspace.queue.filter(item=>!(item.entity===entity&&item.recordId===data.id)),...prefix,change]};
}
export function mergeSnapshot(workspace:Workspace,snapshot:LocalState):Workspace {
 let state=clone(snapshot);
 for(const entity of ['account','shipment','invoice'] as const)for(const record of workspace.state[collections[entity]])if(record.scope==='local')state=putRecord(state,entity,record);
 for(const change of workspace.queue)state=putRecord(state,change.entity,{...change.data,scope:'pending'});
 return {...workspace,state,queue:workspace.queue};
}
export function applySyncResult(workspace:Workspace,result:SyncResult):Workspace {
 const appliedIds=new Set(result.applied.map(change=>change.changeId));const queue=workspace.queue.filter(change=>!appliedIds.has(change.id));let state=workspace.state;
 for(const acknowledged of result.applied)if(!queue.some(change=>change.entity===acknowledged.entity&&change.recordId===acknowledged.record.id))state=putRecord(state,acknowledged.entity,{...acknowledged.record,scope:'shared'});
 return {...workspace,state:{...state,lastSyncedAt:result.applied.length?new Date().toISOString():state.lastSyncedAt},queue};
}
export function downloadLocalArchive(userId?:number|string):void {
 const store=storage();const archive={exportedAt:new Date().toISOString(),legacyState:store.getItem('alrefqa-copy-state-v1'),legacyQueue:store.getItem('alrefqa-copy-queue-v1'),workspace:userId===undefined?null:store.getItem(`${PREFIX}${userId}`)};
 const url=URL.createObjectURL(new Blob([JSON.stringify(archive,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='alrefqaa-local-archive.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function formatMRU(value:number,locale='ar-MR'):string{return new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(value);}
