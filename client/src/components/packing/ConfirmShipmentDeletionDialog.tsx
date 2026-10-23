import { useEffect, useState } from "react";
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
    reasonLabel: "سبب الحذف",
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
    reasonLabel: "Deletion reason",
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
    reasonLabel: "删除原因",
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
    reasonLabel: "Silme gerekçesi",
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
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-800">
            <ShieldAlert size={18} />
            {c.title}
          </DialogTitle>
          <DialogDescription>
            {c.body
              .replace("{tracking}", tracking)
              .replace("{status}", statusLabel)}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={event => {
            event.preventDefault();
            if (matches && !busy) onConfirm(finalReason);
          }}
        >
          <label className="grid gap-1 text-sm font-bold text-[#092d50]">
            {c.typeLabel}
            <input
              autoFocus
              autoComplete="off"
              dir="ltr"
              value={typed}
              disabled={busy}
              onChange={event => setTyped(event.target.value)}
              placeholder={tracking}
              className="rounded-xl border border-[#dce4e7] px-3 py-2 font-mono text-base"
            />
          </label>
          {typed.trim() && !matches && (
            <p className="text-xs font-semibold text-red-700">{c.mismatch}</p>
          )}
          <label className="grid gap-1 text-sm font-bold text-[#092d50]">
            {c.reasonLabel}
            <input
              maxLength={240}
              value={reason}
              disabled={busy}
              onChange={event => setReason(event.target.value)}
              placeholder={c.reasonPlaceholder}
              className="rounded-xl border border-[#dce4e7] px-3 py-2 text-base"
            />
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {error}
            </p>
          )}
          <DialogFooter className="gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-xl border border-[#dce4e7] px-4 py-2 text-sm font-bold text-[#23445d]"
            >
              {c.cancel}
            </button>
            <button
              type="submit"
              disabled={!matches || busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
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
