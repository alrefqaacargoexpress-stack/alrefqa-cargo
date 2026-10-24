import { describe, expect, it } from "vitest";
import { financeSnapshot } from "./finance";
import { records, financeEntries } from "../drizzle/schema";

function fakeDb(rows: { records: any[]; entries: any[] }) {
  return {
    select() {
      return {
        from(table: unknown) {
          const values =
            table === records
              ? rows.records
              : table === financeEntries
                ? rows.entries
                : [];
          const query = {
            where() {
              return Promise.resolve(values);
            },
            then(resolve: (value: any[]) => unknown) {
              return Promise.resolve(values).then(resolve);
            },
          };
          return query;
        },
      };
    },
  };
}

describe("finance backend", () => {
  it("returns only scoped invoices and immutable entries and derives a sole-office home", async () => {
    const db = fakeDb({
      records: [
        {
          entity: "invoice",
          recordId: "i1",
          version: 1,
          data: {
            id: "i1",
            account: "A",
            amount: 2,
            status: "دين",
            issuedAt: "2026-01-01",
            officeId: "dubai",
          },
        },
        {
          entity: "invoice",
          recordId: "i2",
          version: 1,
          data: {
            id: "i2",
            account: "B",
            amount: 3,
            status: "مدفوعة",
            issuedAt: "2026-01-01",
            officeId: "china",
          },
        },
      ],
      entries: [
        {
          data: {
            id: "e1",
            kind: "daily_expense",
            officeId: "dubai",
            amount: 1,
            currency: "AED",
            date: "2026-01-01",
            description: "x",
            actorId: 7,
            actorName: "A",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        {
          data: {
            id: "e2",
            kind: "daily_expense",
            officeId: "china",
            amount: 1,
            currency: "CNY",
            date: "2026-01-01",
            description: "x",
            actorId: 7,
            actorName: "A",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      ],
    });
    const result = await financeSnapshot(db, {
      role: "accountant",
      offices: ["dubai"],
      homeOffice: null,
    });
    expect(result.invoices.map((x: { id: string }) => x.id)).toEqual(["i1"]);
    expect(result.entries.map((x: { id: string }) => x.id)).toEqual(["e1"]);
    expect(result.homeOffice).toBe("dubai");
  });

  it("does not expose finance to a non-finance role", async () => {
    await expect(
      financeSnapshot(fakeDb({ records: [], entries: [] }), {
        role: "staff",
        offices: null,
      })
    ).rejects.toThrow("finance_forbidden");
  });
});
