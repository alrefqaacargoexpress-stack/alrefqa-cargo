import { describe, expect, it, vi, afterEach } from "vitest";
import { EMPTY_STATE } from "../../../shared/operations";
import { createPackedShipment } from "../../../shared/packing";
import { deleteShipment } from "../../../shared/shipmentDeletion";
import {
  retryPendingChange,
  stageChange,
  emptyWorkspace,
} from "./offlineStore";

afterEach(() => vi.unstubAllGlobals());
describe("Explicit safe sync retry", () => {
  it("changes request metadata only, preserves the version and all draft content", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-request-id" });
    const shipment = {
      ...createPackedShipment({
        tracking: "RETRY-1",
        source: "dubai",
        officeId: "dubai",
      }),
      version: 4,
      scope: "shared" as const,
    };
    const base = {
      ...emptyWorkspace(),
      state: { ...EMPTY_STATE, shipments: [shipment] },
    };
    const pending = stageChange(
      base,
      "shipment",
      deleteShipment(shipment, "Duplicate"),
      "Archive RETRY-1",
      "delete-shipment"
    );
    pending.queue[0].id = "rejected-attempt";
    const original = structuredClone(pending);
    const retried = retryPendingChange(pending, "rejected-attempt");
    expect(retried.queue).toHaveLength(1);
    expect(retried.queue[0].id).toBe("new-request-id");
    expect(retried.queue[0].expectedVersion).toBe(4);
    expect(retried.queue[0].action).toBe("delete-shipment");
    expect(retried.queue[0].data).toEqual(original.queue[0].data);
    expect(retried.state).toEqual(original.state);
    expect(retried.state.lastSyncedAt).toBeNull();
    expect(pending).toEqual(original);
  });
  it("preserves a preceding cargo edit and all unrelated queued requests", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-request-id" });
    const workspace = emptyWorkspace();
    workspace.queue = [
      {
        id: "first",
        entity: "shipment",
        recordId: "S1",
        expectedVersion: 4,
        data: {} as any,
        label: "Cargo edit",
        createdAt: "now",
      },
      {
        id: "archive",
        entity: "shipment",
        recordId: "S1",
        expectedVersion: 5,
        action: "delete-shipment",
        data: {} as any,
        label: "Archive",
        createdAt: "now",
      },
      {
        id: "other",
        entity: "account",
        recordId: "A1",
        expectedVersion: null,
        data: {} as any,
        label: "Other",
        createdAt: "now",
      },
    ];
    const next = retryPendingChange(workspace, "archive");
    expect(next.queue[0]).toBe(workspace.queue[0]);
    expect(next.queue[1].expectedVersion).toBe(5);
    expect(next.queue[2]).toBe(workspace.queue[2]);
    expect(next.queue).toHaveLength(3);
    expect(() => retryPendingChange(workspace, "missing")).toThrow(
      "pending_change_not_found"
    );
  });
});
