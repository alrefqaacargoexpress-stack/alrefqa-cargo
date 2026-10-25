import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addPackingGoods, createPackedShipment } from "../../../shared/packing";
import { defaultPermissions } from "../../../shared/permissions";
import { copyFor } from "../lib/packingCopy";
import ShipmentPacking from "./ShipmentPacking";
import PackingHub from "./PackingHub";

const holder = vi.hoisted(() => ({
  workspace: null as any,
  id: "",
  newForm: false,
  profiles: undefined as any,
  finance: { store: { snapshot: { pricingProjections: [] } } } as any,
}));
vi.mock("@/hooks/useOperationsWorkspace", () => ({
  useOperationsWorkspace: () => holder.workspace,
}));
vi.mock("@/hooks/useFinanceWorkspace", () => ({
  useFinanceWorkspace: () => holder.finance,
}));
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en" }),
}));
vi.mock("@/components/packing/PackingLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/packing/ShipmentDeleteActions", () => ({
  default: () => null,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    branches: { public: { useQuery: () => ({ data: holder.profiles }) } },
  },
}));
vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ["/operations/shipments", () => {}],
  useParams: () => ({ id: holder.id }),
  useSearch: () => "",
  useRoute: () => [holder.newForm, {}],
}));

beforeEach(() => {
  holder.newForm = false;
  holder.profiles = undefined;
  holder.finance = { store: { snapshot: { pricingProjections: [] } } };
  const now = "2026-10-24T22:54:00.000Z";
  const shipment = addPackingGoods(
    createPackedShipment(
      {
        tracking: "SM610",
        source: "dubai",
        officeId: "dubai",
        service: "airRegular",
        pricePerKg: 0,
        rateSnapshot: {
          service: "airRegular",
          sourceOffice: "dubai",
          sourceRate: { amount: 37, currency: "AED", unit: "kg" },
          nouakchottRate: { amount: 425, currency: "MRU", unit: "kg" },
          sourceProfileVersion: 4,
          nouakchottProfileVersion: 8,
          capturedAt: now,
        },
      },
      now
    ),
    { name: "Brand", phone: "", unitWeight: 0.1, pieces: 1 }
  );
  holder.id = shipment.id;
  holder.workspace = {
    state: {
      accounts: [],
      shipments: [shipment],
      invoices: [],
      lastSyncedAt: null,
    },
    queue: [
      {
        id: "pending",
        entity: "shipment",
        recordId: shipment.id,
        createdAt: now,
        expectedVersion: null,
        data: shipment,
        label: "Create",
      },
    ],
    role: "admin",
    offices: null,
    permissions: null,
    showFinance: true,
    canEditShipments: false,
    canUpdateTracking: false,
    canSendShipments: false,
    warehouseOnly: false,
  };
});

describe("real packing pages use display quotes without saving them", () => {
  it("shows separate source/destination totals and the pending quote notice on both pages", () => {
    const c = copyFor("en");
    for (const Page of [ShipmentPacking, PackingHub]) {
      const html = renderToStaticMarkup(<Page />);
      expect(html).toContain("3.70 AED");
      expect(html).toContain("42.50 MRU");
      expect(html).toContain(c.previewPending);
      expect(html).toContain(c.previewNotice);
      expect(html).not.toContain(c.sourceRateNotApproved);
      expect(html.toLowerCase()).not.toContain("per gram");
    }
    const html = renderToStaticMarkup(<ShipmentPacking />);
    expect(html).toContain("37 AED / kg");
    expect(html).toContain("425 MRU / kg");
    expect(holder.workspace.state.shipments[0].packing.pricePerKg).toBe(0);
    expect(holder.workspace.queue[0].data.packing.pricePerKg).toBe(0);
  });
  it("does not show amounts to an office manager with financial access but shipment_prices none", () => {
    holder.workspace.role = "office_manager";
    holder.workspace.offices = ["dubai"];
    holder.workspace.permissions = {
      ...defaultPermissions({ role: "office_manager", offices: ["dubai"] }),
      shipment_prices: "none",
    };
    for (const Page of [ShipmentPacking, PackingHub]) {
      const html = renderToStaticMarkup(<Page />);
      expect(html).toContain(copyFor("en").amountHidden);
      expect(html).not.toContain("3.70 AED");
      expect(html).not.toContain("42.50 MRU");
      expect(html).not.toContain("37 AED / kg");
      expect(html).not.toContain("425 MRU / kg");
      expect(html).not.toContain(copyFor("en").sourceRateNotApproved);
      expect(html).not.toContain(copyFor("en").previewPending);
    }
  });
  it("does not turn a queued edit of an old unpriced shipment into a new quoted amount", () => {
    const shipment = holder.workspace.state.shipments[0];
    shipment.version = 5;
    holder.workspace.queue[0].expectedVersion = 5;
    for (const Page of [ShipmentPacking, PackingHub]) {
      const html = renderToStaticMarkup(<Page />);
      expect(html).toContain(copyFor("en").sourceRateNotApproved);
      expect(html).not.toContain("3.70 AED");
      expect(html).not.toContain(copyFor("en").previewPending);
    }
  });
  it("does not display a rejected source unit as a valid creation tariff when MRU is valid", () => {
    const shipment = holder.workspace.state.shipments[0];
    shipment.packing.rateSnapshot.sourceRate = {
      amount: 123,
      currency: "AED",
      unit: "m3",
    };
    const html = renderToStaticMarkup(<ShipmentPacking />);
    expect(html).toContain("42.50 MRU");
    expect(html).not.toContain("123 AED");
    expect(html).toContain(copyFor("en").previewUnavailable);
  });
  it("does not expose creation-form prices when shipment_prices is denied", () => {
    holder.newForm = true;
    holder.profiles = [
      {
        officeId: "dubai",
        version: 4,
        shippingRates: {
          airRegular: { amount: 37, currency: "AED", unit: "kg" },
        },
      },
      {
        officeId: "nouakchott",
        version: 8,
        sourceShippingRates: {
          dubai: { airRegular: { amount: 425, currency: "MRU", unit: "kg" } },
        },
      },
    ];
    holder.workspace.role = "office_manager";
    holder.workspace.offices = ["dubai"];
    holder.workspace.permissions = {
      ...defaultPermissions({ role: "office_manager", offices: ["dubai"] }),
      shipment_prices: "none",
    };
    const html = renderToStaticMarkup(<PackingHub />);
    expect(html).toContain(copyFor("en").amountHidden);
    expect(html).not.toContain("37 AED");
    expect(html).not.toContain("425 MRU");
  });

  it("uses scoped source and destination projections on both pages without mutating the shipment", () => {
    const shipment = holder.workspace.state.shipments[0];
    shipment.scope = "shared";
    shipment.version = 2;
    holder.workspace.queue = [];
    holder.finance = {
      store: {
        snapshot: {
          pricingProjections: [
            {
              shipmentId: shipment.id,
              side: "source",
              officeId: "dubai",
              currency: "AED",
              pricePerKg: 40,
              overridePricePerKg: 40,
              revision: 2,
              expectedPricingRevision: 2,
              recordVersion: 7,
              overrideId: "override-source",
              createdAt: "2026-10-24T22:55:00.000Z",
            },
            {
              shipmentId: shipment.id,
              side: "destination",
              officeId: "nouakchott",
              currency: "MRU",
              pricePerKg: 430,
              overridePricePerKg: 430,
              revision: 3,
              expectedPricingRevision: 3,
              recordVersion: 7,
              overrideId: "override-destination",
              createdAt: "2026-10-24T22:55:00.000Z",
            },
          ],
        },
      },
    };
    const before = JSON.stringify(shipment.packing);
    for (const Page of [ShipmentPacking, PackingHub]) {
      const html = renderToStaticMarkup(<Page />);
      expect(html).toContain("4.00 AED");
      expect(html).toContain("43.00 MRU");
      expect(html).not.toContain("3.70 AED");
      expect(html).not.toContain("42.50 MRU");
    }
    expect(JSON.stringify(shipment.packing)).toBe(before);
    expect(shipment.packing.pricePerKg).toBe(0);
  });
});
