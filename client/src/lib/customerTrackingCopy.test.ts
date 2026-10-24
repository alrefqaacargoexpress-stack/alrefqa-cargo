import { describe, expect, it } from "vitest";
import { customerTrackingCopy } from "./customerTrackingCopy";

const languages = ["ar", "en", "zh", "tr"] as const;

describe("customer tracking copy", () => {
  it.each(languages)("has complete safe labels in %s", language => {
    const copy = customerTrackingCopy[language];
    expect(copy.title).toBeTruthy();
    expect(copy.statusLabels.delivered).toBeTruthy();
    expect(copy.grantTitle).toBeTruthy();
    expect(copy.manualCheck).toBeTruthy();
    expect(copy.timeline).toBeTruthy();
  });
});
