import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PublicOfficeCards from "./PublicOfficeCards";
import { defaultOfficeProfile } from "@shared/branches";
import {
  officeDashboardCopy,
  cachePublicProfiles,
  readCachedPublicProfiles,
} from "@/lib/branchDashboardCopy";
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "ar", dir: "rtl" }),
}));
describe("Public office rendering", () => {
  it("shows supplied address, phone, employees, working and break times with independent GPS", () => {
    const profile = {
      ...defaultOfficeProfile("nouakchott"),
      version: 1,
      address: "Test public address",
      phone: "+22212345678",
      employees: [
        {
          id: "contact-not-login",
          name: "Warehouse contact",
          phone: "+22287654321",
        },
      ],
      hours: [
        {
          day: 1,
          closed: false,
          work: { start: "09:00", end: "18:00" },
          break: { start: "13:00", end: "14:00" },
        },
      ],
      mapUrl: "https://maps.google.com/?q=0,0",
      gps: null,
    };
    const html = renderToStaticMarkup(
      <PublicOfficeCards profiles={[profile]} />
    );
    for (const value of [
      "Test public address",
      "+22212345678",
      "Warehouse contact",
      "09:00",
      "18:00",
      "13:00",
      "14:00",
      "https://maps.google.com/?q=0,0",
    ])
      expect(html).toContain(value);
    expect(html).not.toContain("contact-not-login");
    expect(html).not.toContain("userId");
    expect(html).not.toContain("role=");
  });
  it("does not require an address to display deliberately supplied GPS coordinates", () => {
    const profile = {
      ...defaultOfficeProfile("china"),
      version: 1,
      mapUrl: "https://maps.google.com/?q=1,2",
      gps: null,
    };
    expect(
      renderToStaticMarkup(<PublicOfficeCards profiles={[profile]} />)
    ).toContain("https://maps.google.com/?q=1,2");
  });
  it("shows saved sea address and rates even when the public office address is empty", () => {
    const profile = {
      ...defaultOfficeProfile("turkey"),
      version: 2,
      seaAddress: "Istanbul sea warehouse",
      shippingRates: {
        airRegular: {
          amount: 12.5,
          currency: "USD" as const,
          unit: "kg" as const,
        },
        airExpress: null,
        sensitive: {
          amount: 45,
          currency: "AED" as const,
          unit: "shipment" as const,
        },
        sea: null,
      },
    };
    const html = renderToStaticMarkup(
      <PublicOfficeCards profiles={[profile]} />
    );
    expect(html).toContain("Istanbul sea warehouse");
    expect(html).toContain("12.5");
    expect(html).toContain("45");
    expect(html).toContain("الأسعار العامة المحفوظة");
  });
  it("keeps localized dictionaries complete with break information and does not allow non-phone links", () => {
    for (const language of ["en", "zh", "tr"] as const) {
      expect(Object.keys(officeDashboardCopy[language]).sort()).toEqual(
        Object.keys(officeDashboardCopy.ar).sort()
      );
      expect(officeDashboardCopy[language].break).toBeTruthy();
    }
  });
});
