import mysql from "mysql2/promise";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const mode = process.argv[2];
if (!["before", "after"].includes(mode)) throw new Error("Choose before or after");
const path = "test-results/customer-migration-before.json";
function canonical(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}
const db = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await db.beginTransaction();
  const [tables] = await db.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()");
  const fingerprint = {};
  for (const { name } of tables) {
    if (name === "__drizzle_migrations") continue;
    if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error("Unexpected table name");
    const [rows] = await db.query(`SELECT * FROM \`${name}\``);
    const body = rows.map(canonical).sort().join("\n");
    fingerprint[name] = { count: rows.length, hash: createHash("sha256").update(body).digest("hex") };
  }
  await db.rollback();
  if (mode === "before") {
    await mkdir("test-results", { recursive: true });
    await writeFile(path, JSON.stringify(fingerprint, null, 2) + "\n");
    console.log(`سجلت بصمات ${Object.keys(fingerprint).length} جدولًا دون نشر المحتوى.`);
  } else {
    const prior = JSON.parse(await readFile(path, "utf8"));
    const changed = Object.keys(prior).filter(name => !fingerprint[name] || canonical(prior[name]) !== canonical(fingerprint[name]));
    if (changed.length) throw new Error(`تغيرت بصمات جداول أثناء الفترة؛ يلزم مراجعة التزامن: ${changed.join(", ")}`);
    console.log(`لم تتغير أعداد أو محتويات الجداول ${Object.keys(prior).length} بعد توسعة أنواع القيود.`);
  }
} finally {
  await db.end();
}
