import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AuditLogPanel, { auditQueryEnabled } from "./AuditLogPanel";
import { blankPermissions } from "@shared/permissions";
const query = vi.hoisted(() => ({ calls: [] as unknown[], fresh: false }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    audit: {
      list: {
        useQuery: (input: unknown) => {
          query.calls.push(input);
          return {
            data: {
              items: [
                {
                  id: 1,
                  actorName: "OLD_SCOPE",
                  action: "saved",
                  entity: "shipment",
                  recordId: "x",
                  createdAt: new Date(),
                },
              ],
              nextCursor: null,
            },
            isFetchedAfterMount: query.fresh,
            isFetching: false,
            isLoading: false,
            error: null,
            refetch: vi.fn(),
          };
        },
      },
    },
  },
}));
const subject = {
  role: "supervisor" as const,
  offices: ["dubai"] as const,
  permissions: {
    ...blankPermissions(),
    audit: "view" as const,
    tracking: "view" as const,
  },
};
const props = {
  language: "ar",
  subject,
  online: true,
  accessReady: true,
  userId: "1",
  localOnly: false,
  shipments: [{ id: "shipment-1", tracking: "REF-001" }],
};

describe("scoped audit log", () => {
  beforeEach(() => {
    query.calls = [];
    query.fresh = false;
  });
  it("offers a real shipment selector without requesting a global log for a supervisor", () => {
    const html = renderToStaticMarkup(<AuditLogPanel {...props} />);
    expect(html).toContain("REF-001");
    expect(html).toContain("عرض السجل");
    expect(query.calls).toEqual([]);
    expect(auditQueryEnabled(subject)).toBe(false);
  });
  it("passes the exact shipment id and hides any earlier cached scope", () => {
    const html = renderToStaticMarkup(
      <AuditLogPanel {...props} initialShipmentId="shipment-1" />
    );
    expect(query.calls).toEqual([{ shipmentId: "shipment-1" }]);
    expect(html).not.toContain("OLD_SCOPE");
    expect(html).toContain("جارٍ تحميل");
  });
  it("allows the owner global read but keeps denied or offline subjects from querying", () => {
    expect(auditQueryEnabled({ role: "admin" })).toBe(true);
    expect(
      auditQueryEnabled(
        { ...subject, permissions: blankPermissions() },
        "shipment-1"
      )
    ).toBe(false);
    renderToStaticMarkup(
      <AuditLogPanel {...props} online={false} initialShipmentId="shipment-1" />
    );
    expect(query.calls).toEqual([]);
  });
  it("requires both tracking and audit for a non-owner", () => {
    expect(
      auditQueryEnabled(
        { ...subject, permissions: { ...blankPermissions(), audit: "view" } },
        "shipment-1"
      )
    ).toBe(false);
  });
});
