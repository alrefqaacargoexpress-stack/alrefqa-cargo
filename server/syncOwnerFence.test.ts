import { describe, expect, it, vi } from "vitest";
import { commitWarehouseStorage } from "./warehouse";

// No driver/DSN is used: this rejected request must not enter a fake transaction.
describe("warehouse automatic synchronization owner fence", () => {
  it("never sends a previous user's shelf draft under a new session", async () => {
    const transaction = vi.fn();
    const select = vi.fn();
    await expect(
      commitWarehouseStorage(
        { transaction, select } as any,
        { id: 7, role: "admin", accountType: "employee" } as any,
        {
          requestId: "pending-shelf-request",
          shipmentId: "shipment-a",
          goodsId: "goods-a",
          warehouse: "مغ أ",
          shelf: "أ1",
          expectedVersion: 1,
          clientUserId: "8",
        }
      )
    ).rejects.toThrow("sync_owner_mismatch");
    expect(transaction).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });
});
