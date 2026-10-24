import { useMemo, useState } from "react";
import type { FinanceEntry } from "@shared/finance";
import type { Invoice } from "@shared/operations";
import type { OfficeId } from "@shared/branches";
import {
  permissionAllowed,
  type PermissionMap,
  type PermissionSubject,
} from "@shared/permissions";
import { trpc } from "@/lib/trpc";
import {
  PackingField,
  packingInputClass,
  packingSecondaryClass,
} from "@/components/packing/PackingPrimitives";

type Language = "ar" | "en" | "zh" | "tr";
type Workspace = {
  role: PermissionSubject["role"];
  offices: readonly OfficeId[] | null;
  homeOffice?: OfficeId | null;
  permissions?: PermissionMap | null;
  online: boolean;
  userId?: string | null;
  base: { localOnly: boolean };
  reload: () => Promise<void>;
};
const copy = {
  ar: {
    invoiceTitle: "إلغاء فاتورة منشورة",
    entryTitle: "إلغاء قيد مرحّل",
    hint: "الإلغاء موثق ولا يمحو الأصل. المقبوض يبقى محفوظًا، ويُسجل رصيد العميل بدل رد نقدي تلقائي.",
    invoice: "الفاتورة",
    entry: "القيد",
    choose: "اختر سجلًا",
    none: "لا توجد سجلات قابلة للإلغاء في هذا النطاق.",
    confirm: "اكتب المعرف للتأكيد",
    reason: "سبب الإلغاء",
    submit: "تأكيد الإلغاء",
    saved: "تم توثيق الإلغاء وتحديث اللقطة.",
    permission: "لا تملك صلاحية الإلغاء لهذا النوع.",
    offline: "يلزم اتصال وجلسة صالحة لتنفيذ الإلغاء.",
    error: "تعذر تنفيذ الإلغاء. راجع المعرف والسبب أو أعد تحميل البيانات.",
    conflict: "تغير السجل أو أُلغي من قبل؛ أعد تحميل الصفحة.",
    forbidden: "لا تملك صلاحية هذه العملية.",
    cashNote: "الرصيد الدفتري cashEffect:none ليس قبضًا نقديًا.",
  },
  en: {
    invoiceTitle: "Void a posted invoice",
    entryTitle: "Void a posted entry",
    hint: "Voiding is audited and keeps the original. Receipts remain preserved; customer credit is recorded instead of an automatic refund.",
    invoice: "Invoice",
    entry: "Entry",
    choose: "Choose a record",
    none: "No voidable records are in this scope.",
    confirm: "Type the identifier to confirm",
    reason: "Void reason",
    submit: "Confirm void",
    saved: "Void recorded and the snapshot refreshed.",
    permission: "You do not have permission to void this type.",
    offline: "A valid connection and session are required to void a record.",
    error:
      "The void could not be completed. Review the identifier and reason or reload the data.",
    conflict: "The record changed or was already voided; reload the page.",
    forbidden: "You do not have permission for this operation.",
    cashNote:
      "A cashEffect:none ledger credit is bookkeeping credit, not cash received.",
  },
  zh: {
    invoiceTitle: "作废已发布发票",
    entryTitle: "作废已过账账目",
    hint: "作废会记录审计且保留原件。已收款仍保留；记录客户贷方而不是自动退款。",
    invoice: "发票",
    entry: "账目",
    choose: "选择记录",
    none: "此范围没有可作废记录。",
    confirm: "输入编号确认",
    reason: "作废原因",
    submit: "确认作废",
    saved: "作废已记录，快照已刷新。",
    permission: "您没有作废此类型的权限。",
    offline: "作废记录需要有效连接和会话。",
    error: "作废无法完成。请检查编号和原因或重新加载数据。",
    conflict: "记录已变化或已作废；请重新加载页面。",
    forbidden: "您没有执行此操作的权限。",
    cashNote: "cashEffect:none 的账务贷方是账面余额，不是收到现金。",
  },
  tr: {
    invoiceTitle: "Yayınlanmış faturayı iptal et",
    entryTitle: "Kaydedilmiş fişi iptal et",
    hint: "İptal denetlenir ve aslı korur. Tahsilat korunur; otomatik iade yerine müşteri alacağı kaydedilir.",
    invoice: "Fatura",
    entry: "Fiş",
    choose: "Kayıt seçin",
    none: "Bu kapsamda iptal edilebilir kayıt yok.",
    confirm: "Onay için kimliği yazın",
    reason: "İptal nedeni",
    submit: "İptali onayla",
    saved: "İptal kaydedildi ve görüntü yenilendi.",
    permission: "Bu türü iptal etme yetkiniz yok.",
    offline: "İptal için geçerli bağlantı ve oturum gerekir.",
    error:
      "İptal tamamlanamadı. Kimlik ve nedeni kontrol edin veya verileri yenileyin.",
    conflict: "Kayıt değişti veya zaten iptal edildi; sayfayı yenileyin.",
    forbidden: "Bu işlem için yetkiniz yok.",
    cashNote: "cashEffect:none muhasebe alacağıdır; nakit tahsilat değildir.",
  },
} as const;
type Copy = (typeof copy)[Language];
function textFor(language: string): Copy {
  return copy[
    (Object.keys(copy) as Language[]).includes(language as Language)
      ? (language as Language)
      : "en"
  ];
}
function friendlyError(error: unknown, c: Copy) {
  const code =
    error && typeof error === "object" && "data" in error
      ? (error as { data?: { code?: string } }).data?.code
      : undefined;
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return c.forbidden;
  if (code === "CONFLICT") return c.conflict;
  return c.error;
}
function requestKey(prefix: string, id: string) {
  return `${prefix}:${id}:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`.slice(
    0,
    128
  );
}

export default function FinancialVoidPanel({
  workspace,
  language,
  mode,
  invoices = [],
  entries = [],
}: {
  workspace: Workspace;
  language: string;
  mode: "invoice" | "entry";
  invoices?: readonly Invoice[];
  entries?: readonly FinanceEntry[];
}) {
  const c = textFor(language);
  const subject: PermissionSubject = {
    role: workspace.role,
    offices: workspace.offices,
    homeOffice: workspace.homeOffice,
    permissions: workspace.permissions,
  };
  const allowed = permissionAllowed(
    subject,
    mode === "invoice" ? "invoice_void" : "entry_void",
    "manage"
  );
  const records = useMemo(
    () =>
      mode === "invoice"
        ? invoices.filter(invoice =>
            Boolean(invoice.finance || invoice.officeId)
          )
        : entries.filter(
            entry =>
              !entry.invoiceId &&
              entry.kind !== "opening_balance" &&
              entry.kind !== "shipment_revenue"
          ),
    [entries, invoices, mode]
  );
  const [recordId, setRecordId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const voidInvoice = trpc.financialVoids.voidInvoice.useMutation();
  const voidEntry = trpc.financialVoids.voidEntry.useMutation();
  const utils = trpc.useUtils();
  const selected = records.find(record => record.id === recordId);
  const busy = voidInvoice.isPending || voidEntry.isPending;
  const submit = async () => {
    setError("");
    setMessage("");
    if (!allowed) return setError(c.permission);
    if (
      !workspace.online ||
      workspace.base.localOnly ||
      !workspace.userId ||
      !selected ||
      confirmation.trim() !== selected.id ||
      !reason.trim()
    )
      return setError(
        !workspace.online || workspace.base.localOnly ? c.offline : c.error
      );
    try {
      const request = requestKey(
        mode === "invoice" ? "void-invoice" : "void-entry",
        selected.id
      );
      if (mode === "invoice") {
        await voidInvoice.mutateAsync({
          id: request,
          invoiceId: selected.id,
          expectedVersion: (selected as Invoice).version ?? 1,
          confirmation: confirmation.trim(),
          reason: reason.trim(),
        });
      } else {
        await voidEntry.mutateAsync({
          id: request,
          entryId: selected.id,
          confirmation: confirmation.trim(),
          reason: reason.trim(),
        });
      }
      setRecordId("");
      setConfirmation("");
      setReason("");
      setMessage(c.saved);
      await Promise.allSettled([
        workspace.reload(),
        utils.finance.snapshot.invalidate(),
        utils.operations.snapshot.invalidate(),
      ]);
    } catch (voidError) {
      setError(friendlyError(voidError, c));
    }
  };
  if (!allowed) return null;
  return (
    <section className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
      <div className="border-b border-red-100 pb-4">
        <h2 className="text-lg font-black text-[#092d50]">
          {mode === "invoice" ? c.invoiceTitle : c.entryTitle}
        </h2>
        <p className="mt-1 text-sm text-[#718088]">{c.hint}</p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <PackingField label={mode === "invoice" ? c.invoice : c.entry} required>
          <select
            className={packingInputClass}
            value={recordId}
            disabled={busy || !records.length}
            onChange={event => {
              setRecordId(event.target.value);
              setConfirmation("");
            }}
          >
            <option value="">{records.length ? c.choose : c.none}</option>
            {records.map(record => (
              <option key={record.id} value={record.id}>
                {record.id}
                {mode === "invoice"
                  ? ` · ${(record as Invoice).account}`
                  : ` · ${(record as FinanceEntry).amount} ${(record as FinanceEntry).currency}`}
              </option>
            ))}
          </select>
        </PackingField>
        <PackingField label={c.confirm} required>
          <input
            className={packingInputClass}
            value={confirmation}
            disabled={busy || !selected}
            onChange={event => setConfirmation(event.target.value)}
            placeholder={c.confirm}
          />
        </PackingField>
        <PackingField label={c.reason} required>
          <textarea
            className={`${packingInputClass} min-h-10`}
            maxLength={500}
            value={reason}
            disabled={busy || !selected}
            onChange={event => setReason(event.target.value)}
          />
        </PackingField>
      </div>
      {mode === "entry" &&
        selected &&
        (selected as FinanceEntry).cashEffect === "none" && (
          <p className="mt-3 rounded-xl bg-sky-50 p-3 text-xs font-bold text-sky-950">
            {c.cashNote}
          </p>
        )}
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-900"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900"
        >
          {message}
        </p>
      )}
      <button
        type="button"
        className={`${packingSecondaryClass} mt-4 border-red-200 text-red-900`}
        disabled={
          busy ||
          !selected ||
          confirmation.trim() !== selected.id ||
          !reason.trim()
        }
        onClick={() => void submit()}
      >
        {busy ? "…" : c.submit}
      </button>
    </section>
  );
}
