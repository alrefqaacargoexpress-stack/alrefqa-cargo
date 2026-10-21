import * as XLSX from "xlsx";
import type { Account } from "./offlineStore";

export type ImportResult = {
  rows: Account[];
  rejected: { row: number; reason: string }[];
};

const headers = ["رقم الحساب", "اسم الحساب", "الهاتف", "المدينة", "عدد الشحنات", "الرصيد"];

export async function parseAccountsWorkbook(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("لا توجد ورقة بيانات في الملف");

  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
  const rejected: ImportResult["rejected"] = [];
  const rows: Account[] = [];

  records.forEach((record, index) => {
    const row = index + 2;
    const id = String(record["رقم الحساب"] ?? record.id ?? "").trim();
    const name = String(record["اسم الحساب"] ?? record.name ?? "").trim();
    const phone = String(record["الهاتف"] ?? record.phone ?? "").trim();
    const city = String(record["المدينة"] ?? record.city ?? "").trim();
    if (!id || !name || !phone) {
      rejected.push({ row, reason: "رقم الحساب والاسم والهاتف حقول مطلوبة" });
      return;
    }
    rows.push({
      id,
      name,
      phone,
      city: city || "غير محدد",
      shipments: Number(record["عدد الشحنات"] ?? record.shipments ?? 0) || 0,
      balance: Number(record["الرصيد"] ?? record.balance ?? 0) || 0,
      updatedAt: "مستورد الآن",
      scope: "pending",
    });
  });

  return { rows, rejected };
}

export function exportAccountsWorkbook(accounts: Account[]) {
  const rows = accounts.map(account => ({
    "رقم الحساب": account.id,
    "اسم الحساب": account.name,
    "الهاتف": account.phone,
    "المدينة": account.city,
    "عدد الشحنات": account.shipments,
    "الرصيد": account.balance,
  }));
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  sheet["!cols"] = [{ wch: 16 }, { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 16 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "الحسابات");
  XLSX.writeFile(workbook, `حسابات-الرفكة-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
