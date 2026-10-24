import { useEffect, useId, useState } from "react";
import { ShieldAlert, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";

const copy = {
  ar: {
    title: "تأكيد حذف الشحنة",
    body: "ستُنقل الشحنة {tracking} ({status}) إلى أرشيف المحذوفات. لن تظهر في القوائم، ويبقى سجلها في التدقيق ويمكن للمدير العام استعادتها.",
    typeLabel: "اكتب رقم الشحنة للتأكيد",
    typeHint:
      "لتفعيل زر الحذف، اكتب رقم الشحنة في الحقل. الرقم الرمادي مجرد مثال وليس إدخالًا.",
    matched: "تمت مطابقة رقم الشحنة. يمكنك تأكيد الحذف أو الإلغاء.",
    reasonLabel: "سبب الحذف (اختياري)",
    reasonHint: "إذا تركته فارغًا، سيُسجَّل السبب: {reason}.",
    reasonPlaceholder: "مثال: شحنة تجريبية أو مكررة",
    mismatch: "رقم الشحنة غير مطابق.",
    confirm: "حذف الشحنة",
    cancel: "إلغاء",
    working: "جارٍ الحذف…",
  },
  en: {
    title: "Confirm shipment deletion",
    body: "Shipment {tracking} ({status}) will move to the deleted archive. It disappears from lists, its audit history is kept, and the general manager can restore it.",
    typeLabel: "Type the shipment number to confirm",
    typeHint:
      "Enter the shipment number to enable deletion. The gray number is only a placeholder, not an entered value.",
    matched: "The shipment number matches. You can confirm deletion or cancel.",
    reasonLabel: "Deletion reason (optional)",
    reasonHint: "If left blank, the recorded reason will be: {reason}.",
    reasonPlaceholder: "Example: test or duplicate shipment",
    mismatch: "The shipment number does not match.",
    confirm: "Delete shipment",
    cancel: "Cancel",
    working: "Deleting…",
  },
  zh: {
    title: "确认删除货运",
    body: "货运 {tracking}（{status}）将移入已删除存档。它会从列表中隐藏，审计记录保留，总经理可以恢复。",
    typeLabel: "输入货运编号以确认",
    typeHint: "输入货运编号以启用删除按钮。灰色编号只是示例，不是已输入的值。",
    matched: "货运编号匹配。您可以确认删除或取消。",
    reasonLabel: "删除原因（可选）",
    reasonHint: "如果留空，记录的原因是：{reason}。",
    reasonPlaceholder: "例如：测试或重复货运",
    mismatch: "货运编号不匹配。",
    confirm: "删除货运",
    cancel: "取消",
    working: "正在删除…",
  },
  tr: {
    title: "Gönderi silmeyi onayla",
    body: "{tracking} gönderisi ({status}) silinenler arşivine taşınacak. Listelerden kalkar, denetim kaydı korunur ve genel müdür geri yükleyebilir.",
    typeLabel: "Onaylamak için gönderi numarasını yazın",
    typeHint:
      "Silme düğmesini etkinleştirmek için gönderi numarasını girin. Gri numara yalnızca örnektir, girilmiş bir değer değildir.",
    matched:
      "Gönderi numarası eşleşiyor. Silmeyi onaylayabilir veya iptal edebilirsiniz.",
    reasonLabel: "Silme gerekçesi (isteğe bağlı)",
    reasonHint: "Boş bırakılırsa kaydedilecek gerekçe: {reason}.",
    reasonPlaceholder: "Örnek: deneme veya mükerrer gönderi",
    mismatch: "Gönderi numarası eşleşmiyor.",
    confirm: "Gönderiyi sil",
    cancel: "İptal",
    working: "Siliniyor…",
  },
} as const;

/** Exact, whitespace-insensitive match of the typed shipment number. */
export function deletionConfirmationMatches(typed: string, tracking: string) {
  const clean = (value: string) =>
    value.normalize("NFKC").replace(/\s+/g, "").toLocaleUpperCase();
  return clean(typed).length > 0 && clean(typed) === clean(tracking);
}

type Props = {
  open: boolean;
  tracking: string;
  statusLabel: string;
  defaultReason: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

export default function ConfirmShipmentDeletionDialog({
  open,
  tracking,
  statusLabel,
  defaultReason,
  busy,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const { language } = useLanguage();
  const c = copy[language] ?? copy.ar;
  const hintId = useId();
  const reasonHintId = useId();
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) {
      setTyped("");
      setReason("");
    }
  }, [open]);
  const matches = deletionConfirmationMatches(typed, tracking);
  const finalReason = (reason.trim() || defaultReason).slice(0, 240);
  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent dir={language === "ar" ? "rtl" : "ltr"}>
        <DialogHeader className="min-w-0 text-start pr-7">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-red-800 leading-relaxed">
            <ShieldAlert size={18} className="shrink-0" />
            {c.title}
          </DialogTitle>
          <DialogDescription className="min-w-0 break-words leading-6">
            {c.body
              .replace("{tracking}", tracking)
              .replace("{status}", statusLabel)}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid min-w-0 grid-cols-1 gap-3"
          onSubmit={event => {
            event.preventDefault();
            if (matches && !busy) onConfirm(finalReason);
          }}
        >
          <label className="grid min-w-0 grid-cols-1 gap-1 text-sm font-bold text-[#092d50]">
            {c.typeLabel}
            <input
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              dir="ltr"
              value={typed}
              disabled={busy}
              onChange={event => setTyped(event.target.value)}
              placeholder={tracking}
              required
              aria-describedby={hintId}
              aria-invalid={Boolean(typed.trim() && !matches)}
              className="w-full min-w-0 rounded-xl border border-[#dce4e7] px-3 py-2 font-mono text-base"
            />
          </label>
          <p
            id={hintId}
            role="status"
            aria-live="polite"
            className={`min-w-0 break-words text-xs leading-5 ${matches ? "text-emerald-800" : typed.trim() ? "text-red-700" : "text-[#52636e]"}`}
          >
            {matches ? c.matched : typed.trim() ? c.mismatch : c.typeHint}
          </p>
          <label className="grid min-w-0 grid-cols-1 gap-1 text-sm font-bold text-[#092d50]">
            {c.reasonLabel}
            <input
              maxLength={240}
              value={reason}
              disabled={busy}
              onChange={event => setReason(event.target.value)}
              placeholder={c.reasonPlaceholder}
              aria-describedby={reasonHintId}
              className="w-full min-w-0 rounded-xl border border-[#dce4e7] px-3 py-2 text-base"
            />
          </label>
          <p
            id={reasonHintId}
            className="min-w-0 break-words text-xs leading-5 text-[#52636e]"
          >
            {c.reasonHint.replace("{reason}", defaultReason)}
          </p>
          {error && (
            <p
              role="alert"
              className="min-w-0 break-words rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {error}
            </p>
          )}
          <DialogFooter className="min-w-0 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="min-h-11 min-w-0 rounded-xl border border-[#dce4e7] px-4 py-2 text-sm font-bold text-[#23445d]"
            >
              {c.cancel}
            </button>
            <button
              type="submit"
              disabled={!matches || busy}
              className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={15} />
              {busy ? c.working : c.confirm}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
