import * as XLSX from "xlsx";
import {
  financeCommandSchema,
  type FinanceCommand,
  type FinanceSnapshot,
} from "@shared/finance";
import type { Account } from "@shared/operations";
import { buildAccountsWorkbook, parseAccountsBuffer } from "./excel";
export type FinanceImportResult = {
  commands: FinanceCommand[];
  accounts: Account[];
  rejected: { sheet: string; row: number; reason: string }[];
  total: number;
  readOnlySheets: string[];
};
const invoiceHeaders = [
  "رقم الفاتورة",
  "حساب العميل",
  "مكتب الإصدار",
  "مكتب الموظف",
  "نوع الرسوم",
  "طريقة الدفع",
  "العملة",
  "الشحنة",
  "المبلغ العام",
  "التصحيح",
  "الإشارة",
  "طريقة المحفظة",
  "اسم الطريقة",
  "مرجع التحصيل",
];
const expenseHeaders = [
  "رقم المصروف",
  "المكتب",
  "التصنيف",
  "المبلغ",
  "العملة",
  "التاريخ",
  "الوصف",
  "الشحنة",
];
const movementHeaders = [
  "رقم الحركة",
  "حساب العميل",
  "المكتب",
  "اتجاه الحركة",
  "المبلغ",
  "العملة",
  "التاريخ",
  "الوصف",
  "طريقة الدفع",
  "طريقة المحفظة",
  "اسم الطريقة",
  "مرجع التحصيل",
];
const goodsHeaders = ["رقم الفاتورة", "رقم البند"];
const openingHeaders = [
  "رقم الرصيد الافتتاحي",
  "المكتب",
  "العملة",
  "الاتجاه",
  "التاريخ",
  "المبلغ",
  "الملاحظة",
];
const shipmentPriceHeaders = [
  "الشحنة",
  "مكتب المصدر",
  "سعر الكيلو",
  "سعر الكيلو MRU",
  "النسخة المتوقعة",
];
function addSheet(
  workbook: XLSX.WorkBook,
  name: string,
  headers: string[],
  rows: unknown[][]
) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map(() => ({ wch: 22 }));
  rows.forEach((row, r) =>
    row.forEach((v, c) => {
      if (typeof v === "string")
        sheet[XLSX.utils.encode_cell({ r: r + 1, c })] = { t: "s", v };
    })
  );
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}
export function buildFinanceWorkbook(
  snapshot: FinanceSnapshot,
  commands: FinanceCommand[],
  accounts: Account[] = []
): XLSX.WorkBook {
  const wb = buildAccountsWorkbook(accounts);
  const invoiceRows: unknown[][] = [],
    expenseRows: unknown[][] = [],
    goodsRows: unknown[][] = [],
    movementRows: unknown[][] = [],
    openingRows: unknown[][] = [],
    shipmentPriceRows: unknown[][] = [];
  for (const c of commands) {
    if (c.kind === "invoice") {
      const p = c.payload;
      invoiceRows.push([
        p.invoiceId,
        p.customerId,
        p.issuingOfficeId,
        p.employeeOfficeId ?? snapshot.homeOffice ?? "",
        p.chargeKind,
        p.paymentMode,
        p.currency,
        p.shipmentId ?? "",
        p.manualAmount ?? "",
        p.adjustment.amount,
        p.adjustment.direction,
        p.payment?.methodId ?? "",
        p.payment?.methodLabel ?? "",
        p.payment?.reference ?? "",
      ]);
      for (const id of p.goodsIds) goodsRows.push([p.invoiceId, id]);
    }
    if (c.kind === "expense") {
      const p = c.payload;
      expenseRows.push([
        p.expenseId,
        p.officeId,
        p.category,
        p.amount,
        p.currency,
        p.date,
        p.description,
        p.shipmentId ?? "",
      ]);
    }
    if (c.kind === "opening_balance") {
      const p = c.payload;
      openingRows.push([
        p.openingId,
        p.officeId,
        p.currency,
        p.direction,
        p.date,
        p.amount,
        p.note,
      ]);
    }
    if (c.kind === "shipment_price") {
      const p = c.payload;
      shipmentPriceRows.push([
        p.shipmentId,
        p.sourceOfficeId,
        p.pricePerKg,
        p.pricePerKgMRU ?? "",
        p.expectedVersion,
      ]);
    }
  }
  for (const command of commands) {
    if (command.kind !== "customer_movement") continue;
    const p = command.payload;
    movementRows.push([
      p.movementId,
      p.customerId,
      p.officeId,
      p.direction,
      p.amount,
      p.currency,
      p.date,
      p.description,
      p.paymentMode,
      p.payment?.methodId ?? "",
      p.payment?.methodLabel ?? "",
      p.payment?.reference ?? "",
    ]);
  }
  addSheet(wb, "مسودات حركات العملاء", movementHeaders, movementRows);
  addSheet(wb, "مسودات الفواتير", invoiceHeaders, invoiceRows);
  addSheet(wb, "مسودات المصروفات", expenseHeaders, expenseRows);
  addSheet(wb, "بنود المسودات", goodsHeaders, goodsRows);
  addSheet(wb, "مسودات الأرصدة الافتتاحية", openingHeaders, openingRows);
  addSheet(wb, "مسودات أسعار الشحنات", shipmentPriceHeaders, shipmentPriceRows);
  addSheet(
    wb,
    "الفواتير المسجلة",
    [
      "رقم الفاتورة",
      "العميل",
      "المكتب المالي",
      "مكتب الإصدار",
      "العملة",
      "الإجمالي",
      "الحالة",
      "المسدد",
      "الموظف",
      "وقت التسجيل",
    ],
    snapshot.invoices.map(i => [
      i.id,
      i.account,
      i.officeId ?? "",
      i.finance?.issuingOfficeId ?? "",
      i.finance?.currency ?? "",
      i.amount,
      i.status,
      i.finance?.paidAmount ?? "",
      i.finance?.actorName ?? "",
      i.finance?.recordedAt ?? i.issuedAt,
    ])
  );
  addSheet(
    wb,
    "القيود المسجلة",
    [
      "رقم القيد",
      "النوع",
      "المكتب",
      "المبلغ",
      "العملة",
      "التاريخ",
      "الوصف",
      "الشحنة",
      "الفاتورة",
      "العميل",
      "الموظف",
      "وقت التسجيل",
    ],
    snapshot.entries.map(e => [
      e.id,
      e.kind,
      e.officeId,
      e.amount,
      e.currency,
      e.date,
      e.description,
      e.shipmentId ?? "",
      e.invoiceId ?? "",
      e.customerId ?? "",
      e.actorName,
      e.recordedAt,
    ])
  );
  addSheet(
    wb,
    "البضائع المسجلة",
    [
      "الفاتورة",
      "الشحنة",
      "البند",
      "الكرتون",
      "الاسم أو الماركة",
      "الهاتف",
      "الوزن",
      "القطع",
    ],
    snapshot.invoices.flatMap(
      i =>
        i.finance?.goods.map(g => [
          i.id,
          i.finance?.shipmentId ?? "",
          g.goodsId,
          g.cartonNumber,
          g.name,
          g.phone,
          g.weight,
          g.pieces,
        ]) ?? []
    )
  );
  addSheet(
    wb,
    "إرشادات",
    ["البيان"],
    [
      [
        "الاستيراد يقبل أوراق المسودات والحسابات الجديدة فقط. الفواتير والقيود المسجلة مرجع للعرض وليست أوامر لإنشاء ديون أو إيرادات جديدة.",
      ],
      [
        "يجب مراجعة المكتب والعملة ومعرف العميل والشحنة ثم حفظ المسودة. لا يحدث تحصيل أو تسجيل مشترك إلا عند المزامنة الصريحة.",
      ],
      [
        "تُحفظ أسعار العملات كما هي ولا يتم تحويلها. إعادة استيراد معرف موجود ترفض بدل استبدال بياناته.",
      ],
      [
        "خيارات الرسوم: shipping أو general. الدفع الجديد: cash أو wallet أو on_account. shipping_fee للتوافق مع مسودات قديمة فقط. التصحيح: increase أو decrease.",
      ],
      [
        "تصنيف المصروف: daily_expense أو monthly_expense أو shipment_cost. المكاتب: nouakchott أو dubai أو china أو turkey.",
      ],
      [
        "حركة العميل: credit للقبض لصالحه أو debit للصرف له، والدفع cash أو wallet. مسودات سداد الدين لا تُستورد من Excel؛ راجع الفاتورة وإصدارها وسجل السداد من التطبيق.",
      ],
    ]
  );
  return wb;
}
export function exportFinanceWorkbook(
  snapshot: FinanceSnapshot,
  commands: FinanceCommand[],
  accounts: Account[] = []
) {
  XLSX.writeFile(
    buildFinanceWorkbook(snapshot, commands, accounts),
    `alrefqaa-finance-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
export function exportFinanceTemplate() {
  exportFinanceWorkbook(
    {
      invoices: [],
      entries: [],
      homeOffice: null,
      offices: null,
      lastReadAt: null,
    },
    []
  );
}
const numeric = (v: unknown) =>
  Number(
    String(v ?? "")
      .trim()
      .replace(/[٠-٩]/g, c => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
      .replace(/[۰-۹]/g, c => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
      .replace(/[٫,]/g, ".")
  );
export function parseFinanceBuffer(
  buffer: ArrayBuffer,
  existing: {
    invoiceIds?: string[];
    expenseIds?: string[];
    movementIds?: string[];
    accountIds?: string[];
    shipmentIds?: string[];
    openingIds?: string[];
    shipmentPriceShipmentIds?: string[];
  } = {}
): FinanceImportResult {
  if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("file_too_large");
  const wb = XLSX.read(buffer, {
    type: "array",
    cellFormula: true,
    sheetRows: 5002,
  });
  const result: FinanceImportResult = {
    commands: [],
    accounts: [],
    rejected: [],
    total: 0,
    readOnlySheets: wb.SheetNames.filter(
      n =>
        ![
          "مسودات الفواتير",
          "مسودات المصروفات",
          "مسودات حركات العملاء",
          "بنود المسودات",
          "مسودات الأرصدة الافتتاحية",
          "مسودات أسعار الشحنات",
          "الحسابات",
        ].includes(n)
    ),
  };
  const seenInvoices = new Set(existing.invoiceIds ?? []),
    seenExpenses = new Set(existing.expenseIds ?? []),
    seenMovements = new Set(existing.movementIds ?? []),
    seenOpenings = new Set(existing.openingIds ?? []),
    seenShipmentPrices = new Set(existing.shipmentPriceShipmentIds ?? []);
  const lines = new Map<string, string[]>();
  const invalidGoodsInvoices = new Set<string>();
  function grid(name: string, headers: string[]): unknown[][] {
    const sheet = wb.Sheets[name];
    if (!sheet) return [];
    if (sheet["!ref"] && XLSX.utils.decode_range(sheet["!ref"]).e.r > 5000)
      throw new Error("too_many_rows");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: true,
    });
    if (!rows.length) return [];
    const h = rows[0].map(v => String(v).trim());
    if (
      headers.some((v, i) => h[i] !== v) ||
      new Set(h.filter(Boolean)).size !== h.filter(Boolean).length
    )
      throw new Error(`invalid_headers:${name}`);
    return rows.slice(1);
  }
  const formulas = (name: string, row: number) => {
    const sheet = wb.Sheets[name];
    if (!sheet?.["!ref"]) return false;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    for (let c = range.s.c; c <= range.e.c; c++)
      if (sheet[XLSX.utils.encode_cell({ r: range.s.r + row - 1, c })]?.f)
        return true;
    return false;
  };
  for (const [index, row] of grid("بنود المسودات", goodsHeaders).entries()) {
    if (row.every(v => String(v ?? "").trim() === "")) continue;
    const invoiceId = String(row[0]).trim(),
      goodsId = String(row[1]).trim();
    if (!invoiceId || !goodsId || formulas("بنود المسودات", index + 2)) {
      if (invoiceId) invalidGoodsInvoices.add(invoiceId);
      result.rejected.push({
        sheet: "بنود المسودات",
        row: index + 2,
        reason: "invalid_goods_row",
      });
      continue;
    }
    const old = lines.get(invoiceId) ?? [];
    old.push(goodsId);
    lines.set(invoiceId, old);
  }
  if (
    wb.Sheets["الحسابات"] &&
    XLSX.utils
      .sheet_to_json<unknown[]>(wb.Sheets["الحسابات"], {
        header: 1,
        defval: "",
      })
      .slice(1)
      .some(row => row.some(v => String(v).trim() !== ""))
  ) {
    const accountWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(accountWb, wb.Sheets["الحسابات"], "الحسابات");
    const imported = parseAccountsBuffer(
      XLSX.write(accountWb, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
      existing.accountIds ?? []
    );
    result.accounts = imported.rows;
    result.total += imported.total;
    result.rejected.push(
      ...imported.rejected.map(r => ({ ...r, sheet: "الحسابات" }))
    );
  }
  const accountIds = new Set([
    ...(existing.accountIds ?? []),
    ...result.accounts.map(a => a.id),
  ]);
  const accept = (
    name: string,
    headers: string[],
    kind: "invoice" | "expense" | "customer_movement"
  ) => {
    for (const [index, row] of grid(name, headers).entries()) {
      if (row.every(v => String(v ?? "").trim() === "")) continue;
      result.total++;
      const s = (i: number) => String(row[i] ?? "").trim();
      if (formulas(name, index + 2)) {
        result.rejected.push({
          sheet: name,
          row: index + 2,
          reason: "formulas_not_allowed",
        });
        continue;
      }
      const payload =
        kind === "invoice"
          ? {
              invoiceId: s(0),
              customerId: s(1),
              issuingOfficeId: s(2),
              ...(s(3) ? { employeeOfficeId: s(3) } : {}),
              chargeKind: s(4),
              paymentMode: s(5),
              currency: s(6),
              ...(s(7) ? { shipmentId: s(7) } : {}),
              goodsIds: lines.get(s(0)) ?? [],
              ...(s(8) ? { manualAmount: numeric(row[8]) } : {}),
              adjustment: { amount: numeric(row[9]), direction: s(10) },
              ...(s(11)
                ? {
                    payment: {
                      office: "nouakchott",
                      methodId: s(11),
                      methodLabel: s(12),
                      ...(s(13) ? { reference: s(13) } : {}),
                    },
                  }
                : {}),
            }
          : kind === "customer_movement"
            ? {
                movementId: s(0),
                customerId: s(1),
                officeId: s(2),
                direction: s(3),
                amount: numeric(row[4]),
                currency: s(5),
                date: s(6),
                description: s(7),
                paymentMode: s(8),
                ...(s(9)
                  ? {
                      payment: {
                        office: "nouakchott",
                        methodId: s(9),
                        methodLabel: s(10),
                        ...(s(11) ? { reference: s(11) } : {}),
                      },
                    }
                  : {}),
              }
            : {
                expenseId: s(0),
                officeId: s(1),
                category: s(2),
                amount: numeric(row[3]),
                currency: s(4),
                date: s(5),
                description: s(6),
                ...(s(7) ? { shipmentId: s(7) } : {}),
              };
      const command = financeCommandSchema.safeParse({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        kind,
        payload,
      });
      const recordId = s(0),
        seen =
          kind === "invoice"
            ? seenInvoices
            : kind === "expense"
              ? seenExpenses
              : seenMovements;
      let reason = "";
      if (!command.success)
        reason = command.error.issues[0]?.message ?? "invalid_row";
      else if (seen.has(recordId)) reason = "duplicate_record";
      else if (kind === "invoice" && invalidGoodsInvoices.has(recordId))
        reason = "invalid_goods_row";
      else if (
        kind !== "expense" &&
        existing.accountIds &&
        !accountIds.has(s(1))
      )
        reason = "customer_unavailable";
      else if (
        kind !== "customer_movement" &&
        existing.shipmentIds &&
        s(7) &&
        !existing.shipmentIds.includes(s(7))
      )
        reason = "shipment_unavailable";
      if (reason) {
        result.rejected.push({ sheet: name, row: index + 2, reason });
        continue;
      }
      if (command.success) {
        seen.add(recordId);
        result.commands.push(command.data);
      }
    }
  };
  accept("مسودات الفواتير", invoiceHeaders, "invoice");
  accept("مسودات المصروفات", expenseHeaders, "expense");
  accept("مسودات حركات العملاء", movementHeaders, "customer_movement");
  const acceptOpening = () => {
    for (const [index, row] of grid(
      "مسودات الأرصدة الافتتاحية",
      openingHeaders
    ).entries()) {
      if (row.every(v => String(v ?? "").trim() === "")) continue;
      result.total++;
      const s = (i: number) => String(row[i] ?? "").trim();
      if (formulas("مسودات الأرصدة الافتتاحية", index + 2)) {
        result.rejected.push({
          sheet: "مسودات الأرصدة الافتتاحية",
          row: index + 2,
          reason: "formulas_not_allowed",
        });
        continue;
      }
      const parsed = financeCommandSchema.safeParse({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        kind: "opening_balance",
        payload: {
          openingId: s(0),
          officeId: s(1),
          currency: s(2),
          direction: s(3),
          date: s(4),
          amount: numeric(row[5]),
          note: s(6),
        },
      });
      const id = s(0);
      const reason = !parsed.success
        ? (parsed.error.issues[0]?.message ?? "invalid_row")
        : seenOpenings.has(id)
          ? "duplicate_record"
          : "";
      if (reason)
        result.rejected.push({
          sheet: "مسودات الأرصدة الافتتاحية",
          row: index + 2,
          reason,
        });
      else if (parsed.success) {
        seenOpenings.add(id);
        result.commands.push(parsed.data);
      }
    }
  };
  const acceptShipmentPrice = () => {
    for (const [index, row] of grid(
      "مسودات أسعار الشحنات",
      shipmentPriceHeaders
    ).entries()) {
      if (row.every(v => String(v ?? "").trim() === "")) continue;
      result.total++;
      const s = (i: number) => String(row[i] ?? "").trim();
      if (formulas("مسودات أسعار الشحنات", index + 2)) {
        result.rejected.push({
          sheet: "مسودات أسعار الشحنات",
          row: index + 2,
          reason: "formulas_not_allowed",
        });
        continue;
      }
      const parsed = financeCommandSchema.safeParse({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        kind: "shipment_price",
        payload: {
          shipmentId: s(0),
          sourceOfficeId: s(1),
          pricePerKg: numeric(row[2]),
          ...(s(3) ? { pricePerKgMRU: numeric(row[3]) } : {}),
          expectedVersion: Number(row[4]),
        },
      });
      const id = s(0);
      const reason = !parsed.success
        ? (parsed.error.issues[0]?.message ?? "invalid_row")
        : seenShipmentPrices.has(id)
          ? "duplicate_record"
          : "";
      if (reason)
        result.rejected.push({
          sheet: "مسودات أسعار الشحنات",
          row: index + 2,
          reason,
        });
      else if (parsed.success) {
        seenShipmentPrices.add(id);
        result.commands.push(parsed.data);
      }
    }
  };
  acceptOpening();
  acceptShipmentPrice();
  if (
    !wb.SheetNames.some(n =>
      [
        "مسودات الفواتير",
        "مسودات المصروفات",
        "مسودات حركات العملاء",
        "مسودات الأرصدة الافتتاحية",
        "مسودات أسعار الشحنات",
        "الحسابات",
      ].includes(n)
    )
  )
    throw new Error("draft_sheets_required");
  return result;
}
export async function parseFinanceWorkbook(
  file: File,
  existing: Parameters<typeof parseFinanceBuffer>[1] = {}
) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("xlsx_required");
  if (file.size > 5 * 1024 * 1024) throw new Error("file_too_large");
  return parseFinanceBuffer(await file.arrayBuffer(), existing);
}
