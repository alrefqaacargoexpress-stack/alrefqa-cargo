import { describe, expect, it } from "vitest";
import { packingCopy } from "./packingCopy";
describe("Packing language coverage", () => {
  it("provides every translated key in Arabic, English, Chinese and Turkish", () => {
    const keys = Object.keys(packingCopy.ar).sort();
    for (const lang of ["ar", "en", "zh", "tr"] as const) {
      expect(Object.keys(packingCopy[lang]).sort()).toEqual(keys);
      for (const [key, value] of Object.entries(packingCopy[lang]))
        expect(value.trim(), `${lang}.${key}`).not.toBe("");
    }
  });
});
