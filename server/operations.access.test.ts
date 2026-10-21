import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../drizzle/schema';
import { memberRoles, records } from '../drizzle/schema';
import type { TrpcContext } from './_core/context';
let role: 'staff' | 'accountant' | null = null;
const rows = [
 {entity:'account',recordId:'A1',version:1,data:{id:'A1',name:'Client',phone:'+222123456',city:'City',shipments:0,balance:777,updatedAt:'now'}},
 {entity:'invoice',recordId:'I1',version:1,data:{id:'I1',account:'Client',amount:888,status:'مدفوعة',issuedAt:'2026-10-21'}},
];
const transaction = vi.fn();
vi.mock('./db',()=>({getDb:async()=>({
 select:()=>({from:(table:unknown)=>{
   const selected = table === memberRoles ? (role ? [{role}] : []) : table === records ? rows : [];
   const builder = {where:()=>builder,limit:()=>Promise.resolve(selected),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(selected).then(resolve)};
   return builder;
 }}),transaction,
})}));
import { appRouter } from './routers';
const user = {id:99,openId:'non-owner-test',name:'Test',email:'test@example.test',role:'user',loginMethod:'test',createdAt:new Date(),updatedAt:new Date(),lastSignedIn:new Date()} as User;
function caller(authenticated = true) { return appRouter.createCaller({user:authenticated?user:null,req:{headers:{}},res:{}} as unknown as TrpcContext); }
describe('Server-side role isolation',()=>{
 beforeEach(()=>{role=null;transaction.mockClear();});
 it('rejects snapshots from unauthenticated sessions',async()=>{await expect(caller(false).operations.snapshot()).rejects.toMatchObject({code:'UNAUTHORIZED'});});
 it('rejects snapshots from registered but unapproved users',async()=>{await expect(caller().operations.snapshot()).rejects.toMatchObject({code:'FORBIDDEN'});});
 it('does not expose invoices or balances to staff',async()=>{role='staff';const snapshot=await caller().operations.snapshot();expect(snapshot.invoices).toEqual([]);expect(snapshot.accounts[0].balance).toBe(0);});
 it('permits accountants to read invoices and amounts',async()=>{role='accountant';const snapshot=await caller().operations.snapshot();expect(snapshot.invoices[0].amount).toBe(888);expect(snapshot.accounts[0].balance).toBe(777);});
 it('rejects sync from unapproved users before starting any write',async()=>{await expect(caller().operations.sync({changes:[]})).rejects.toMatchObject({code:'FORBIDDEN'});expect(transaction).not.toHaveBeenCalled();});
 it('returns an explicit decision when an invoice receipt is replayed after losing financial access',async()=>{
  role='staff';
  const change={id:'previous-change',label:'Invoice',createdAt:'now',entity:'invoice' as const,recordId:'I1',expectedVersion:null,data:{id:'I1',account:'Client',amount:888,status:'مدفوعة' as const,issuedAt:'2026-10-21'}};
  const receipt={result:{applied:[{changeId:change.id,entity:'invoice',record:{...change.data,version:1,scope:'shared'}}],conflicts:[]}};
  transaction.mockImplementationOnce(async(callback:(tx:unknown)=>Promise<void>)=>{
   const builder={where:()=>builder,limit:()=>builder,for:async()=>[receipt]};
   await callback({select:()=>({from:()=>builder})});
  });
  const result=await caller().operations.sync({changes:[change]});
  expect(result.applied).toEqual([]);expect(result.conflicts).toEqual([{changeId:change.id,reason:'previously_applied_access_changed',current:null}]);
 });
});
