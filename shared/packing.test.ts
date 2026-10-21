import { describe, expect, it } from "vitest";
import {
  addPackingGoods,
  changePackingStatus,
  closePackingCarton,
  createPackedShipment,
  customerDirectory,
  goodsTotals,
  packingCustomers,
  packingSchema,
  packingTotals,
  shipmentReports,
} from "./packing";
import { canonicalPackingShipment } from "./packing";
import type { Shipment } from "./operations";
const create = () =>
  createPackedShipment(
    { tracking: "RF-001", source: "china", pricePerKg: 10 },
    "2026-10-21T02:00:00.000Z"
  );
const add = (name = "Brand", weight = 2, pieces = 3) => ({
  name,
  phone: "",
  unitWeight: weight,
  pieces,
});
describe("Simple shipment packing", () => {
  it("starts with carton 1 and preserves source, rate, date and no fictitious goods", () => {
    const s = create();
    expect(s.packing.cartons).toEqual([
      { number: 1, closed: false, goods: [] },
    ]);
    expect(s.packing.createdAt).toBe("2026-10-21T02:00:00.000Z");
    expect(s.packing.source).toBe("china");
  });
  it("accepts optional phones and sums piece weights and quantities", () => {
    const s = addPackingGoods(create(), add());
    expect(packingTotals(s.packing)).toEqual({
      pieces: 3,
      weight: 2 * 3,
      amount: 2 * 3 * 10,
    });
    expect(s.packing.cartons[0].goods[0].phone).toBe("");
  });
  it("closes carton then opens the next while keeping old goods and order", () => {
    const s = closePackingCarton(addPackingGoods(create(), add()));
    expect(s.packing.cartons.map(c => [c.number, c.closed])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(s.packing.cartons[0].goods).toHaveLength(1);
    expect(s.packing.cartons[1].goods).toEqual([]);
  });
  it("groups repeated names across cartons without dropping distinct piece weights", () => {
    let s = closePackingCarton(addPackingGoods(create(), add(" Brand ", 2, 3)));
    s = addPackingGoods(s, add("brand", 4, 2));
    const summaries = packingCustomers(s.packing);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].pieces).toBe(3 + 2);
    expect(summaries[0].weight).toBe(2 * 3 + 4 * 2);
    expect(summaries[0].amount).toBe((2 * 3 + 4 * 2) * 10);
    expect(summaries[0].cartons).toEqual([1, 2]);
    expect(s.packing.cartons[1].goods[0].unitWeight).toBe(4);
  });
  it("rejects empty cartons, invalid weights, noninteger pieces and nonsequential cartons", () => {
    expect(() => closePackingCarton(create())).toThrow("carton_empty");
    expect(() => addPackingGoods(create(), add("X", 0, 1))).toThrow();
    expect(() => addPackingGoods(create(), add("X", 1, 1.5))).toThrow();
    const s = create();
    s.packing.cartons[0].number = 2;
    expect(() => packingSchema.parse(s.packing)).toThrow();
  });
  it("calculates decimal weights in grams and currency in cents", () => {
    const first = { id: "a", ...add("X", 0.1, 1) },
      second = { id: "b", ...add("X", 0.2, 1) };
    const totals = goodsTotals([first, second], 5);
    expect(totals.weight).toBe(Number((0.1 + 0.2).toFixed(3)));
    expect(totals.amount).toBe(Number(((0.1 + 0.2) * 5).toFixed(2)));
  });
  it("cannot send until nonempty cartons are closed and prevents further editing after send", () => {
    let s = addPackingGoods(create(), add());
    expect(() => changePackingStatus(s, "في الطريق")).toThrow(
      "close_carton_first"
    );
    s = changePackingStatus(closePackingCarton(s), "في الطريق");
    expect(() => addPackingGoods(s, add())).toThrow("shipment_not_open");
    expect(changePackingStatus(s, "مسلّمة").status).toBe("مسلّمة");
  });
  it("survives serialization after days without losing open carton or quantities", () => {
    const s = closePackingCarton(addPackingGoods(create(), add()));
    const restored = canonicalPackingShipment(JSON.parse(JSON.stringify(s)));
    expect(restored.packing?.createdAt).toBe(s.packing.createdAt);
    expect(restored.packing?.cartons[1].closed).toBe(false);
    expect(packingTotals(restored.packing!)).toEqual(packingTotals(s.packing));
  });
  it("keeps parallel shipments separate", () => {
    const first = addPackingGoods(create(), add());
    const second = createPackedShipment({
      tracking: "RF-002",
      source: "turkey",
      pricePerKg: 4,
    });
    expect(second.id).not.toBe(first.id);
    expect(second.packing.cartons[0].goods).toEqual([]);
  });
  it("derives customers and phone search data from accounts and actual goods", () => {
    const s = addPackingGoods(create(), { ...add(), phone: "+222123456" });
    const directory = customerDirectory(
      [
        {
          id: "A",
          name: "brand",
          phone: "",
          city: "City",
          shipments: 0,
          balance: 0,
          updatedAt: "now",
        },
      ],
      [s]
    );
    expect(directory).toHaveLength(1);
    expect(directory[0].phones).toEqual(["+222123456"]);
    expect(directory[0].accountIds).toEqual(["A"]);
    expect(directory[0].shipmentIds).toEqual([s.id]);
    expect(directory[0].pieces).toBe(3);
  });
  it("reports actual statuses and documented dates; legacy records are not fabricated as today", () => {
    const current = create();
    const yesterday = {
      ...create(),
      id: "old",
      scope: "shared" as const,
      packing: { ...create().packing, createdAt: "2026-10-20T02:00:00.000Z" },
    };
    const legacy: Shipment = {
      id: "legacy",
      tracking: "legacy",
      account: "Old",
      route: "Old",
      service: "جوي",
      status: "في الطريق",
      eta: "Unknown",
      amount: 0,
      scope: "shared",
    };
    const delivered = changePackingStatus(
      changePackingStatus(
        closePackingCarton(addPackingGoods(create(), add())),
        "في الطريق"
      ),
      "مسلّمة"
    );
    const result = shipmentReports(
      [current, yesterday, legacy, delivered],
      new Date("2026-10-21T12:00:00.000Z")
    );
    expect(result.total).toBe(4);
    expect(result.today).toBe(2);
    expect(result.inTransit).toBe(1);
    expect(result.delivered).toBe(1);
    expect(result.unknownDate).toBe(1);
    expect(result.shared).toBe(2);
  });
});
