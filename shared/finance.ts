import { z } from "zod";
import { officeIdSchema, type OfficeId, type OfficeMember } from "./branches";
import { goodsTotals, normalizeName, sourceCurrency } from "./packing";
import { invoicePaymentSchema } from "./office";
import type { AppRole, Invoice, Shipment } from "./operations";
import {
  canReadAnyFinance,
  permissionAllowed,
  permissionsFor,
  type PermissionKey,
  type PermissionMap,
  type PermissionLevel,
  type PermissionSubject,
} from "./permissions";

export const financeCurrencies = [
  "MRU",
  "AED",
  "TRY",
  "CNY",
  "USD",
  "EUR",
] as const;
export type FinanceCurrency = (typeof financeCurrencies)[number];
export const currencySchema = z.enum(financeCurrencies);
export const financeMoneySchema = z
  .number()
  .finite()
  .nonnegative()
  .max(999999999)
  .refine(
    n => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001,
    "invalid_money"
  );
const id = z.string().trim().min(1).max(128);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(s => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "invalid_date");
export const adjustmentSchema = z
  .object({
    direction: z.enum(["increase", "decrease"]),
    amount: financeMoneySchema,
  })
  .strict();
export type InvoiceAdjustment = z.infer<typeof adjustmentSchema>;
export const paymentModes = [
  "on_account",
  "shipping_fee",
  "cash",
  "wallet",
] as const;
// Historical records retain shipping_fee; new invoice screens expose these three choices only.
export const invoicePaymentChoices = ["cash", "wallet", "on_account"] as const;
export const invoiceGoodsSchema = z
  .object({
    goodsId: id,
    cartonNumber: z.number().int().positive(),
    name: z.string().min(1).max(240),
    phone: z.string().max(64),
    weight: z.number().finite().nonnegative(),
    pieces: z.number().int().nonnegative(),
  })
  .strict();
export type InvoiceGoods = z.infer<typeof invoiceGoodsSchema>;
export const financialInvoiceSchema = z
  .object({
    customerId: id,
    chargeKind: z.enum(["shipping", "general"]),
    paymentMode: z.enum(paymentModes),
    issuingOfficeId: officeIdSchema,
    financialOfficeId: officeIdSchema,
    actorId: z.number().int().positive(),
    actorName: z.string().max(320),
    recordedAt: z.string().datetime(),
    currency: currencySchema,
    shipmentId: id.optional(),
    goods: z.array(invoiceGoodsSchema).max(500),
    baseAmount: financeMoneySchema,
    adjustment: adjustmentSchema,
    paidAmount: financeMoneySchema,
  })
  .strict()
  .superRefine((v, c) => {
    if (v.chargeKind === "shipping" && (!v.shipmentId || !v.goods.length))
      c.addIssue({ code: "custom", message: "goods_required" });
    if (new Set(v.goods.map(g => g.goodsId)).size !== v.goods.length)
      c.addIssue({ code: "custom", message: "duplicate_goods" });
    try {
      if (v.paidAmount > adjustedInvoiceTotal(v.baseAmount, v.adjustment))
        c.addIssue({ code: "custom", message: "overpayment" });
    } catch {
      c.addIssue({ code: "custom", message: "invalid_invoice_total" });
    }
  });
export type FinancialInvoiceDetails = z.infer<typeof financialInvoiceSchema>;
export const invoiceInputSchema = z
  .object({
    invoiceId: z.string().trim().min(1).max(64),
    customerId: id,
    issuingOfficeId: officeIdSchema,
    employeeOfficeId: officeIdSchema.optional(),
    chargeKind: z.enum(["shipping", "general"]),
    paymentMode: z.enum(paymentModes),
    currency: currencySchema,
    shipmentId: id.optional(),
    goodsIds: z.array(id).max(500),
    manualAmount: financeMoneySchema.optional(),
    adjustment: adjustmentSchema,
    payment: invoicePaymentSchema.optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.paymentMode === "shipping_fee" && v.chargeKind !== "shipping")
      c.addIssue({ code: "custom", message: "shipping_fee_requires_goods" });
    if (v.chargeKind === "shipping" && (!v.shipmentId || !v.goodsIds.length))
      c.addIssue({ code: "custom", message: "goods_required" });
    if (
      v.chargeKind === "general" &&
      (v.manualAmount === undefined || v.goodsIds.length || v.shipmentId)
    )
      c.addIssue({ code: "custom", message: "invalid_general_invoice" });
    if (new Set(v.goodsIds).size !== v.goodsIds.length)
      c.addIssue({ code: "custom", message: "duplicate_goods" });
    if (v.paymentMode === "wallet" && !v.payment)
      c.addIssue({ code: "custom", message: "wallet_required" });
  });
export type FinanceInvoiceInput = z.infer<typeof invoiceInputSchema>;
/** Retain old snapshots/drafts, but never post shipping_fee as a new payment method. */
export const newInvoiceInputSchema = invoiceInputSchema.refine(
  value => invoicePaymentChoices.some(choice => choice === value.paymentMode),
  "payment_mode_legacy_requires_review"
);
export const expenseInputSchema = z
  .object({
    expenseId: z.string().trim().min(1).max(64),
    officeId: officeIdSchema,
    category: z.enum(["daily_expense", "monthly_expense", "shipment_cost"]),
    amount: financeMoneySchema,
    currency: currencySchema,
    date: dateSchema,
    description: z.string().trim().min(1).max(500),
    shipmentId: id.optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.category === "shipment_cost" && !v.shipmentId)
      c.addIssue({ code: "custom", message: "shipment_required" });
    if (v.category !== "shipment_cost" && v.shipmentId)
      c.addIssue({ code: "custom", message: "unexpected_shipment" });
  });
export type FinanceExpenseInput = z.infer<typeof expenseInputSchema>;
export const openingBalanceDirections = ["debit", "credit"] as const;
export const openingBalanceDirectionSchema = z.enum(openingBalanceDirections);
export const openingBalanceInputSchema = z
  .object({
    openingId: id,
    officeId: officeIdSchema,
    currency: currencySchema,
    amount: financeMoneySchema.refine(n => n > 0, "opening_amount_required"),
    direction: openingBalanceDirectionSchema,
    date: dateSchema,
    note: z.string().trim().min(1).max(500),
  })
  .strict();
export type FinanceOpeningBalanceInput = z.infer<
  typeof openingBalanceInputSchema
>;
export const shipmentPriceInputSchema = z
  .object({
    shipmentId: id,
    sourceOfficeId: officeIdSchema,
    pricePerKg: financeMoneySchema,
    pricePerKgMRU: financeMoneySchema.optional(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export type FinanceShipmentPriceInput = z.infer<
  typeof shipmentPriceInputSchema
>;
export const settlementInputSchema = z
  .object({
    invoiceId: id,
    expectedVersion: z.number().int().positive(),
    amount: financeMoneySchema.refine(n => n > 0, "payment_required"),
    payment: invoicePaymentSchema.optional(),
    description: z.string().trim().max(500),
  })
  .strict();
export type FinanceSettlementInput = z.infer<typeof settlementInputSchema>;
export const customerMovementInputSchema = z
  .object({
    movementId: z.string().trim().min(1).max(64),
    customerId: id,
    officeId: officeIdSchema,
    direction: z.enum(["credit", "debit"]),
    amount: financeMoneySchema.refine(n => n > 0, "payment_required"),
    currency: currencySchema,
    date: dateSchema,
    description: z.string().trim().min(1).max(500),
    paymentMode: z.enum(["cash", "wallet"]),
    payment: invoicePaymentSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.paymentMode === "wallet" && !value.payment)
      context.addIssue({ code: "custom", message: "wallet_required" });
    if (value.paymentMode === "cash" && value.payment)
      context.addIssue({ code: "custom", message: "unexpected_wallet" });
  });
export type CustomerMovementInput = z.infer<typeof customerMovementInputSchema>;
const commandMeta = { id, createdAt: z.string().datetime() };
export const financeCommandSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...commandMeta,
      kind: z.literal("invoice"),
      payload: invoiceInputSchema,
    })
    .strict(),
  z
    .object({
      ...commandMeta,
      kind: z.literal("expense"),
      payload: expenseInputSchema,
    })
    .strict(),
  z
    .object({
      ...commandMeta,
      kind: z.literal("settlement"),
      payload: settlementInputSchema,
    })
    .strict(),
  z
    .object({
      ...commandMeta,
      kind: z.literal("customer_movement"),
      payload: customerMovementInputSchema,
    })
    .strict(),
  z
    .object({
      ...commandMeta,
      kind: z.literal("opening_balance"),
      payload: openingBalanceInputSchema,
    })
    .strict(),
  z
    .object({
      ...commandMeta,
      kind: z.literal("shipment_price"),
      payload: shipmentPriceInputSchema,
    })
    .strict(),
]);
export type FinanceCommand = z.infer<typeof financeCommandSchema>;
export type FinanceMutationCommand = FinanceCommand;
export const financeEntryKinds = [
  "daily_expense",
  "monthly_expense",
  "shipment_cost",
  "shipment_revenue",
  "invoice_revenue",
  "customer_debt",
  "debt_payment",
  "collection",
  "customer_credit",
  "customer_debit",
  "opening_balance",
] as const;
export const financeEntrySchema = z
  .object({
    id,
    kind: z.enum(financeEntryKinds),
    officeId: officeIdSchema,
    amount: financeMoneySchema,
    currency: currencySchema,
    date: dateSchema,
    description: z.string().max(500),
    actorId: z.number().int().positive(),
    actorName: z.string().max(320),
    recordedAt: z.string().datetime(),
    direction: openingBalanceDirectionSchema.optional(),
    invoiceId: id.optional(),
    shipmentId: id.optional(),
    customerId: id.optional(),
    customerName: z.string().max(240).optional(),
    payment: invoicePaymentSchema.optional(),
  })
  .strict();
export type FinanceEntry = z.infer<typeof financeEntrySchema>;
export const financialInvoiceRecordSchema = z
  .object({
    id,
    account: z.string().max(240),
    amount: financeMoneySchema,
    status: z.enum(["مدفوعة", "بانتظار الدفع", "دين"]),
    issuedAt: z.string().max(80),
    officeId: officeIdSchema.optional(),
    payment: invoicePaymentSchema.optional(),
    finance: financialInvoiceSchema.optional(),
    scope: z.enum(["local", "pending", "shared"]).optional(),
    version: z.number().int().nonnegative().optional(),
  })
  .strict();
export const financeSnapshotSchema = z
  .object({
    invoices: z.array(financialInvoiceRecordSchema),
    entries: z.array(financeEntrySchema),
    homeOffice: officeIdSchema.nullable(),
    offices: z.array(officeIdSchema).nullable(),
    lastReadAt: z.string().datetime().nullable(),
    receivables: z
      .array(
        z
          .object({
            officeId: officeIdSchema,
            currency: currencySchema,
            total: financeMoneySchema,
            soldTotal: financeMoneySchema.optional(),
            remainingTotal: financeMoneySchema.optional(),
            unpricedShipments: z.number().int().nonnegative().optional(),
            shipments: z.array(
              z
                .object({
                  shipmentId: id,
                  tracking: z.string().trim().min(1).max(240),
                  amount: financeMoneySchema,
                  soldAmount: financeMoneySchema.optional(),
                  remainingAmount: financeMoneySchema.optional(),
                  pricingStatus: z.enum(["priced", "unpriced"]).optional(),
                })
                .strict()
            ),
          })
          .strict()
      )
      .optional()
      .default([]),
    // shipmentReceivables is the explicit public name used by the finance UI.
    // Keep the older receivables key optional so previously cached snapshots remain valid.
    shipmentReceivables: z
      .array(
        z
          .object({
            officeId: officeIdSchema,
            currency: currencySchema,
            total: financeMoneySchema,
            soldTotal: financeMoneySchema.optional(),
            remainingTotal: financeMoneySchema.optional(),
            unpricedShipments: z.number().int().nonnegative().optional(),
            shipments: z.array(
              z
                .object({
                  shipmentId: id,
                  tracking: z.string().trim().min(1).max(240),
                  amount: financeMoneySchema,
                  soldAmount: financeMoneySchema.optional(),
                  remainingAmount: financeMoneySchema.optional(),
                  pricingStatus: z.enum(["priced", "unpriced"]).optional(),
                })
                .strict()
            ),
          })
          .strict()
      )
      .optional()
      .default([]),
  })
  .strict();
export type FinanceSnapshot = {
  invoices: Invoice[];
  entries: FinanceEntry[];
  homeOffice: OfficeId | null;
  offices: OfficeId[] | null;
  lastReadAt: string | null;
  receivables?: FinanceReceivable[];
  shipmentReceivables?: FinanceReceivable[];
};
export type FinanceReceivableShipment = {
  shipmentId: string;
  tracking: string;
  amount: number;
  soldAmount?: number;
  remainingAmount?: number;
  pricingStatus?: "priced" | "unpriced";
};
export type FinanceReceivable = {
  officeId: OfficeId;
  currency: FinanceCurrency;
  total: number;
  shipments: FinanceReceivableShipment[];
  soldTotal?: number;
  remainingTotal?: number;
  unpricedShipments?: number;
};
export type FinanceSyncResult = {
  applied: Array<{
    commandId: string;
    invoice?: Invoice;
    entries: FinanceEntry[];
  }>;
  conflicts: Array<{ commandId: string; code: string }>;
};
export const financeSyncInputSchema = z
  .object({
    commands: z.array(financeCommandSchema).max(100),
    clientUserId: z.string().min(1).max(128).optional(),
  })
  .strict();
export function emptyFinanceSnapshot(): FinanceSnapshot {
  return {
    invoices: [],
    entries: [],
    homeOffice: null,
    offices: null,
    lastReadAt: null,
    receivables: [],
    shipmentReceivables: [],
  };
}
export type FinancePermissionScope = PermissionSubject & {
  role: AppRole | null;
  offices: OfficeId[] | null;
  homeOffice?: OfficeId | null;
  permissions?: PermissionMap | null;
};

/** A role-only call remains supported for legacy consumers; scoped calls use the matrix. */
export function canUseFinance(
  subject: AppRole | FinancePermissionScope | null
) {
  if (typeof subject === "string" || subject === null)
    return (
      subject === "admin" ||
      subject === "accountant" ||
      subject === "office_manager"
    );
  return canReadAnyFinance(subject);
}
export function canReadFinance(
  subject: AppRole | FinancePermissionScope | null
) {
  return canUseFinance(subject);
}
export function canWriteFinance(scope: FinancePermissionScope) {
  if (!scope.role || !scope.offices) return scope.role === "admin";
  const permissions = permissionsFor(scope);
  const hasManage = (Object.keys(permissions) as PermissionKey[]).some(
    key =>
      permissionAllowed(scope, key, "manage") &&
      [
        "customers",
        "invoices",
        "payments",
        "expenses",
        "opening_balance",
        "shipment_prices",
        "finance_reports",
        "excel",
        "office_wallets",
      ].includes(key)
  );
  if (!hasManage) return false;
  if (scope.role === "admin") return true;
  const home =
    scope.homeOffice ?? (scope.offices.length === 1 ? scope.offices[0] : null);
  return Boolean(
    home && scope.offices.length === 1 && scope.offices[0] === home
  );
}
export function financePermissionForCommand(
  kind:
    | "invoice"
    | "expense"
    | "settlement"
    | "customer_movement"
    | "opening_balance"
    | "shipment_price"
): PermissionKey {
  if (kind === "invoice") return "invoices";
  if (kind === "expense") return "expenses";
  if (kind === "opening_balance") return "opening_balance";
  if (kind === "shipment_price") return "shipment_prices";
  return "payments";
}
export function financePermissionForEntry(
  kind: FinanceEntry["kind"]
): PermissionKey {
  if (["daily_expense", "monthly_expense", "shipment_cost"].includes(kind))
    return "expenses";
  if (kind === "opening_balance") return "opening_balance";
  if (kind === "shipment_revenue") return "shipment_prices";
  if (kind === "invoice_revenue") return "invoices";
  return "payments";
}
export function financeCan(
  scope: FinancePermissionScope,
  key: PermissionKey,
  level: PermissionLevel = "view"
) {
  return permissionAllowed(scope, key, level);
}
export function employeeFinanceOffice(
  scope: FinancePermissionScope,
  requested?: OfficeId
): OfficeId {
  if (
    ["accountant", "general_accountant", "cashier", "office_manager"].includes(
      scope.role ?? ""
    ) &&
    !scope.offices?.length
  )
    throw new Error("employee_office_required");
  if (!canReadAnyFinance(scope)) throw new Error("finance_forbidden");
  if (scope.role !== "admin" && (!scope.offices || scope.offices.length !== 1))
    throw new Error("finance_forbidden");
  const home =
    scope.homeOffice ?? (scope.offices?.length === 1 ? scope.offices[0] : null);
  if (home && scope.offices !== null && !scope.offices.includes(home))
    throw new Error("finance_forbidden");
  if (home && requested && requested !== home)
    throw new Error("financial_office_mismatch");
  const result = home ?? requested;
  if (!result) throw new Error("employee_office_required");
  if (scope.offices !== null && !scope.offices.includes(result))
    throw new Error("finance_forbidden");
  return result;
}
export function adjustedInvoiceTotal(
  baseAmount: number,
  adjustment: InvoiceAdjustment
): number {
  financeMoneySchema.parse(baseAmount);
  adjustmentSchema.parse(adjustment);
  const base = Math.round(baseAmount * 100),
    correction = Math.round(adjustment.amount * 100);
  const total =
    base + (adjustment.direction === "increase" ? correction : -correction);
  if (!Number.isSafeInteger(total) || total < 0 || total > 99999999900)
    throw new Error("invalid_invoice_total");
  return total / 100;
}
export function calculateFinanceInvoice(
  input: FinanceInvoiceInput,
  shipment?: Shipment
) {
  invoiceInputSchema.parse(input);
  let baseAmount = input.manualAmount ?? 0;
  const goods: InvoiceGoods[] = [];
  if (input.chargeKind === "shipping") {
    if (
      !shipment?.packing ||
      shipment.deleted ||
      shipment.id !== input.shipmentId
    )
      throw new Error("shipment_unavailable");
    const chosen = new Set(input.goodsIds);
    const selected = shipment.packing.cartons.flatMap(carton =>
      carton.goods
        .filter(g => chosen.has(g.id) && !g.deleted)
        .map(g => {
          const totals = goodsTotals([g]);
          goods.push({
            goodsId: g.id,
            cartonNumber: carton.number,
            name: g.name,
            phone: g.phone,
            weight: totals.weight,
            pieces: totals.pieces,
          });
          return g;
        })
    );
    if (selected.length !== input.goodsIds.length)
      throw new Error("goods_unavailable");
    const currency = input.currency;
    const rate =
      currency === "MRU"
        ? shipment.packing.pricePerKgMRU
        : sourceCurrency[shipment.packing.source] === currency
          ? shipment.packing.pricePerKg
          : undefined;
    if (rate === undefined) throw new Error("shipping_rate_missing");
    baseAmount = goodsTotals(selected, rate).amount;
  }
  return {
    baseAmount,
    totalAmount: adjustedInvoiceTotal(baseAmount, input.adjustment),
    goods,
    weight:
      goods.reduce((sum, g) => sum + Math.round(g.weight * 1000), 0) / 1000,
    currency: input.currency,
  };
}
export type InvoiceGoodsChoice = InvoiceGoods & {
  shipmentId: string;
  tracking: string;
  officeId?: OfficeId;
};
export function searchableInvoiceGoods(
  shipments: readonly Shipment[],
  query = ""
): InvoiceGoodsChoice[] {
  const normalized = normalizeName(query).replace(",", ".");
  return shipments
    .filter(s => s.packing && !s.deleted)
    .flatMap(s =>
      s.packing!.cartons.flatMap(carton =>
        carton.goods
          .filter(g => !g.deleted)
          .map(g => {
            const totals = goodsTotals([g]);
            return {
              goodsId: g.id,
              cartonNumber: carton.number,
              name: g.name,
              phone: g.phone,
              weight: totals.weight,
              pieces: totals.pieces,
              shipmentId: s.id,
              tracking: s.tracking,
              officeId: s.officeId,
            };
          })
      )
    )
    .filter(
      g =>
        !normalized ||
        normalizeName(g.name).includes(normalized) ||
        String(g.weight).includes(normalized)
    );
}
export function isShipmentSent(shipment: Shipment): boolean {
  return (
    !shipment.deleted &&
    (shipment.status === "في الطريق" ||
      shipment.status === "وصلت للمكتب" ||
      shipment.status === "جاهزة للتسليم" ||
      shipment.status === "مسلّمة" ||
      Boolean(shipment.journey && shipment.journey.stage !== "preparing"))
  );
}
export function sourceReceivable(
  shipments: readonly Shipment[],
  allowedOffices: readonly OfficeId[] | null = null,
  invoices: readonly Invoice[] = []
): FinanceReceivable[] {
  const grouped = new Map<string, FinanceReceivable>();
  for (const shipment of shipments) {
    if (!isShipmentSent(shipment) || !shipment.packing) continue;
    const officeId = shipment.packing.source as OfficeId;
    if (allowedOffices && !allowedOffices.includes(officeId)) continue;
    const currency = sourceCurrency[shipment.packing.source] as FinanceCurrency;
    const sourceGoods = shipment.packing.cartons
      .flatMap(carton => carton.goods)
      .filter(g => !g.deleted);
    const amount = goodsTotals(sourceGoods, shipment.packing.pricePerKg).amount;
    const soldGoodsIds = new Set<string>();
    for (const invoice of invoices) {
      const finance = invoice.finance;
      if (
        finance?.chargeKind !== "shipping" ||
        finance.shipmentId !== shipment.id ||
        finance.financialOfficeId !== officeId ||
        finance.currency !== currency
      )
        continue;
      for (const good of finance.goods) soldGoodsIds.add(good.goodsId);
    }
    const soldAmount = goodsTotals(
      sourceGoods.filter(g => soldGoodsIds.has(g.id)),
      shipment.packing.pricePerKg
    ).amount;
    const remainingAmount = Math.round((amount - soldAmount) * 100) / 100;
    const pricingStatus =
      shipment.packing.pricePerKg > 0 ? "priced" : "unpriced";
    const key = `${officeId}:${currency}`;
    const row = grouped.get(key) ?? {
      officeId,
      currency,
      total: 0,
      shipments: [],
      soldTotal: 0,
      remainingTotal: 0,
      unpricedShipments: 0,
    };
    row.total = (Math.round(row.total * 100) + Math.round(amount * 100)) / 100;
    row.soldTotal =
      (Math.round((row.soldTotal ?? 0) * 100) + Math.round(soldAmount * 100)) /
      100;
    row.remainingTotal =
      (Math.round((row.remainingTotal ?? 0) * 100) +
        Math.round(remainingAmount * 100)) /
      100;
    if (pricingStatus === "unpriced")
      row.unpricedShipments = (row.unpricedShipments ?? 0) + 1;
    row.shipments.push({
      shipmentId: shipment.id,
      tracking: shipment.tracking,
      amount,
      soldAmount,
      remainingAmount,
      pricingStatus,
    });
    grouped.set(key, row);
  }
  return [...grouped.values()].map(row => ({
    ...row,
    shipments: [...row.shipments].sort((a, b) =>
      a.tracking.localeCompare(b.tracking)
    ),
  }));
}

/** Backwards-compatible name retained for callers and cached snapshots. */
export function deriveShipmentReceivables(
  shipments: readonly Shipment[],
  allowedOffices: readonly OfficeId[] | null = null,
  invoices: readonly Invoice[] = []
): FinanceReceivable[] {
  return sourceReceivable(shipments, allowedOffices, invoices);
}
export type OfficeFinanceSummary = {
  officeId: OfficeId;
  currency: FinanceCurrency;
  shipmentRevenue: number;
  invoiceRevenue: number;
  revenue: number;
  shipmentCosts: number;
  dailyExpenses: number;
  monthlyExpenses: number;
  expenses: number;
  net: number;
  debts: number;
  collections: number;
  openingBalance: number;
};
export function summarizeOfficeFinance(
  entries: readonly FinanceEntry[]
): OfficeFinanceSummary[] {
  const map = new Map<string, OfficeFinanceSummary>();
  for (const e of entries) {
    const key = `${e.officeId}:${e.currency}`;
    const row = map.get(key) ?? {
      officeId: e.officeId,
      currency: e.currency,
      shipmentRevenue: 0,
      invoiceRevenue: 0,
      revenue: 0,
      shipmentCosts: 0,
      dailyExpenses: 0,
      monthlyExpenses: 0,
      expenses: 0,
      net: 0,
      debts: 0,
      collections: 0,
      openingBalance: 0,
    };
    const add = (a: number, b: number) => {
      const cents = Math.round(a * 100) + Math.round(b * 100);
      if (!Number.isSafeInteger(cents)) throw new Error("totals_too_large");
      return cents / 100;
    };
    if (e.kind === "shipment_revenue")
      row.shipmentRevenue = add(row.shipmentRevenue, e.amount);
    if (e.kind === "invoice_revenue")
      row.invoiceRevenue = add(row.invoiceRevenue, e.amount);
    if (e.kind === "shipment_cost")
      row.shipmentCosts = add(row.shipmentCosts, e.amount);
    if (e.kind === "daily_expense")
      row.dailyExpenses = add(row.dailyExpenses, e.amount);
    if (e.kind === "monthly_expense")
      row.monthlyExpenses = add(row.monthlyExpenses, e.amount);
    if (e.kind === "customer_debt") row.debts = add(row.debts, e.amount);
    if (e.kind === "debt_payment") row.debts = add(row.debts, -e.amount);
    if (e.kind === "collection" || e.kind === "debt_payment")
      row.collections = add(row.collections, e.amount);
    if (e.kind === "customer_credit")
      row.collections = add(row.collections, e.amount);
    if (e.kind === "customer_debit")
      row.collections = add(row.collections, -e.amount);
    if (e.kind === "opening_balance")
      row.openingBalance = add(
        row.openingBalance,
        e.direction === "debit" ? -e.amount : e.amount
      );
    row.revenue = add(row.shipmentRevenue, row.invoiceRevenue);
    row.expenses = add(
      add(row.shipmentCosts, row.dailyExpenses),
      row.monthlyExpenses
    );
    row.net = add(row.revenue, -row.expenses);
    map.set(key, row);
  }
  return [...map.values()];
}
export function summarizeCustomerDebts(entries: readonly FinanceEntry[]) {
  const map = new Map<
    string,
    {
      customerId: string;
      customerName: string;
      officeId: OfficeId;
      currency: FinanceCurrency;
      charged: number;
      paid: number;
      outstanding: number;
    }
  >();
  for (const e of entries)
    if (
      e.customerId &&
      (e.kind === "customer_debt" || e.kind === "debt_payment")
    ) {
      const key = `${e.officeId}:${e.currency}:${e.customerId}`;
      const row = map.get(key) ?? {
        customerId: e.customerId,
        customerName: e.customerName ?? e.customerId,
        officeId: e.officeId,
        currency: e.currency,
        charged: 0,
        paid: 0,
        outstanding: 0,
      };
      const field = e.kind === "customer_debt" ? "charged" : "paid";
      row[field] =
        (Math.round(row[field] * 100) + Math.round(e.amount * 100)) / 100;
      row.outstanding =
        (Math.round(row.charged * 100) - Math.round(row.paid * 100)) / 100;
      map.set(key, row);
    }
  return [...map.values()];
}
