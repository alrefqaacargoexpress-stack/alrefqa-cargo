import { describe, it, expect } from 'vitest';
import { publicCopy, officeConfig, supportedLanguages } from './publicCopy';
function keys(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item,index)=>keys(item,`${prefix}.${index}`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key,item])=>keys(item,`${prefix}.${key}`));
  return [prefix];
}
describe('Public language and office integrity',()=>{
  it('has matching complete dictionaries in four languages',()=>{
    const base=keys(publicCopy.ar).sort();
    for(const language of supportedLanguages) {
      expect(keys(publicCopy[language]).sort()).toEqual(base);
      expect(JSON.stringify(publicCopy[language])).not.toContain('undefined');
    }
  });
  it('includes China and Turkey without inventing an address',()=>{
    expect(officeConfig.map(item=>item.id)).toEqual(['nouakchott','dubai','china','turkey']);
    for(const office of officeConfig) expect(office.address).toBeNull();
  });
  it('does not promise a real tracking result or home delivery service',()=>{
    expect(publicCopy.ar.tracking.description).toContain('لا توجد نتيجة');
    expect(publicCopy.ar.services.items[3].text).toContain('قيد التطوير');
    expect(publicCopy.en.tracking.description.toLowerCase()).toContain('no');
  });
});
