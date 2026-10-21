import { describe, expect, it } from 'vitest';
import { operationsCopy } from './operationsCopy';
describe('Operations language completeness',()=>{
 it('supplies every Arabic key in English, Chinese and Turkish',()=>{
   const base=Object.keys(operationsCopy.ar).sort();
   for(const language of ['en','zh','tr'] as const) {
     expect(Object.keys(operationsCopy[language]).sort()).toEqual(base);
     for(const value of Object.values(operationsCopy[language])) expect(value.trim().length).toBeGreaterThan(0);
   }
 });
});
