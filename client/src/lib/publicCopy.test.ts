import { describe, it, expect } from "vitest";
import { publicCopy, officeConfig, supportedLanguages } from "./publicCopy";
function keys(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, index) => keys(item, `${prefix}.${index}`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) =>
      keys(item, `${prefix}.${key}`)
    );
  return [prefix];
}
describe("Public language and office integrity", () => {
  it("has matching complete dictionaries in four languages", () => {
    const base=keys(publicCopy.ar).sort();
    for (const language of supportedLanguages) {
      expect(keys(publicCopy[language]).sort()).toEqual(base);
      expect(JSON.stringify(publicCopy[language])).not.toContain("undefined");
    }
  });
  it("keeps China and Turkey in the public office configuration", () => {
    expect(officeConfig.map(item => item.id)).toEqual([
      "nouakchott",
      "dubai",
      "china",
      "turkey",
    ]);
    expect(officeConfig.some(item => item.id === "china")).toBe(true);
    expect(officeConfig.some(item => item.id === "turkey")).toBe(true);
  });
  it("exposes the new inquiry copy contract in every language", () => {
    const trackingKeys = [
      "title",
      "instructions",
      "nameLabel",
      "namePlaceholder",
      "phoneLabel",
      "phonePlaceholder",
      "button",
      "required",
      "opened",
      "whatsappText",
    ];
    for (const language of supportedLanguages) {
      const tracking = publicCopy[language].tracking;
      expect(Object.keys(tracking).sort()).toEqual([...trackingKeys].sort());
      expect(tracking.instructions).toHaveLength(2);
      expect(tracking.instructions.every(Boolean)).toBe(true);
      for (const value of Object.values(tracking)) {
        if (Array.isArray(value)) {
          expect(value.every(item => typeof item === "string")).toBe(true);
        } else {
          expect(typeof value).toBe("string");
        }
      }
    }
    expect(publicCopy.ar.tracking.instructions).toEqual([
      "الاسم أو الماركة المكتوبة على البضاعة.",
      "رقم الهاتف المدون على الشحنة قبل إرسالها إلى المكتب.",
    ]);
  });
});
