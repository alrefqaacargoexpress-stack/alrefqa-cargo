import { beforeEach, describe, expect, it } from "vitest";
import {
  loadWarehousePending,
  queueWarehouseLocation,
  removeWarehouseLocation,
} from "./warehouseStore";

beforeEach(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => data.set(k, v),
      },
    },
  });
});

describe("warehouse pending store", () => {
  const command = {
    requestId: "r1",
    shipmentId: "s1",
    goodsId: "g1",
    warehouse: "W",
    shelf: "S",
    expectedVersion: 1,
  };
  it("is keyed by the real numeric session id", () => {
    queueWarehouseLocation(7, command);
    expect(loadWarehousePending(7).pending).toHaveLength(1);
    expect(loadWarehousePending(8).pending).toHaveLength(0);
    expect(() => loadWarehousePending("offline-profile")).toThrow();
  });
  it("keeps a pending draft until explicitly removed", () => {
    queueWarehouseLocation(7, command);
    expect(loadWarehousePending(7).pending[0].warehouse).toBe("W");
    removeWarehouseLocation(7, "r1");
    expect(loadWarehousePending(7).pending).toHaveLength(0);
  });
});
