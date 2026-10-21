import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_STATE, type Account } from '@shared/operations';
import { applySyncResult, emptyWorkspace, loadWorkspace, mergeSnapshot, saveWorkspace, stageChange } from './offlineStore';
const sample:Account={id:'A1',name:'Customer',phone:'+222123456',city:'City',shipments:0,balance:0,updatedAt:'now'};
describe('Offline data safety',()=>{
 const store=new Map<string,string>();
 beforeEach(()=>{
  store.clear();
  vi.stubGlobal('window',{localStorage:{getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>store.set(key,value)}});
  vi.stubGlobal('navigator',{locks:{request:async(_key:string,callback:()=>void)=>callback()}});
  vi.stubGlobal('crypto',{randomUUID:()=>`change-${Math.random()}`});
 });
 it('isolates employee workspaces and preserves legacy storage',async()=>{
  store.set('alrefqa-copy-state-v1','legacy-keep');const value=stageChange(emptyWorkspace(),'account',sample,'new');await saveWorkspace(1,value);
  expect(loadWorkspace(2).state.accounts).toEqual([]);expect(loadWorkspace(1).queue[0].data.id).toBe('A1');expect(store.get('alrefqa-copy-state-v1')).toBe('legacy-keep');
 });
 it('keeps pending edits on refresh without implicitly syncing',()=>{
  const value=stageChange(emptyWorkspace(),'account',sample,'new');const merged=mergeSnapshot(value,{...EMPTY_STATE,accounts:[{...sample,name:'Server',version:2,scope:'shared'}]});
  expect(merged.state.accounts[0].name).toBe('Customer');expect(merged.queue).toHaveLength(1);
 });
 it('keeps conflicted rows and removes only positively acknowledged changes',()=>{
  const value=stageChange(emptyWorkspace(),'account',sample,'new');const conflict=applySyncResult(value,{applied:[],conflicts:[{changeId:value.queue[0].id,reason:'version',current:null}]});
  expect(conflict.queue).toHaveLength(1);expect(conflict.state.lastSyncedAt).toBeNull();
  const applied=applySyncResult(value,{applied:[{changeId:value.queue[0].id,entity:'account',record:{...sample,version:1}}],conflicts:[]});expect(applied.queue).toHaveLength(0);expect(applied.state.accounts[0].scope).toBe('shared');
 });
 it('does not overwrite a newer local draft from an older acknowledgment',()=>{
  const old=stageChange(emptyWorkspace(),'account',sample,'new');const next=stageChange(old,'account',{...sample,name:'New edit'},'edit');
  const result=applySyncResult(next,{applied:[{changeId:old.queue[0].id,entity:'account',record:{...sample,version:1}}],conflicts:[]});
  expect(result.state.accounts[0].name).toBe('New edit');expect(result.queue).toHaveLength(1);
 });
 it('retains corrupted data and surfaces an error rather than resetting silently',()=>{
  store.set('alrefqa-copy-workspace-v2-1','broken');expect(()=>loadWorkspace(1)).toThrow('لمراجعة');expect(store.get('alrefqa-copy-workspace-v2-1')).toBe('broken');
 });
 it('rejects structurally incomplete state records and mismatched queued ids',()=>{
  store.set('alrefqa-copy-workspace-v2-1',JSON.stringify({state:{...EMPTY_STATE,accounts:[{id:'A1'}]},queue:[]}));expect(()=>loadWorkspace(1)).toThrow('لمراجعة');
  const state=stageChange(emptyWorkspace(),'account',sample,'new');state.queue[0].recordId='other';store.set('alrefqa-copy-workspace-v2-1',JSON.stringify(state));expect(()=>loadWorkspace(1)).toThrow('لمراجعة');
 });
 it('reports quota errors without claiming successful save',async()=>{
  vi.stubGlobal('window',{localStorage:{getItem:()=>null,setItem:()=>{throw new Error('quota');}}});await expect(saveWorkspace(1,emptyWorkspace())).rejects.toThrow('لم تُحفظ');
 });
 it('refuses stale writes from another tab instead of losing its pending changes',async()=>{
  const first=emptyWorkspace(),second=emptyWorkspace();await saveWorkspace(1,stageChange(first,'account',sample,'first tab'));
  await expect(saveWorkspace(1,stageChange(second,'account',{...sample,id:'A2'},'second tab'))).rejects.toThrow('تبويب آخر');
  expect(loadWorkspace(1).queue[0].recordId).toBe('A1');expect(loadWorkspace(1).queue).toHaveLength(1);
 });
 it('updates revisions only after durable save under a lock',async()=>{
  const state=stageChange(emptyWorkspace(),'account',sample,'new');await saveWorkspace(1,state);expect(state.revision).toBe(1);const next=stageChange(state,'account',{...sample,name:'Edit'},'edit');await saveWorkspace(1,next);expect(next.revision).toBe(2);
 });
});
