import { z } from 'zod';
const text = (max:number) => z.string().trim().min(1).max(max);
const integer = z.number().finite().nonnegative().refine(Number.isSafeInteger);
const money = z.number().finite().nonnegative().max(999999999);
const meta = { scope:z.enum(['shared','local','pending']).optional(),version:integer.optional() };
export const localAccountSchema = z.object({id:text(128),name:text(240),phone:z.string().trim().min(1).max(64),city:text(160),shipments:integer,balance:money,updatedAt:text(80),...meta}).strict();
export const localShipmentSchema = z.object({id:text(128),tracking:text(128),account:text(240),route:text(240),service:z.enum(['جوي','بحري','سريع']),status:z.enum(['في الطريق','وصلت للمكتب','جاهزة للتسليم','بانتظار الدفع']),eta:text(80),amount:money,...meta}).strict();
export const localInvoiceSchema = z.object({id:text(128),account:text(240),amount:money,status:z.enum(['مدفوعة','بانتظار الدفع']),issuedAt:text(80),...meta}).strict();
const change = z.object({id:text(128),label:z.string().max(240),createdAt:text(80),entity:z.enum(['account','shipment','invoice']),recordId:text(128),expectedVersion:z.union([z.null(),integer]),data:z.union([localAccountSchema,localShipmentSchema,localInvoiceSchema])}).strict().superRefine((value,ctx)=>{
 const schema=value.entity==='account'?localAccountSchema:value.entity==='shipment'?localShipmentSchema:localInvoiceSchema;
 if(!schema.safeParse(value.data).success||value.recordId!==value.data.id)ctx.addIssue({code:'custom',message:'Invalid queued record'});
});
export const workspaceSchema = z.object({
 state:z.object({accounts:z.array(localAccountSchema).max(50000),shipments:z.array(localShipmentSchema).max(50000),invoices:z.array(localInvoiceSchema).max(50000),lastSyncedAt:z.string().max(80).nullable()}).strict(),
 queue:z.array(change).max(50000),revision:integer.optional(),
}).strict();
