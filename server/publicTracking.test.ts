import { describe, expect, it } from "vitest";
import { addPackingGoods, createPackedShipment } from "@shared/packing";
import type { Shipment } from "@shared/operations";
import {
  derivePublicPaymentStatus,
  lookupPublicTracking,
  PublicTrackingLimiter,
} from "./publicTracking";
import {
  entityLifecycle,
  financeGoods,
  records,
  shipmentChargeAllocations,
  shipmentChargeComponents,
} from "../drizzle/schema";

function shipmentFixture(phone = "+222 12 34 56 78"): Shipment {
  let shipment = createPackedShipment({
    tracking: "RF-123",
    source: "dubai",
    pricePerKg: 0,
  });
  shipment = addPackingGoods(shipment, {
    name: "Visible goods",
    phone,
    pieces: 2,
    unitWeight: 1.25,
  });
  shipment = { ...shipment, scope: "shared" };
  return shipment;
}

function fakeDb(input: {
  keyRows?: unknown[];
  recordRows?: unknown[];
  fallbackRows?: unknown[];
}) {
  let recordsReads = 0;
  let selectCalls = 0;
  const writes = {
    insert: 0,
    update: 0,
    delete: 0,
  };
  const db = {
    writes,
    select: (_selection?: unknown) => {
      selectCalls += 1;
      const builder: any = {
        from(value: unknown) {
          void value;
          return builder;
        },
        where() {
          return builder;
        },
        limit() {
          if (selectCalls === 1) return Promise.resolve(input.keyRows ?? []);
          recordsReads += 1;
          if (!(input.keyRows ?? []).length)
            return Promise.resolve(input.fallbackRows ?? []);
          return Promise.resolve(
            recordsReads === 1
              ? (input.recordRows ?? [])
              : (input.fallbackRows ?? [])
          );
        },
      };
      return builder;
    },
  };
  return db;
}

function paymentDb(input: {
  claims?: unknown[];
  components?: unknown[];
  allocations?: unknown[];
  invoices?: unknown[];
  lifecycle?: unknown[];
}) {
  return {
    select: () => {
      let table: unknown;
      const builder: any = {
        from(value: unknown) {
          table = value;
          return builder;
        },
        where() {
          return builder;
        },
        limit() {
          if (table === financeGoods)
            return Promise.resolve(input.claims ?? []);
          if (table === shipmentChargeComponents)
            return Promise.resolve(input.components ?? []);
          if (table === shipmentChargeAllocations)
            return Promise.resolve(input.allocations ?? []);
          if (table === records) return Promise.resolve(input.invoices ?? []);
          if (table === entityLifecycle)
            return Promise.resolve(input.lifecycle ?? []);
          return Promise.resolve([]);
        },
      };
      return builder;
    },
  };
}

describe("lookupPublicTracking", () => {
  it("returns only matching goods and real updatedAt without financial/internal fields", async () => {
    const shipment = shipmentFixture();
    const db = fakeDb({
      keyRows: [{ recordId: shipment.id }],
      recordRows: [
        {
          recordId: shipment.id,
          data: {
            ...shipment,
            amount: 987654,
            route: "private route",
            account: "private account",
            invoice: { amount: 999 },
          },
          updatedAt: new Date("2026-01-02T03:04:05.000Z"),
        },
      ],
    });
    const result = await lookupPublicTracking(db, {
      tracking: " rf-123 ",
      phone: "+22212345678",
    });
    expect(result).toEqual({
      found: true,
      shipment: {
        tracking: "RF-123",
        status: "preparing",
        paymentStatus: "unbilled",
        stage: null,
        branch: null,
        updatedAt: "2026-01-02T03:04:05.000Z",
        source: "dubai",
        goods: [
          {
            cartonNumber: 1,
            name: "Visible goods",
            pieces: 2,
            unitWeight: 1.25,
            weight: 2.5,
          },
        ],
        totalPieces: 2,
        totalWeight: 2.5,
      },
    });
    expect(JSON.stringify(result)).not.toContain("987654");
    expect(JSON.stringify(result)).not.toContain("private");
    expect(db.writes).toEqual({ insert: 0, update: 0, delete: 0 });
  });

  it("uses the bounded records fallback and handles Arabic digits through the shared projection", async () => {
    const shipment = shipmentFixture("+22212345678");
    const db = fakeDb({
      keyRows: [],
      fallbackRows: [
        {
          recordId: shipment.id,
          data: { ...shipment, tracking: "RF-١٢٣" },
          updatedAt: "2026-02-03T04:05:06.000Z",
        },
      ],
    });
    const result = await lookupPublicTracking(db, {
      tracking: "rf-١٢٣",
      phone: "+22212345678",
    });
    expect(result.found).toBe(true);
    if (result.found)
      expect(result.shipment.updatedAt).toBe("2026-02-03T04:05:06.000Z");
  });

  it.each([
    ["wrong phone", "+22299999999"],
    ["partial phone", "12345678"],
    ["wrong shipment", "+22212345678"],
  ])("returns indistinguishable not-found for %s", async (_label, phone) => {
    const shipment = shipmentFixture();
    const db = fakeDb({
      keyRows: [{ recordId: shipment.id }],
      recordRows: [
        {
          recordId: shipment.id,
          data: shipment,
          updatedAt: new Date(),
        },
      ],
    });
    const result = await lookupPublicTracking(db, {
      tracking: _label === "wrong shipment" ? "other" : shipment.tracking,
      phone,
    });
    expect(result).toEqual({ found: false });
  });

  it("rejects a missing phone at the shared input boundary", async () => {
    const shipment = shipmentFixture();
    const db = fakeDb({ keyRows: [{ recordId: shipment.id }] });
    await expect(
      lookupPublicTracking(db, { tracking: shipment.tracking, phone: "" })
    ).rejects.toThrow();
  });

  it.each(["local", "pending"])(
    "treats persisted %s UI labels as shared without altering the row",
    async scope => {
      const shipment = {
        ...shipmentFixture(),
        scope: scope as "local" | "pending",
      };
      const db = fakeDb({
        keyRows: [{ recordId: shipment.id }],
        recordRows: [
          { recordId: shipment.id, data: shipment, updatedAt: new Date() },
        ],
      });
      const result = await lookupPublicTracking(db, {
        tracking: shipment.tracking,
        phone: "+22212345678",
      });
      expect(result.found).toBe(true);
      expect(shipment.scope).toBe(scope);
      expect(db.writes).toEqual({ insert: 0, update: 0, delete: 0 });
    }
  );
  it("does not publish device drafts with no persisted database row", async () => {
    const db = fakeDb({ keyRows: [], fallbackRows: [] });
    await expect(
      lookupPublicTracking(db, { tracking: "RF-LOCAL", phone: "+22212345678" })
    ).resolves.toEqual({ found: false });
  });

  it("does not reveal deleted shipments or deleted goods", async () => {
    const shipment = shipmentFixture();
    const deletedShipment = {
      ...shipment,
      deleted: { at: "2026-01-01T00:00:00.000Z", reason: "private" },
    };
    const db = fakeDb({
      keyRows: [{ recordId: shipment.id }],
      recordRows: [
        { recordId: shipment.id, data: deletedShipment, updatedAt: new Date() },
      ],
    });
    await expect(
      lookupPublicTracking(db, {
        tracking: shipment.tracking,
        phone: "+22212345678",
      })
    ).resolves.toEqual({ found: false });
  });

  it("does not use another customer's paid goods to mark the exact phone paid", async () => {
    let shipment = shipmentFixture();
    shipment = addPackingGoods(shipment, {
      name: "Other customer goods",
      phone: "+22299999999",
      pieces: 1,
      unitWeight: 1,
    });
    const own = shipment.packing!.cartons[0].goods[0].id;
    const other = shipment.packing!.cartons[0].goods[1].id;
    const status = await derivePublicPaymentStatus(
      paymentDb({
        claims: [
          { shipmentId: shipment.id, goodsId: other, invoiceId: "paid-other" },
        ],
        invoices: [{ recordId: "paid-other", data: { status: "مدفوعة" } }],
      }),
      shipment,
      { tracking: shipment.tracking, phone: "+22212345678" }
    );
    expect(own).not.toBe(other);
    expect(status).toBe("unbilled");
  });

  it("marks a matched good paid only when its own charge is fully allocated", async () => {
    const shipment = shipmentFixture();
    const goodsId = shipment.packing!.cartons[0].goods[0].id;
    const status = await derivePublicPaymentStatus(
      paymentDb({
        components: [
          {
            id: "component-own",
            shipmentId: shipment.id,
            goodsId,
            amount: "10.00",
          },
        ],
        allocations: [
          {
            componentId: "component-own",
            invoiceId: "invoice-own",
            kind: "invoice",
            amount: "10.00",
          },
          {
            componentId: "component-own",
            invoiceId: "invoice-own",
            kind: "payment",
            amount: "10.00",
          },
        ],
        invoices: [
          { recordId: "invoice-own", data: { status: "بانتظار الدفع" } },
        ],
      }),
      shipment,
      { tracking: shipment.tracking, phone: "+22212345678" }
    );
    expect(status).toBe("paid");
  });

  it("has deterministic bounded TTL limiting for an IP and tracking pair", () => {
    const limiter = new PublicTrackingLimiter({
      ttlMs: 100,
      maxEntries: 4,
      maxPerIp: 10,
      maxPerShipment: 2,
    });
    expect(limiter.check("203.0.113.10", "RF-1", 0)).toBe(true);
    expect(limiter.check("203.0.113.10", "rf-1", 1)).toBe(true);
    expect(limiter.check("203.0.113.10", "RF-1", 2)).toBe(false);
    expect(limiter.check("203.0.113.10", "RF-1", 101)).toBe(true);
    expect(limiter.size).toBeLessThanOrEqual(4);
  });
});
