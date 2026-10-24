import { describe, expect, it } from "vitest";
import { addPackingGoods, createPackedShipment } from "./packing";
import {
  customerLinkGrantInputSchema,
  customerLinkRevokeInputSchema,
  customerTrackingResultSchema,
  projectCustomerShipment,
} from "./customerTracking";

function shipmentFixture() {
  let shipment = createPackedShipment({
    tracking: "PRIVATE-1",
    source: "dubai",
  });
  shipment = addPackingGoods(shipment, {
    name: "Mine",
    phone: "+22211111111",
    pieces: 2,
    unitWeight: 1.25,
  });
  shipment = addPackingGoods(shipment, {
    name: "Other customer",
    phone: "+22222222222",
    pieces: 1,
    unitWeight: 3,
  });
  return {
    ...shipment,
    id: "shipment-1",
    officeId: "dubai" as const,
    status: "مسلّمة" as const,
    packing: {
      ...shipment.packing,
      cartons: shipment.packing.cartons.map(carton => ({
        ...carton,
        closed: true,
      })),
    },
  };
}

describe("customer tracking shared privacy contract", () => {
  it("does not accept userId input and bounds each link mutation", () => {
    expect(
      customerLinkGrantInputSchema.safeParse({
        targetEmail: "customer@example.test",
        customerAccountId: "account-1",
        shipmentId: "shipment-1",
        goods: [{ goodsId: "good-1", expectedVersion: 0 }],
        userId: 99,
      }).success
    ).toBe(false);
    expect(
      customerLinkRevokeInputSchema.safeParse({
        customerAccountId: "account-1",
        shipmentId: "shipment-1",
        goods: [],
      }).success
    ).toBe(false);
  });

  it("keeps a mixed shipment private when another good is delivered", () => {
    const shipment = shipmentFixture();
    const goods = shipment.packing!.cartons.flatMap(carton => carton.goods);
    const result = projectCustomerShipment(shipment, [goods[0].id], {
      deliveryByGoods: new Map([[goods[0].id, null]]),
      allActiveGoodsLinked: false,
      timeline: [
        {
          stage: "arrived_office",
          branch: "nouakchott",
          at: "2026-10-24T10:00:00.000Z",
        },
      ],
    });
    expect(result?.status).toBe("ready_for_delivery");
    expect(result?.goods[0].delivery).toEqual({
      status: "pending",
      deliveredAt: null,
    });
    expect(result?.goods).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("Other customer");
    expect(JSON.stringify(result)).not.toContain("11111111");
    expect(JSON.stringify(result)).not.toContain("amount");
  });

  it("drops deleted goods and retired/deleted shipments from the pure projection", () => {
    const shipment = shipmentFixture();
    const goods = shipment.packing!.cartons.flatMap(carton => carton.goods);
    shipment.packing!.cartons[0].goods[0].deleted = {
      at: "2026-10-24T10:00:00.000Z",
      reason: "retired",
    };
    expect(projectCustomerShipment(shipment, [goods[0].id])).toBeNull();
    expect(
      projectCustomerShipment(
        {
          ...shipment,
          deleted: { at: "2026-10-24T10:00:00.000Z", reason: "retired" },
        },
        [goods[1].id]
      )
    ).toBeNull();
  });

  it("allows only sanitized timeline fields and rejects internal PII/financial fields", () => {
    const shipment = shipmentFixture();
    const goods = shipment.packing!.cartons.flatMap(carton => carton.goods);
    const result = projectCustomerShipment(shipment, [goods[0].id], {
      timeline: [
        {
          stage: "dubai_customs",
          branch: "dubai",
          at: "2026-10-24T10:00:00.000Z",
        },
      ],
    });
    expect(
      customerTrackingResultSchema.safeParse({ shipments: [result] }).success
    ).toBe(true);
    expect(result).not.toHaveProperty("customerAccountId");
    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("phone");
    expect(result).not.toHaveProperty("amount");
    expect(result?.timeline[0]).toEqual({
      stage: "dubai_customs",
      branch: "dubai",
      at: "2026-10-24T10:00:00.000Z",
    });
  });
});
