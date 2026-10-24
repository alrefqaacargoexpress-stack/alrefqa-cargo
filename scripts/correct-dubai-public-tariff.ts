import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import * as schema from "../drizzle/schema";
import type { User } from "../drizzle/schema";
import { readProfile, updateProfile } from "../server/branches";
import { ENV } from "../server/_core/env";

async function main() {
  if (process.argv[2] !== "--apply-approved-37-aed")
    throw new Error("Explicit approved operation flag required");
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const db = drizzle(connection, { schema, mode: "default" });
    const candidates = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        openId: schema.users.openId,
        role: schema.users.role,
      })
      .from(schema.users);
    const roots = candidates.filter(
      user =>
        user.role === "admin" ||
        Boolean(ENV.ownerOpenId && user.openId === ENV.ownerOpenId)
    );
    if (roots.length !== 1)
      throw new Error("General manager identity is ambiguous; no update made");
    const current = await readProfile(db, "dubai");
    const oldRate = current.shippingRates?.airRegular;
    if (
      oldRate?.amount === 37 &&
      oldRate.currency === "AED" &&
      oldRate.unit === "kg"
    ) {
      console.log("The approved tariff is already stored; no changes made.");
      return;
    }
    if (
      oldRate?.amount !== 37 ||
      oldRate.currency !== "MRU" ||
      oldRate.unit !== "kg" ||
      current.version !== 1
    )
      throw new Error(
        "The tariff changed concurrently; review before replacing it"
      );
    const protectedTables = [
      "records",
      "finance_entries",
      "finance_goods",
      "finance_receipts",
      "invoice_adjustments",
      "cash_registers",
      "cash_movements",
      "member_roles",
    ];
    async function fingerprints() {
      const result: Record<string, string> = {};
      for (const table of protectedTables) {
        const [rows] = await connection.query("SELECT * FROM `" + table + "`");
        result[table] = createHash("sha256")
          .update(
            JSON.stringify(
              (rows as unknown[]).map(row => JSON.stringify(row)).sort()
            )
          )
          .digest("hex");
      }
      return JSON.stringify(result);
    }
    const before = await fingerprints();
    const { version, ...profile } = current;
    const saved = await updateProfile(
      db,
      roots[0] as User,
      {
        ...profile,
        expectedVersion: version,
        shippingRates: {
          ...current.shippingRates!,
          airRegular: { amount: 37, currency: "AED", unit: "kg" },
        },
      },
      "admin"
    );
    if (before !== (await fingerprints()))
      throw new Error(
        "Protected data changed; inspect concurrent user activity."
      );
    const history = await db
      .select({
        version: schema.officeTariffHistory.profileVersion,
        rates: schema.officeTariffHistory.shippingRates,
      })
      .from(schema.officeTariffHistory)
      .where(eq(schema.officeTariffHistory.officeId, "dubai"));
    console.log(
      JSON.stringify({
        office: "dubai",
        previousVersion: version,
        version: saved.version,
        approvedRate: saved.shippingRates?.airRegular,
        historicalVersions: history.map(row => row.version),
        protectedTablesUnchanged: true,
        historicalShipmentsRepriced: false,
      })
    );
  } finally {
    await connection.end();
  }
}
main().catch(error => {
  console.error(
    error instanceof Error ? error.message : "Approved tariff correction failed"
  );
  process.exitCode = 1;
});
