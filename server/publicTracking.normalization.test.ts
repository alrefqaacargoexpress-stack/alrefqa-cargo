import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  canonicalTrackingExpression,
  lookupPublicTracking,
  PublicTrackingLimiter,
} from "./publicTracking";
import { normalizePublicTracking } from "@shared/publicTracking";
import { createPackedShipment, addPackingGoods } from "@shared/packing";
const dialect = new MySqlDialect();
describe("public shipment number canonicalization", () => {
  it("generates parameterized exact Arabic and Persian replacements in SQL", () => {
    const q = dialect.sqlToQuery(canonicalTrackingExpression());
    expect(q.sql.match(/REPLACE/g)).toHaveLength(20);
    expect(q.sql).toContain("LOWER(TRIM(");
    expect(q.sql).not.toContain("LIKE");
    expect(q.params).toContain("١");
    expect(q.params).toContain("۱");
    expect(q.params).toContain("1");
  });
  it.each([
    ["RF-١٢٣", "rf-123"],
    ["RF-123", "rf-۱۲۳"],
  ])(
    "looks up %s when input is %s without altering saved identifiers",
    async (saved, input) => {
      const s = {
        ...addPackingGoods(
          createPackedShipment({
            tracking: saved,
            source: "dubai",
            pricePerKg: 2,
          }),
          { name: "Only own", phone: "+22233331234", unitWeight: 1, pieces: 1 }
        ),
        scope: "shared" as const,
      };
      let call = 0;
      const clauses: ReturnType<MySqlDialect["sqlToQuery"]>[] = [];
      const db = {
        select: () => {
          call++;
          const n = call;
          const b = {
            from: () => b,
            where: (clause: Parameters<MySqlDialect["sqlToQuery"]>[0]) => {
              clauses.push(dialect.sqlToQuery(clause));
              return b;
            },
            orderBy: () => b,
            limit: () =>
              Promise.resolve(
                n === 1
                  ? []
                  : [
                      {
                        data: s,
                        updatedAt: new Date("2026-10-22T00:00:00.000Z"),
                      },
                    ]
              ),
          };
          return b;
        },
      };
      const result = await lookupPublicTracking(db, {
        tracking: input,
        phone: "+22233331234",
      });
      expect(result.found).toBe(true);
      expect(clauses[0].params).toContain("rf-123");
      expect(clauses[1].params.at(-1)).toBe("rf-123");
      expect(clauses[1].sql.match(/REPLACE/g)).toHaveLength(20);
      expect(s.tracking).toBe(saved);
    }
  );
  it("uses one limiter bucket for number spellings rather than resetting attempts", () => {
    const limiter = new PublicTrackingLimiter({ maxPerShipment: 1 });
    expect(limiter.check("test-address", "RF-١٢٣", 0)).toBe(true);
    expect(limiter.check("test-address", "RF-123", 1)).toBe(false);
    expect(normalizePublicTracking(" RF-۱۲۳ ")).toBe("rf-123");
  });
});
