import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  defaultOfficeSettings,
  invoicePaymentSchema,
  officePaymentSettingsSchema,
  officeSettingsSchema,
  type InvoicePayment,
  type OfficeSettings,
  type PaymentMethod,
} from "@shared/office";
import { officeIdSchema, type OfficeId } from "@shared/branches";
import {
  officePaymentSettings,
  officeSettings,
  users,
  walletMovements,
} from "../drizzle/schema";
import type { Invoice } from "@shared/operations";
import { permissionAllowed } from "@shared/permissions";
import { readOfficeScope, type OfficeScope } from "./branches";
import { appendAudit } from "./audit";
import { getDb } from "./db";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const accountNumberPattern = /^\+?[0-9][0-9 -]*$/;

export type PublicPaymentMethod = {
  id: string;
  label: string;
  instructions?: string;
  accountNumber?: string;
  accountName?: string;
};

export type PublicOfficeSettings = {
  office: OfficeId;
  methods: PublicPaymentMethod[];
};

export const officeUpdateSchema = officeSettingsSchema.safeExtend({
  expectedVersion: z.number().int().nonnegative(),
});

export const officePaymentUpdateSchema = z
  .object({
    officeId: officeIdSchema,
    methods: z.array(z.any()).min(1).max(50),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const parsed = officePaymentSettingsSchema.safeParse({
      officeId: value.officeId,
      methods: value.methods,
      version: value.expectedVersion,
    });
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
  });

function normalizedMethod(method: PaymentMethod) {
  return {
    id: method.id,
    label: method.label.trim(),
    enabled: method.enabled,
    accountNumber: method.accountNumber?.trim() || undefined,
    accountName: method.accountName?.trim() || undefined,
    instructions: method.instructions?.trim() || undefined,
    showToCustomers: method.showToCustomers === true,
  };
}

/** Compare the persisted payload semantically so a lost response can be retried safely. */
export function sameOfficeMethods(
  left: PaymentMethod[],
  right: PaymentMethod[]
): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(
    right.map(method => [method.id, normalizedMethod(method)])
  );
  return left.every(method => {
    const other = rightById.get(method.id);
    return Boolean(
      other &&
        JSON.stringify(normalizedMethod(method)) === JSON.stringify(other)
    );
  });
}

export type OfficeExecutor = { select: (...args: any[]) => any };

/**
 * Nouakchott keeps its historical singleton. Source offices read only their
 * additive per-office row and otherwise receive a cash-only default.
 */
export async function readOfficeSettings(
  db: OfficeExecutor,
  officeId: OfficeId = "nouakchott"
): Promise<OfficeSettings> {
  if (officeId === "nouakchott") {
    const rows = await db
      .select()
      .from(officeSettings)
      .where(eq(officeSettings.id, 1))
      .limit(1);
    const row = rows[0];
    if (!row) return defaultOfficeSettings("nouakchott");
    return settingsWithVersion(row);
  }
  const rows = await db
    .select()
    .from(officePaymentSettings)
    .where(eq(officePaymentSettings.officeId, officeId))
    .limit(1);
  const row = rows[0];
  if (!row) return defaultOfficeSettings(officeId);
  const parsed = officePaymentSettingsSchema.parse({
    officeId: row.officeId,
    methods: row.methods,
    version: row.version,
  });
  return {
    office: parsed.officeId,
    methods: parsed.methods,
    version: parsed.version,
  };
}

export function settingsWithVersion(row: {
  office: string;
  methods: unknown;
  version: number;
}): OfficeSettings {
  const parsed = officeSettingsSchema.parse({
    office: row.office,
    methods: row.methods,
  });
  return { ...parsed, version: row.version };
}

/** Allowlist the customer-facing wallet payload; never expose settings metadata. */
export function publicOfficeSettings(
  settings: OfficeSettings
): PublicOfficeSettings {
  return {
    office: settings.office,
    methods: settings.methods.flatMap(method => {
      if (!method.enabled || method.showToCustomers !== true) return [];
      const instructions = method.instructions?.trim();
      if (method.id === "cash") {
        return [
          {
            id: method.id,
            label: method.label,
            ...(instructions ? { instructions } : {}),
          },
        ];
      }
      const accountNumber = method.accountNumber?.trim();
      if (!accountNumber || !accountNumberPattern.test(accountNumber))
        return [];
      const accountName = method.accountName?.trim();
      return [
        {
          id: method.id,
          label: method.label,
          accountNumber,
          ...(accountName ? { accountName } : {}),
          ...(instructions ? { instructions } : {}),
        },
      ];
    }),
  };
}

function methodFor(settings: OfficeSettings, methodId: string) {
  return settings.methods.find(method => method.id === methodId);
}

/**
 * Payment labels are canonicalized from the settings belonging to the sale
 * office. An already persisted identical historical payment is returned
 * unchanged, even if its old method is no longer enabled.
 */
export function canonicalInvoicePayment(
  payment: InvoicePayment | undefined,
  current: Invoice | null,
  settings: OfficeSettings,
  saleOffice?: OfficeId
): InvoicePayment | undefined {
  if (!payment) return undefined;
  const parsed = invoicePaymentSchema.parse(payment);
  const old = current?.payment;
  const unchangedExisting = Boolean(
    old &&
      old.office === parsed.office &&
      old.methodId === parsed.methodId &&
      old.methodLabel === parsed.methodLabel &&
      old.reference === parsed.reference
  );
  if (unchangedExisting) return old;
  if (parsed.office !== settings.office)
    throw new Error("payment_office_mismatch");
  if (saleOffice && parsed.office !== saleOffice)
    throw new Error("payment_office_mismatch");
  const selected = methodFor(settings, parsed.methodId);
  if (!selected) throw new Error("payment_method_unknown");
  if (!selected.enabled) throw new Error("payment_method_disabled");
  return {
    office: settings.office,
    methodId: parsed.methodId,
    methodLabel: selected.label,
    ...(parsed.reference === undefined ? {} : { reference: parsed.reference }),
  };
}

export function validateInvoicePaymentRecord(
  next: Invoice,
  current: Invoice | null,
  settings: OfficeSettings,
  saleOffice?: OfficeId
): Invoice {
  const payment = canonicalInvoicePayment(
    next.payment,
    current,
    settings,
    saleOffice
  );
  return payment ? { ...next, payment } : { ...next, payment: undefined };
}

function settingsManageAllowed(scope: OfficeScope, officeId: OfficeId) {
  if (scope.role === "admin") return true;
  if (!scope.offices?.includes(officeId)) return false;
  const permissions = (scope.permissions ?? {}) as Record<string, unknown>;
  const explicit = permissions.office_wallets ?? permissions.office_settings;
  return (
    explicit === "manage" ||
    permissionAllowed(scope, "office_wallets", "manage")
  );
}

export type OfficePaymentUpdate = z.infer<typeof officePaymentUpdateSchema>;

/**
 * Transaction-only source wallet settings update for future routers. It locks
 * the actor and row, re-reads the effective scope, checks office/version, and
 * appends an audit event. The legacy Nouakchott singleton remains separate.
 */
export async function updateOfficePaymentSettings(
  tx: any,
  user: { id: number; name?: string | null; openId: string; role: any },
  input: OfficePaymentUpdate
): Promise<OfficeSettings> {
  const parsed = officePaymentUpdateSchema.parse(input);
  if (parsed.officeId === "nouakchott")
    throw new Error("legacy_office_settings_managed_separately");
  await tx
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
    .for("update");
  const scope = await readOfficeScope(tx, user, new Set(), true);
  if (!settingsManageAllowed(scope, parsed.officeId))
    throw new Error("office_wallets_forbidden");
  const rows = await tx
    .select()
    .from(officePaymentSettings)
    .where(eq(officePaymentSettings.officeId, parsed.officeId))
    .limit(1)
    .for("update");
  const current = rows[0];
  const currentVersion = current?.version ?? 0;
  if (currentVersion !== parsed.expectedVersion)
    throw new Error("version_conflict");
  const nextVersion = currentVersion + 1;
  const next: OfficeSettings = {
    office: parsed.officeId,
    methods: parsed.methods as PaymentMethod[],
    version: nextVersion,
  };
  if (current) {
    await tx
      .update(officePaymentSettings)
      .set({ methods: next.methods, version: nextVersion, updatedBy: user.id })
      .where(eq(officePaymentSettings.officeId, parsed.officeId));
  } else {
    await tx.insert(officePaymentSettings).values({
      officeId: parsed.officeId,
      methods: next.methods,
      version: nextVersion,
      updatedBy: user.id,
    });
  }
  await appendAudit(tx, {
    actor: {
      id: user.id,
      name: user.name?.trim() || `user-${user.id}`,
      role: scope.role ?? "admin",
    },
    entity: "office_payment_settings",
    recordId: parsed.officeId,
    action: "office_payment_settings_update",
    before: current
      ? {
          office: parsed.officeId,
          methods: current.methods,
          version: currentVersion,
        }
      : null,
    after: next,
    beforeVersion: currentVersion,
    afterVersion: nextVersion,
    requestKey: `office-payment-settings:${parsed.officeId}:${nextVersion}`,
  });
  return next;
}

export type WalletReceiptInput = {
  officeId: OfficeId;
  methodId: string;
  currency: string;
  amount: number;
  invoiceId?: string | null;
  kind?: "receipt" | "refund";
  financeEntryId: string;
  actorId: number;
  data?: Record<string, unknown>;
};

function walletReceiptHash(input: WalletReceiptInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        officeId: input.officeId,
        methodId: input.methodId,
        currency: input.currency,
        amount: input.amount,
        invoiceId: input.invoiceId ?? null,
        kind: input.kind ?? "receipt",
        financeEntryId: input.financeEntryId,
      })
    )
    .digest("hex");
}

/** Insert one actual wallet receipt per ledger entry; exact replay is harmless. */
export async function recordWalletReceipt(tx: any, input: WalletReceiptInput) {
  if (input.methodId === "cash") throw new Error("wallet_method_required");
  const receiptHash = walletReceiptHash(input);
  const existing = await tx
    .select()
    .from(walletMovements)
    .where(eq(walletMovements.financeEntryId, input.financeEntryId))
    .limit(1)
    .for("update");
  if (existing[0]) {
    const data = existing[0].data as Record<string, unknown> | null;
    if (data?.receiptHash === receiptHash) return existing[0];
    throw new Error("wallet_receipt_conflict");
  }
  const row = {
    id: `wallet-movement:${receiptHash}`,
    officeId: input.officeId,
    methodId: input.methodId,
    currency: input.currency,
    kind: input.kind ?? "receipt",
    amount: input.amount.toFixed(2),
    invoiceId: input.invoiceId ?? null,
    financeEntryId: input.financeEntryId,
    actorId: input.actorId,
    data: { ...(input.data ?? {}), receiptHash },
  };
  await tx.insert(walletMovements).values(row);
  return row;
}

async function dbOrThrow() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database is not available",
    });
  return db;
}

function officeForbidden(
  message = "office_wallets_permission_required"
): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

const officeReadInput = z
  .object({ officeId: officeIdSchema.optional() })
  .strict();

/** Drop-in replacement for the old routers.office subtree. */
export const officeRouter = router({
  public: publicProcedure
    .input(officeReadInput.optional())
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      return publicOfficeSettings(
        await readOfficeSettings(db, input?.officeId ?? "nouakchott")
      );
    }),

  get: protectedProcedure
    .input(officeReadInput.optional())
    .query(async ({ ctx, input }) => {
      ctx.res.setHeader("Cache-Control", "no-store");
      const db = await dbOrThrow();
      const scope = await readOfficeScope(db, ctx.user);
      const target =
        input?.officeId ??
        (scope.role === "admin" ? "nouakchott" : scope.homeOffice);
      if (!target) officeForbidden("office_scope_required");
      if (scope.role !== "admin" && !scope.offices?.includes(target))
        officeForbidden("office_forbidden");
      if (!permissionAllowed(scope, "office_wallets", "view"))
        officeForbidden();
      return readOfficeSettings(db, target);
    }),

  update: protectedProcedure
    .input(officeUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow();
      return db.transaction(async (tx: any) => {
        await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1)
          .for("update");
        const scope = await readOfficeScope(tx, ctx.user, new Set(), true);
        if (scope.role !== "admin" && !scope.offices?.includes(input.office))
          officeForbidden("office_forbidden");
        if (!permissionAllowed(scope, "office_wallets", "manage"))
          officeForbidden();
        if (input.office !== "nouakchott")
          return updateOfficePaymentSettings(tx, ctx.user, {
            officeId: input.office,
            methods: input.methods,
            expectedVersion: input.expectedVersion,
          });

        const rows = await tx
          .select()
          .from(officeSettings)
          .where(eq(officeSettings.id, 1))
          .limit(1)
          .for("update");
        const current = rows[0];
        const currentSettings = current
          ? settingsWithVersion(current)
          : defaultOfficeSettings("nouakchott");
        if (currentSettings.version !== input.expectedVersion) {
          if (
            currentSettings.office === input.office &&
            sameOfficeMethods(currentSettings.methods, input.methods)
          )
            return currentSettings;
          throw new TRPCError({
            code: "CONFLICT",
            message: "office_settings_version_conflict",
          });
        }
        if (
          current &&
          currentSettings.methods.some(
            method => !input.methods.some(next => next.id === method.id)
          )
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "payment_method_removal_forbidden",
          });
        const nextVersion = currentSettings.version + 1;
        const next = {
          office: "nouakchott" as const,
          methods: input.methods,
          version: nextVersion,
        };
        if (current)
          await tx
            .update(officeSettings)
            .set({
              office: "nouakchott",
              methods: input.methods,
              version: nextVersion,
              updatedBy: ctx.user.id,
            })
            .where(eq(officeSettings.id, 1));
        else
          await tx.insert(officeSettings).values({
            id: 1,
            office: "nouakchott",
            methods: input.methods,
            version: nextVersion,
            updatedBy: ctx.user.id,
          });
        await appendAudit(tx, {
          actor: {
            id: ctx.user.id,
            name: ctx.user.name?.trim() || `user-${ctx.user.id}`,
            role: scope.role ?? "admin",
          },
          entity: "office_settings",
          recordId: "nouakchott",
          action: "office_settings_update",
          before: currentSettings,
          after: next,
          beforeVersion: currentSettings.version,
          afterVersion: nextVersion,
          requestKey: `office:nouakchott:${nextVersion}:${ctx.user.id}`,
        });
        return next;
      });
    }),

  walletLedger: protectedProcedure
    .input(officeReadInput.optional())
    .query(async ({ ctx, input }) => {
      ctx.res.setHeader("Cache-Control", "no-store");
      const db = await dbOrThrow();
      const scope = await readOfficeScope(db, ctx.user);
      const target =
        input?.officeId ??
        (scope.role === "admin" ? "nouakchott" : scope.homeOffice);
      if (!target) officeForbidden("office_scope_required");
      if (scope.role !== "admin" && !scope.offices?.includes(target))
        officeForbidden("office_forbidden");
      if (!permissionAllowed(scope, "office_wallets", "view"))
        officeForbidden();
      return db
        .select()
        .from(walletMovements)
        .where(eq(walletMovements.officeId, target));
    }),
});
