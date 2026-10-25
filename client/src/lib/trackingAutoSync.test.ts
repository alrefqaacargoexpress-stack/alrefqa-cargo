import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyTrackingCache,
  loadTrackingCache,
  queueTrackingCommand,
  saveTrackingCache,
  type TrackingCache,
} from "./trackingStore";
import { syncTrackingQueue } from "./trackingAutoSync";

const summary = {
  id: "s1",
  tracking: "TR-1",
  status: "في الطريق",
  stage: "preparing",
  branch: "dubai",
  startedAt: "2026-01-01T12:00:00.000Z",
  expectedDays: 9,
  updatedAt: "2026-01-01T12:00:00.000Z",
  version: 3,
  deleted: false,
} as const;
const { deleted: _summaryDeleted, ...detailSummary } = summary;
const detail = {
  ...detailSummary,
  route: "Dubai → Nouakchott",
  service: "جوي",
  eta: "2026-01-10",
  officeId: "dubai" as const,
  journey: {
    stage: "preparing" as const,
    branch: "dubai" as const,
    startedAt: summary.startedAt,
    expectedDays: 9,
    updatedAt: summary.updatedAt,
    notes: [],
  },
};
const response = (requestId: string) => ({
  requestId,
  shipment: detail,
  version: 4,
});

function pendingCache() {
  let cache: TrackingCache = {
    ...emptyTrackingCache("7", "tracking_staff"),
    summaries: [summary],
    details: { s1: detail },
  };
  cache = queueTrackingCommand(cache, "tracking_staff", "s1", {
    type: "note",
    text: "Checked",
  });
  return cache;
}

beforeEach(() => {
  const values = new Map<string, string>();
  let uuid = 0;
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
    dispatchEvent: () => true,
  });
  vi.stubGlobal("navigator", {
    onLine: true,
    locks: {
      request: async (_key: string, callback: () => unknown) => callback(),
    },
  });
  vi.stubGlobal("crypto", {
    randomUUID: () => `request-${++uuid}`,
  });
});

describe("tracking global sync adapter", () => {
  it("keeps the stable request ID when the network outcome is uncertain", async () => {
    await saveTrackingCache(pendingCache());
    const commit = vi.fn(async () => {
      throw new Error("network timeout");
    });
    const result = await syncTrackingQueue({
      userId: "7",
      role: "tracking_staff",
      offices: ["dubai"],
      isCurrent: () => true,
      commit,
    });
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "request-1", clientUserId: "7" })
    );
    expect(result.network).toBe(true);
    expect(loadTrackingCache("7", "tracking_staff").pending[0].requestId).toBe(
      "request-1"
    );
  });

  it("does not send or write a previous user's queue after cancellation", async () => {
    const original = pendingCache();
    await saveTrackingCache(original);
    const commit = vi.fn();
    await expect(
      syncTrackingQueue({
        userId: "7",
        role: "tracking_staff",
        offices: ["dubai"],
        isCurrent: () => false,
        commit,
      })
    ).rejects.toThrow("sync_owner_mismatch");
    expect(commit).not.toHaveBeenCalled();
    expect(loadTrackingCache("7", "tracking_staff").pending[0].requestId).toBe(
      original.pending[0].requestId
    );
  });

  it("retains a command appended while another command is sending", async () => {
    await saveTrackingCache(pendingCache());
    const commit = vi.fn(async (input: { requestId: string }) => {
      const current = loadTrackingCache("7", "tracking_staff");
      const appended = queueTrackingCommand(current, "tracking_staff", "s1", {
        type: "note",
        text: "Added while sending",
      });
      await saveTrackingCache(appended);
      return response(input.requestId);
    });
    const result = await syncTrackingQueue({
      userId: "7",
      role: "tracking_staff",
      offices: ["dubai"],
      isCurrent: () => true,
      commit,
    });
    const latest = loadTrackingCache("7", "tracking_staff");
    expect(result.applied).toHaveLength(1);
    expect(latest.pending).toHaveLength(1);
    expect(latest.pending[0].requestId).toBe("request-2");
  });

  it("blocks an out-of-scope shipment without calling commit", async () => {
    const cache = {
      ...pendingCache(),
      details: {
        s1: {
          ...detail,
          officeId: "china" as const,
          journey: { ...detail.journey, branch: "china" as const },
        },
      },
    };
    await saveTrackingCache(cache);
    const commit = vi.fn();
    const result = await syncTrackingQueue({
      userId: "7",
      role: "tracking_staff",
      offices: ["dubai"],
      isCurrent: () => true,
      commit,
    });
    expect(commit).not.toHaveBeenCalled();
    expect(result.blocked).toBe(true);
    expect(loadTrackingCache("7", "tracking_staff").pending).toHaveLength(1);
  });

  it("uses the owner fence and sends no finance or customer fields", async () => {
    await saveTrackingCache(pendingCache());
    const commit = vi.fn(async (input: any) => {
      expect(input).not.toHaveProperty("amount");
      expect(input).not.toHaveProperty("account");
      return response(input.requestId);
    });
    const result = await syncTrackingQueue({
      userId: "7",
      role: "tracking_staff",
      offices: ["dubai"],
      isCurrent: () => true,
      commit,
    });
    expect(result.applied[0]).toMatchObject({
      requestId: "request-1",
      version: 4,
    });
    expect(commit.mock.calls[0][0]).toMatchObject({ clientUserId: "7" });
  });

  it("retries a network result without a permanent review block or new ID", async () => {
    await saveTrackingCache(pendingCache());
    let online = false;
    const commit = vi.fn(async (input: { requestId: string }) => {
      if (!online) throw new Error("network timeout");
      return response(input.requestId);
    });
    const env = {
      userId: "7",
      role: "tracking_staff" as const,
      offices: ["dubai"],
      isCurrent: () => true,
      commit,
    };

    const first = await syncTrackingQueue(env);
    online = true;
    const second = await syncTrackingQueue(env);

    expect(first.network).toBe(true);
    expect(second.applied).toEqual([
      { requestId: "request-1", shipmentId: "s1", version: 4 },
    ]);
    expect(commit.mock.calls.map(call => call[0].requestId)).toEqual([
      "request-1",
      "request-1",
    ]);
  });
});
