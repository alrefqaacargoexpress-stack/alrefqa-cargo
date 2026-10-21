import * as XLSX from "xlsx";
import type { Account } from "@shared/operations";

export type ImportResult = { rows: Account[]; rejected: { row: number; reason: string }[]; total: number };
export const ACCOUNT_HEADERS = ["رقم الحساب", "اسم الحساب", "الهاتف", "المدينة", "عدد الشحنات", "الرصيد"];
const aliases = [["رقم الحساب", "id"], ["اسم الحساب", "name"], ["الهاتف", "phone"], ["المدينة", "city"], ["عدد الشحنات", "shipments"], ["الرصيد", "balance"]];
const digits = (value: unknown) => String(value ?? "").replace(/[٠-٩]/g, char => String("٠١٢٣٤٥٦٧٨٩".indexOf(char))).replace(/[۰-۹]/g, char => String("۰۱۲۳۴۵۶۷۸۹".indexOf(char))).trim();

export function parseAccountsBuffer(buffer: ArrayBuffer, existingIds: string[] = []): ImportResult {
  if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("حجم الملف أكبر من 5 ميغابايت.");
  const workbook = XLSX.read(buffer, { type: "array", cellFormula: true, sheetRows: 5002 });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet || !sheet["!ref"]) throw new Error("لا توجد بيانات في الورقة الأولى.");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: true });
  if (grid.length < 2) throw new Error("الملف لا يحتوي على صفوف حسابات. استخدم القالب المتاح.");
  if (grid.length > 5001) throw new Error("الحد الأقصى هو 5000 حساب في كل ملف.");
  const names = grid[0].map(value => String(value).trim());
  const indexes = aliases.map(options => names.findIndex(name => options.includes(name)));
  const missing = indexes.slice(0, 3).map((index, position) => index === -1 ? ACCOUNT_HEADERS[position] : null).filter(Boolean);
  if (missing.length) throw new Error(`أعمدة مطلوبة غير موجودة: ${missing.join("، ")}`);
  if (new Set(names.filter(Boolean)).size !== names.filter(Boolean).length) throw new Error("يوجد اسم عمود مكرر في الملف.");
  const seen = new Set(existingIds.map(id => id.trim().toLowerCase()));
  const result: ImportResult = { rows: [], rejected: [], total: 0 };
  grid.slice(1).forEach((values, offset) => {
    if (values.every(value => String(value).trim() === "")) return;
    result.total++;
    const row = offset + 2;
    const read = (position: number) => indexes[position] < 0 ? "" : values[indexes[position]];
    const id = String(read(0)).trim();
    const name = String(read(1)).trim();
    const phone = digits(read(2));
    const city = String(read(3)).trim();
    const shipmentsText = digits(read(4));
    const balanceText = digits(read(5));
    const shipments = shipmentsText === "" ? 0 : Number(shipmentsText);
    const balance = balanceText === "" ? 0 : Number(balanceText);
    let reason = "";
    if (!id || !name || !phone) reason = "رقم الحساب والاسم والهاتف مطلوبة.";
    else if (!/^[\p{L}\p{N}_.-]{1,80}$/u.test(id)) reason = "رقم الحساب غير صالح؛ استخدم الحروف والأرقام والشرطة فقط.";
    else if (name.length > 200 || city.length > 160) reason = "الاسم أطول من 200 حرف أو المدينة أطول من 160 حرفًا.";
    else if (!/^\+?[\d\s().-]{6,30}$/.test(phone) || phone.replace(/\D/g, "").length < 6) reason = "رقم الهاتف غير صالح؛ احتفظ بعلامة + ورمز الدولة.";
    else if (!Number.isSafeInteger(shipments) || shipments < 0) reason = "عدد الشحنات يجب أن يكون عددًا صحيحًا غير سالب.";
    else if (!Number.isFinite(balance) || balance < 0 || balance > 999999999) reason = "الرصيد يجب أن يكون رقمًا غير سالب ضمن الحد المسموح.";
    else if (seen.has(id.toLowerCase())) reason = "رقم الحساب مكرر في الملف أو موجود بالفعل؛ لن يتم استبداله تلقائيًا.";
    const sheetRow = XLSX.utils.decode_range(sheet["!ref"]!).s.r + row - 1;
    for (const index of indexes.filter(value => value >= 0)) {
      const cell = sheet[XLSX.utils.encode_cell({ r: sheetRow, c: index })];
      if (cell?.f) reason = "الخلايا المحسوبة غير مسموحة؛ استبدل الصيغة بقيمة ثابتة.";
    }
    if (reason) { result.rejected.push({ row, reason }); return; }
    seen.add(id.toLowerCase());
    result.rows.push({ id, name, phone, city: city || "غير محدد", shipments, balance, updatedAt: new Date().toISOString(), scope: "pending" });
  });
  return result;
}

export async function parseAccountsWorkbook(file: File, existingIds: string[] = []): Promise<ImportResult> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("اختر ملف Excel بصيغة .xlsx.");
  if (file.size > 5 * 1024 * 1024) throw new Error("حجم الملف أكبر من 5 ميغابايت.");
  return parseAccountsBuffer(await file.arrayBuffer(), existingIds);
}

export function buildAccountsWorkbook(accounts: Account[]): XLSX.WorkBook {
  const rows = accounts.map(account => [account.id, account.name, account.phone, account.city, account.shipments, account.balance]);
  const sheet = XLSX.utils.aoa_to_sheet([ACCOUNT_HEADERS, ...rows]);
  // Account IDs and phone numbers must remain text (leading zero and '+' preserved).
  rows.forEach((_, index) => [0, 1, 2, 3].forEach(column => {
    const key = XLSX.utils.encode_cell({ r: index + 1, c: column });
    if (sheet[key]) sheet[key] = { t: "s", v: String(rows[index][column]) };
  }));
  sheet["!cols"] = [{ wch: 20 }, { wch: 32 }, { wch: 24 }, { wch: 20 }, { wch: 16 }, { wch: 16 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "الحسابات");
  return workbook;
}

export function exportAccountsWorkbook(accounts: Account[]): void {
  XLSX.writeFile(buildAccountsWorkbook(accounts), `alrefqaa-accounts-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
export function exportAccountsTemplate(): void {
  XLSX.writeFile(buildAccountsWorkbook([]), "alrefqaa-accounts-template.xlsx");
}
export function exportImportReport(result: ImportResult): void {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["الصف", "سبب الرفض"], ...result.rejected.map(item => [item.row, item.reason])]), "تقرير الأخطاء");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["إجمالي الصفوف", "المقبول", "المرفوض"], [result.total, result.rows.length, result.rejected.length]]), "ملخص");
  XLSX.writeFile(workbook, "alrefqaa-import-report.xlsx");
}
