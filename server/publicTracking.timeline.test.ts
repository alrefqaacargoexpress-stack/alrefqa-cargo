import { describe, expect, it } from "vitest";
import { addPackingGoods, createPackedShipment } from "@shared/packing";
import {
  auditEvents,
  entityLifecycle,
  financeGoods,
  recordKeys,
  records,
  shipmentChargeComponents,
} from "../drizzle/schema";
import { lookupPublicTracking } from "./publicTracking";

function fixture() {
  let shipment = createPackedShipment({
    tracking: "TIMELINE-1",
    source: "dubai",
    pricePerKg: 0,
  });
  shipment = addPackingGoods(shipment, {
    name: "Visible good",
    phone: "+22212345678",
    pieces: 1,
    unitWeight: 1,
  });
  return { ...shipment, id: "shipment-timeline-1", scope: "shared" as const };
}

function fakeDb(shipment: ReturnType<typeof fixture>, audits: unknown[]) {
  return {
    select: () => {
      let table: unknown;
      let ordered = false;
      const builder: any = {
        from(value: unknown) {
          table = value;
          return builder;
        },
        where() {
          return builder;
        },
        orderBy() {
          ordered = true;
          return builder;
        },
        limit() {
          if (table === recordKeys)
            return Promise.resolve([{ recordId: shipment.id }]);
          if (table === records)
            return Promise.resolve([
              { recordId: shipment.id, data: shipment, updatedAt: new Date() },
            ]);
          if (table === entityLifecycle) return Promise.resolve([]);
          if (table === financeGoods || table === shipmentChargeComponents)
            return Promise.resolve([]);
          if (table === auditEvents) {
            const rows = [...audits];
            if (ordered)
              rows.sort(
                (a: any, b: any) =>
                  new Date(b.createdAt).valueOf() -
                    new Date(a.createdAt).valueOf() ||
                  String(b.id).localeCompare(String(a.id))
              );
            return Promise.resolve(rows.slice(0, 100));
          }
          return Promise.resolve([]);
        },
      };
      return builder;
    },
  };
}

describe("public tracking timeline integration", () => {
  it("attaches only the latest 100 allowed milestones in time order", async () => {
    const shipment = fixture();
    const audits = Array.from({ length: 105 }, (_, index) => ({
      id: index + 1,
      action: "tracking_stage",
      createdAt: new Date(Date.UTC(2026, 9, 24, 10, index)),
      afterData: {
        journey: {
          stage: "arrived_office",
          branch: "nouakchott",
          updatedAt: new Date(Date.UTC(2026, 9, 24, 10, index)).toISOString(),
          notes: [{ actorName: "private actor", text: "private note" }],
        },
      },
    }));
    const result = await lookupPublicTracking(fakeDb(shipment, audits), {
      tracking: shipment.tracking,
      phone: "+22212345678",
    });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.shipment.timeline).toHaveLength(100);
    expect(result.shipment.timeline?.[0].at).toBe(
      new Date(Date.UTC(2026, 9, 24, 10, 5)).toISOString()
    );
    expect(result.shipment.timeline?.at(-1)?.at).toBe(
      new Date(Date.UTC(2026, 9, 24, 11, 44)).toISOString()
    );
    expect(JSON.stringify(result)).not.toContain("private actor");
    expect(JSON.stringify(result)).not.toContain("private note");
  });
});
