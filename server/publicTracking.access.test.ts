import { beforeEach, describe, expect, it, vi } from "vitest";
import { addPackingGoods, createPackedShipment } from "@shared/packing";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { publicTrackingLimiter } from "./publicTracking";
import { getDb } from "./db";

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

function fixture() {
  let shipment = createPackedShipment({
    tracking: "PUBLIC-1",
    source: "turkey",
    pricePerKg: 0,
  });
  shipment = addPackingGoods(shipment, {
    name: "Public cargo",
    phone: "+22212345678",
    pieces: 1,
    unitWeight: 3,
  });
  shipment = { ...shipment, scope: "shared" };
  return shipment;
}

function fakeDb(shipment: ReturnType<typeof fixture>) {
  const writes = { insert: 0, update: 0, delete: 0 };
  let selectCalls = 0;
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
        orderBy() {
          return builder;
        },
        limit() {
          if (selectCalls === 1)
            return Promise.resolve([{ recordId: shipment.id }]);
          if (selectCalls >= 2)
            return Promise.resolve([
              {
                recordId: shipment.id,
                data: {
                  ...shipment,
                  amount: 999999,
                  route: "secret route",
                  account: "secret account",
                },
                updatedAt: new Date("2026-03-04T05:06:07.000Z"),
              },
            ]);
          return Promise.resolve([]);
        },
      };
      return builder;
    },
  };
  return db;
}

function caller(
  res: { setHeader: ReturnType<typeof vi.fn> },
  ip = "198.51.100.7"
) {
  return appRouter.createCaller({
    user: null,
    req: { ip, headers: {}, socket: { remoteAddress: ip } },
    res,
  } as unknown as TrpcContext);
}

describe("publicTracking anonymous router access", () => {
  beforeEach(() => {
    publicTrackingLimiter.reset();
    vi.clearAllMocks();
  });

  it("allows anonymous POST mutation access, sets no-store, and projects no private fields", async () => {
    const shipment = fixture();
    const db = fakeDb(shipment);
    vi.mocked(getDb).mockResolvedValue(db as never);
    const res = { setHeader: vi.fn() };
    const result = await caller(res).publicTracking.lookup({
      tracking: " public-1 ",
      phone: "+22212345678",
    });
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.shipment.updatedAt).toBe("2026-03-04T05:06:07.000Z");
      expect(result.shipment).not.toHaveProperty("amount");
      expect(result.shipment).not.toHaveProperty("route");
      expect(result.shipment).not.toHaveProperty("account");
    }
    expect(db.writes).toEqual({ insert: 0, update: 0, delete: 0 });
  });

  it("returns TOO_MANY_REQUESTS deterministically for repeated same-shipment guesses", async () => {
    const shipment = fixture();
    const db = fakeDb(shipment);
    vi.mocked(getDb).mockResolvedValue(db as never);
    const res = { setHeader: vi.fn() };
    for (let attempt = 0; attempt < 20; attempt++) {
      await caller(res).publicTracking.lookup({
        tracking: shipment.tracking,
        phone: "+22200000000",
      });
    }
    await expect(
      caller(res).publicTracking.lookup({
        tracking: shipment.tracking,
        phone: "+22200000000",
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(db.writes).toEqual({ insert: 0, update: 0, delete: 0 });
  });

  it("does not trust a forwarded header as the limiter identity", async () => {
    const shipment = fixture();
    const db = fakeDb(shipment);
    vi.mocked(getDb).mockResolvedValue(db as never);
    const res = { setHeader: vi.fn() };
    const context = {
      user: null,
      req: {
        ip: "198.51.100.8",
        headers: { "x-forwarded-for": "203.0.113.99" },
        socket: { remoteAddress: "198.51.100.8" },
      },
      res,
    } as unknown as TrpcContext;
    await appRouter.createCaller(context).publicTracking.lookup({
      tracking: shipment.tracking,
      phone: "+22212345678",
    });
    expect(publicTrackingLimiter.size).toBe(3);
  });
});
