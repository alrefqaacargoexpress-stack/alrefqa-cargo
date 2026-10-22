import { describe, expect, it } from "vitest";
import {
  normalizePublicPhone,
  publicTrackingInputSchema,
  publicTrackingProjection,
  publicTrackingResultSchema,
} from "./publicTracking";
import type { Shipment } from "./operations";
function shipment(): Shipment {
  return {
    id: "internal-shipment",
    tracking: "RF-123",
    account: "Private Account",
    route: "Private route instructions",
    service: "جوي",
    status: "في الطريق",
    eta: "Private ETA",
    amount: 900,
    packing: {
      source: "dubai",
      pricePerKg: 50,
      pricePerKgMRU: 800,
      createdAt: "2026-10-20T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
      cartons: [
        {
          number: 1,
          closed: false,
          goods: [
            {
              id: "own",
              name: "Own Brand",
              phone: "+222 3333 1234",
              pieces: 2,
              unitWeight: 0.125,
            },
            {
              id: "other",
              name: "Other Customer",
              phone: "+22244445555",
              pieces: 9,
              unitWeight: 2,
            },
            {
              id: "removed",
              name: "Deleted goods",
              phone: "+22233331234",
              pieces: 1,
              unitWeight: 1,
              deleted: {
                at: "2026-10-21T00:00:00.000Z",
                reason: "Internal deletion reason",
              },
            },
          ],
        },
      ],
    },
    journey: {
      stage: "dubai_customs",
      branch: "dubai",
      startedAt: "2026-10-20T00:00:00.000Z",
      expectedDays: 9,
      updatedAt: "2026-10-22T00:00:00.000Z",
      notes: [
        {
          id: "secret",
          text: "Private Staff Note",
          at: "2026-10-21T00:00:00.000Z",
          actorId: 15,
          actorName: "Staff Private Name",
        },
      ],
    },
  };
}
const input = { tracking: "rf-123", phone: "00222 3333 1234" };
describe("public customer tracking projection", () => {
  it("normalizes Arabic/Persian digits and 00 without suffix matching or guessed country", () => {
    expect(normalizePublicPhone("+٢٢٢ (٣٣٣٣) ١٢٣٤")).toBe("22233331234");
    expect(normalizePublicPhone("۰۰۲۲۲۳۳۳۳۱۲۳۴")).toBe("22233331234");
    expect(normalizePublicPhone("33331234")).not.toBe(
      normalizePublicPhone(input.phone)
    );
    expect(normalizePublicPhone("abc+22233331234")).toBeNull();
    expect(normalizePublicPhone("+22233331234ext1")).toBeNull();
  });
  it("requires both nonempty inputs and rejects unsupported fields", () => {
    expect(
      publicTrackingInputSchema.safeParse({ tracking: "RF-123" }).success
    ).toBe(false);
    expect(
      publicTrackingInputSchema.safeParse({ phone: input.phone }).success
    ).toBe(false);
    expect(
      publicTrackingInputSchema.safeParse({ ...input, phone: "123" }).success
    ).toBe(false);
    expect(
      publicTrackingInputSchema.safeParse({ ...input, accountId: "private" })
        .success
    ).toBe(false);
  });
  it("returns only the exact phone's active cargo and recorded stage", () => {
    const result = publicTrackingProjection(shipment(), input);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("not found");
    expect(result.shipment.goods).toEqual([
      {
        cartonNumber: 1,
        name: "Own Brand",
        pieces: 2,
        unitWeight: 0.125,
        weight: 0.25,
      },
    ]);
    expect(result.shipment.totalPieces).toBe(2);
    expect(result.shipment.totalWeight).toBe(0.25);
    expect(result.shipment.stage).toBe("dubai_customs");
    expect(result.shipment.updatedAt).toBe("2026-10-22T00:00:00.000Z");
    const json = JSON.stringify(result);
    for (const secret of [
      "Private Account",
      "Private route",
      "Private ETA",
      "Other Customer",
      "22244445555",
      "Private Staff Note",
      "Staff Private Name",
      "Deleted goods",
      "pricePerKg",
      "amount",
      "actorId",
      "internal-shipment",
    ])
      expect(json).not.toContain(secret);
    expect(publicTrackingResultSchema.safeParse(result).success).toBe(true);
  });
  it("cannot infer cargo when only a suffix phone or a different shipment is supplied", () => {
    expect(
      publicTrackingProjection(shipment(), { ...input, phone: "33331234" })
    ).toEqual({ found: false });
    expect(
      publicTrackingProjection(shipment(), { ...input, tracking: "RF-12" })
    ).toEqual({ found: false });
    expect(
      publicTrackingProjection(shipment(), { ...input, phone: "+22233339999" })
    ).toEqual({ found: false });
  });
  it("does not return deleted shipments, removed goods, or an account's legacy phone", () => {
    const s = shipment();
    s.deleted = { at: "2026-10-22T00:00:00.000Z", reason: "Secret" };
    expect(publicTrackingProjection(s, input)).toEqual({ found: false });
    const legacy = shipment();
    delete legacy.packing;
    expect(publicTrackingProjection(legacy, input)).toEqual({ found: false });
    const removed = shipment();
    removed.packing!.cartons[0].goods =
      removed.packing!.cartons[0].goods.filter(x => Boolean(x.deleted));
    expect(publicTrackingProjection(removed, input)).toEqual({ found: false });
  });
  it("does not invent a branch or airport for a legacy shipment with no journey", () => {
    const s = shipment();
    delete s.journey;
    const result = publicTrackingProjection(
      s,
      input,
      "2026-10-22T02:00:00.000Z"
    );
    expect(result.found).toBe(true);
    if (!result.found) throw new Error();
    expect(result.shipment.stage).toBeNull();
    expect(result.shipment.branch).toBeNull();
    expect(result.shipment.status).toBe("in_transit");
    expect(result.shipment.updatedAt).toBe("2026-10-22T02:00:00.000Z");
  });
  it("does not infer arrival from elapsed planned dates or reveal pending-payment status", () => {
    const s = shipment();
    s.journey!.startedAt = "2020-01-01T00:00:00.000Z";
    const r = publicTrackingProjection(s, input);
    expect(r.found && r.shipment.stage).toBe("dubai_customs");
    s.status = "بانتظار الدفع";
    const waiting = publicTrackingProjection(s, input);
    expect(waiting.found && waiting.shipment.status).toBe("processing");
  });
});
