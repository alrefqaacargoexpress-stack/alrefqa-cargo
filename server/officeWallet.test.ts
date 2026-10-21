import { describe, expect, it } from "vitest";
import { defaultOfficeSettings } from "@shared/office";
import { publicOfficeSettings } from "./office";

describe("public office wallet projection", () => {
  it("publishes only explicit enabled methods and never versions, users, or credentials", () => {
    const settings = defaultOfficeSettings();
    settings.version = 9;
    settings.methods[0] = {
      ...settings.methods[0],
      accountNumber: "+222 12-34-56",
      accountName: "A Beneficiary",
      instructions: "Send the receipt to the office.",
      showToCustomers: true,
    };
    settings.methods[1] = {
      ...settings.methods[1],
      accountNumber: "+222 99-88-77",
      accountName: "Hidden Beneficiary",
      showToCustomers: false,
    };
    settings.methods[2] = {
      ...settings.methods[2],
      accountNumber: "+222 11-22-33",
      enabled: false,
      showToCustomers: true,
    };
    settings.methods[4] = {
      ...settings.methods[4],
      instructions: "Cash at the desk.",
      showToCustomers: true,
    };
    const projection = publicOfficeSettings(settings);
    expect(projection).toEqual({
      office: "nouakchott",
      methods: [
        {
          id: "bankily",
          label: "Bankily",
          accountNumber: "+222 12-34-56",
          accountName: "A Beneficiary",
          instructions: "Send the receipt to the office.",
        },
        { id: "cash", label: "نقدي", instructions: "Cash at the desk." },
      ],
    });
    expect(JSON.stringify(projection)).not.toMatch(
      /version|user|credential|enabled|showToCustomers|password|otp|pin/i
    );
  });
});
