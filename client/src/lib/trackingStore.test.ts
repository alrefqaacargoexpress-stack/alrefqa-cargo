import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyTrackingCache,
  parseTrackingDetail,
  parseTrackingSummaries,
  queueTrackingCommand,
  removeAcknowledged,
  loadTrackingCache,
  saveTrackingCache,
} from "./trackingStore";

const summary = {
  id: "s1",
  tracking: "TR-1",
  status: "قيد التجهيز",
  stage: "preparing",
  branch: "dubai",
  startedAt: "2026-01-01T12:00:00.000Z",
  expectedDays: 9,
  updatedAt: "2026-01-01T12:00:00.000Z",
  version: 3,
  deleted: false,
} as const;
const detail = {
  id: "s1",
  tracking: "TR-1",
  route: "Dubai → Nouakchott",
  service: "جوي",
  status: "قيد التجهيز",
  eta: "2026-01-10",
  amount: 999999,
  account: "secret",
  version: 3,
  journey: {
    stage: "preparing",
    branch: "dubai",
    startedAt: "2026-01-01T12:00:00.000Z",
    expectedDays: 9,
    updatedAt: "2026-01-01T12:00:00.000Z",
    notes: [],
  },
} as const;

describe("tracking store", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    vi.stubGlobal("navigator", {
      locks: {
        request: async (_key: string, callback: () => void) => callback(),
      },
    });
    vi.stubGlobal("crypto", { randomUUID: () => "request-1" });
  });
  it("parses summaries and strips finance from detail projection", () => {
    expect(
      parseTrackingSummaries({ items: [summary], total: 1, truncated: false })
        .items[0].id
    ).toBe("s1");
    const safe = parseTrackingDetail(detail);
    expect(safe).not.toHaveProperty("amount");
    expect(safe).not.toHaveProperty("account");
  });
  it("scopes caches by user and role", async () => {
    await saveTrackingCache({
      ...emptyTrackingCache("7", "tracking_staff"),
      summaries: [summary],
    });
    expect(loadTrackingCache("7", "tracking_staff").summaries).toHaveLength(1);
    expect(loadTrackingCache("7", "viewer").summaries).toHaveLength(0);
  });
  it("increments expected versions for each queued command without optimistic confirmation", () => {
    let cache = {
      ...emptyTrackingCache("7", "tracking_staff"),
      summaries: [summary],
    };
    cache = queueTrackingCommand(cache, "tracking_staff", "s1", {
      type: "note",
      text: "Checked",
    });
    cache = queueTrackingCommand(cache, "tracking_staff", "s1", {
      type: "note",
      text: "Rechecked",
    });
    expect(cache.pending.map(item => item.expectedVersion)).toEqual([3, 4]);
    expect(cache.summaries[0].stage).toBe("preparing");
  });
  it("removes only the matching acknowledged request and retains other pending work", () => {
    let cache = {
      ...emptyTrackingCache("7", "tracking_staff"),
      summaries: [summary],
      pending: [
        {
          requestId: "request-1",
          shipmentId: "s1",
          expectedVersion: 3,
          command: { type: "note", text: "Checked" },
          queuedAt: "2026-01-01T12:00:00.000Z",
          role: "tracking_staff",
        },
      ],
    };
    const next = removeAcknowledged(cache, "wrong", {
      requestId: "request-1",
      shipment: detail,
      version: 4,
    });
    expect(next.pending).toHaveLength(1);
    const acknowledged = removeAcknowledged(cache, "request-1", {
      requestId: "request-1",
      shipment: detail,
      version: 4,
    });
    expect(acknowledged.pending).toHaveLength(0);
    expect(acknowledged.details.s1.version).toBe(4);
  });
  it("rejects malformed or financially unsafe summaries", () => {
    expect(() =>
      parseTrackingSummaries({
        items: [{ ...summary, version: -1 }],
        total: 1,
        truncated: false,
      })
    ).toThrow();
    expect(() =>
      parseTrackingDetail({
        ...detail,
        journey: { ...detail.journey, expectedDays: 2 },
      })
    ).toThrow();
  });
});
