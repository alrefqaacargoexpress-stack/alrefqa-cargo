import { describe, expect, it } from "vitest";
import {
  publicShippingCopy,
  publicShippingCopyFor,
} from "./publicShippingCopy";
import { shippingRateKeys } from "@shared/publicShipping";

describe("public shipping copy", () => {
  it("keeps all four languages and all four service labels aligned", () => {
    const keys = Object.keys(publicShippingCopy.ar.serviceLabels).sort();
    for (const language of ["ar", "en", "zh", "tr"] as const) {
      expect(
        Object.keys(publicShippingCopy[language].serviceLabels).sort()
      ).toEqual(keys);
      expect(publicShippingCopy[language].publicWarning).toBeTruthy();
      expect(publicShippingCopy[language].invoiceNotice).toBeTruthy();
      expect(
        Object.keys(publicShippingCopy[language].serviceLabels).sort()
      ).toEqual([...shippingRateKeys].sort());
    }
  });

  it("falls back to Arabic for an unknown language", () => {
    expect(publicShippingCopyFor("unknown")).toBe(publicShippingCopy.ar);
  });
});
