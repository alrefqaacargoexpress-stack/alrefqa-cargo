import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DutyAvailability from "./DutyAvailability";

const state = vi.hoisted(() => ({
  language: "en" as const,
  rows: [
    {
      id: 7,
      name: "Assigned employee",
      role: "staff" as const,
      office: "dubai" as const,
      status: "on" as const,
      activatedAt: new Date("2026-10-24T12:00:00Z"),
      expiresAt: new Date("2026-10-24T20:00:00Z"),
    },
    {
      id: 8,
      name: "Foreign employee",
      role: "staff" as const,
      office: "china" as const,
      status: "on" as const,
      activatedAt: new Date("2026-10-24T12:00:00Z"),
      expiresAt: new Date("2026-10-24T20:00:00Z"),
    },
  ],
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: state.language, dir: "ltr" }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    duty: {
      list: {
        useQuery: () => ({
          data: state.rows,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }),
      },
      activate: {
        useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
      },
      deactivate: {
        useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
      },
    },
    operations: {
      publicContact: {
        useQuery: () => ({
          data: { publicPhone: null, publicPhoneVisible: false },
        }),
      },
      updatePublicContact: {
        useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
      },
    },
    useUtils: () => ({
      duty: { list: { invalidate: vi.fn() } },
      operations: { publicContact: { invalidate: vi.fn() } },
    }),
  },
}));

describe("DutyAvailability", () => {
  it("shows only the assigned office roster and uses the acknowledged state", () => {
    const html = renderToStaticMarkup(
      <DutyAvailability
        workspace={
          {
            userId: "7",
            role: "staff",
            offices: ["dubai"],
            online: true,
            localOnly: false,
          } as never
        }
      />
    );
    expect(html).toContain("Assigned employee");
    expect(html).not.toContain("Foreign employee");
    expect(html).toContain("Active for duty");
    expect(html).not.toContain("heartbeat");
  });
});
