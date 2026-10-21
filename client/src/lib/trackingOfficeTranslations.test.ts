import { describe, expect, it } from "vitest";
import { trackingCopy } from "./trackingCopy";
import { officeCopy } from "./officeCopy";
import { stageIds, branchIds } from "@shared/tracking";
const paths = (value: unknown, prefix = ""): string[] => {
  if (typeof value === "string") {
    expect(value.trim(), prefix).not.toBe("");
    return [prefix];
  }
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, item]) => paths(item, prefix ? `${prefix}.${key}` : key))
    .sort();
};
describe("Tracking and Nouakchott office language coverage", () => {
  it("has nonempty matching tracking copy keys in Arabic English Chinese Turkish", () => {
    const keys = paths(trackingCopy.ar);
    for (const lang of ["en", "zh", "tr"] as const)
      expect(paths(trackingCopy[lang])).toEqual(keys);
  });
  it("translates every tracking stage and branch in every language", () => {
    for (const lang of ["ar", "en", "zh", "tr"] as const) {
      expect(Object.keys(trackingCopy[lang].stages).sort()).toEqual(
        [...stageIds].sort()
      );
      expect(Object.keys(trackingCopy[lang].branches).sort()).toEqual(
        [...branchIds].sort()
      );
    }
  });
  it("has nonempty matching office settings and manual invoice method labels", () => {
    const keys = paths(officeCopy.ar);
    for (const lang of ["en", "zh", "tr"] as const)
      expect(paths(officeCopy[lang])).toEqual(keys);
  });
});
