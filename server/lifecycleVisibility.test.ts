import { describe, expect, it } from "vitest";
import {
  loadLifecycle,
  isRetired,
  recordIsActive,
  assertActiveEntity,
  isEmployeeDisabled,
} from "./lifecycle";
const dbFor = (rows: any[]) => {
  const query: any = {
    select: () => query,
    from: () => query,
    where: () => query,
    limit: async () => rows,
    then: (resolve: any, reject: any) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return query as never;
};
describe("Permanent operational lifecycle visibility", () => {
  it("new tombstones hide originals without changing their data", async () => {
    const original: any = {
      id: "s-1",
      tracking: "S1",
      packing: { pricePerKg: 37 },
    };
    const before = JSON.stringify(original);
    const index = await loadLifecycle(
      dbFor([{ entity: "shipment", recordId: "s-1", action: "delete" }])
    );
    expect(recordIsActive(index, "shipment", original)).toBe(false);
    expect(JSON.stringify(original)).toBe(before);
    expect(recordIsActive(index, "shipment", { id: "s-2" } as never)).toBe(
      true
    );
  });
  it("legacy deleted flags remain hidden even with no new event", async () => {
    const index = await loadLifecycle(dbFor([]));
    expect(
      recordIsActive(index, "shipment", {
        id: "s",
        deleted: { at: "2026-01-01", reason: "old" },
      } as never)
    ).toBe(false);
  });
  it("does not confuse invoice and shipment identifiers", async () => {
    const index = await loadLifecycle(
      dbFor([{ entity: "invoice", recordId: "same", action: "void" }])
    );
    expect(isRetired(index, "invoice", "same")).toBe(true);
    expect(isRetired(index, "shipment", "same")).toBe(false);
  });
  it("a retired identifier cannot be used in a later edit/receipt path", async () => {
    await expect(
      assertActiveEntity(
        dbFor([{ entity: "shipment", recordId: "s", action: "delete" }]),
        "shipment",
        "s"
      )
    ).rejects.toMatchObject({ message: "record_permanently_retired" });
  });
  it("employee disable targets only the exact account", async () => {
    const db = dbFor([
      { entity: "employee", recordId: "7", action: "disable" },
    ]);
    expect(await isEmployeeDisabled(db, 7)).toBe(true);
    expect(await isEmployeeDisabled(db, 8)).toBe(false);
  });
  it("an empty event table does not invent deleted accounts", async () => {
    const index = await loadLifecycle(dbFor([]));
    expect(recordIsActive(index, "invoice", { id: "i" } as never)).toBe(true);
    expect(await isEmployeeDisabled(dbFor([]), 7)).toBe(false);
  });
});
