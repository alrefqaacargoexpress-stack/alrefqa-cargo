import { describe, expect, it } from "vitest";
import { publicTrackingCopy } from "./publicTrackingCopy";
import { stageIds } from "@shared/tracking";

const languages = ["ar", "en", "zh", "tr"] as const;

describe("public tracking copy", () => {
  it.each(languages)("has complete public portal copy in %s", language => {
    const copy = publicTrackingCopy[language];
    expect(copy.title).toBeTruthy();
    expect(copy.submit).toBeTruthy();
    expect(copy.trackingLabel).toBeTruthy();
    expect(copy.phoneLabel).toBeTruthy();
    expect(copy.goodsTitle).toBeTruthy();
    expect(copy.subtitle).toMatch(/(shared|共享|المشتركة|ortak)/i);
    for (const stage of stageIds) expect(copy.stages[stage]).toBeTruthy();
    expect(JSON.stringify(copy)).not.toMatch(
      /invoice|facture|فاتورة|fatura|payment|الدفع/i
    );
  });
});
