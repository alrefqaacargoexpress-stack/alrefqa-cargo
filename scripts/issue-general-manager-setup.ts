import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getDb } from "../server/db";
import { issueInitialManagerSetup } from "../server/initialManagerSetup";

// Owner operation, not an API or startup task. Run only after explicit authorization.
const options = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) options.set(process.argv[i], process.argv[i + 1]);
const userId = Number(options.get("--user-id"));
const email = options.get("--email");
const output = options.get("--output");
const origin = options.get("--origin");
if (!Number.isSafeInteger(userId) || userId <= 0 || !email || !output || !origin || options.get("--approved-owner-operation") !== "yes")
  throw new Error("Explicit approved owner operation, user id, expected email, origin and private output path are required");
const url = new URL(origin);
if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
  throw new Error("Only a clean HTTPS website origin is accepted");
const db = await getDb();
if (!db) throw new Error("Database is unavailable");
const file = resolve(output);
if (file.startsWith(`${process.cwd()}/`)) throw new Error("Private delivery file must stay outside the project repository");
await mkdir(dirname(file), { recursive: true, mode: 0o700 });
const handle = await open(file, "wx", 0o600);
try {
  const issued = await issueInitialManagerSetup(db, userId, email);
  const link = `${url.origin}/account/security#setup=${issued.token}`;
  await handle.writeFile(
    `# إعداد دخول المدير العام بالبريد\n\n[افتح رابط إعداد المدير العام الخاص](${link})\n\nالبريد: ${email}\n\nاختر كلمة مرور جديدة للموقع ثم اضغط حفظ. هذه ليست كلمة مرور Gmail. يبقى حسابك وصلاحياتك وبيانات المؤسسة كما هي.\n\nالرابط خاص بك؛ لا تشاركه. صالح حتى ${issued.expiresAt.toISOString()} ويُستخدم مرة واحدة فقط. بعد الحفظ ادخل من صفحة البريد واختر «موظف»؛ صلاحية المدير العام محفوظة في حسابك.\n`,
    { encoding: "utf8" });
  // Never print the capability or URL into terminal logs.
  console.log(JSON.stringify({ output: file, expiresAt: issued.expiresAt.toISOString(), userId }));
} finally {
  await handle.close();
  await (db as any).$client.end();
}
