import { describe, expect, it } from "vitest";
import {
  branchSettingsCopy,
  branchSettingsLanguages,
  officeIds,
  officeName,
} from "./branchSettingsCopy";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => leafKeys(item, `${prefix}.${index}`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) => leafKeys(item, `${prefix}.${key}`));
  return [prefix];
}

describe("branch settings copy", () => {
  it("has matching complete dictionaries in Arabic, English, Chinese, and Turkish", () => {
    const base = leafKeys(branchSettingsCopy.ar).sort();
    for (const language of branchSettingsLanguages) {
      expect(leafKeys(branchSettingsCopy[language]).sort()).toEqual(base);
      expect(JSON.stringify(branchSettingsCopy[language])).not.toContain("undefined");
    }
  });

  it("keeps the four canonical offices and no invented office title", () => {
    expect(officeIds).toEqual(["nouakchott", "dubai", "china", "turkey"]);
    expect(officeName("ar", "nouakchott")).toBe("نواكشوط");
    expect(officeName("en", "turkey")).toBe("Turkey");
  });

  it("states that public profile contacts do not grant access and avoids fake hours", () => {
    expect(branchSettingsCopy.ar.publicNotice).toContain("سيظهر العنوان والدوام والموقع وأسماء وأرقام الموظفين للعامة بعد الحفظ");
    expect(branchSettingsCopy.en.publicContactsNotice.toLowerCase()).toContain("do not grant");
    expect(branchSettingsCopy.en.workHoursHint.toLowerCase()).toContain("no fake default");
  });
});
