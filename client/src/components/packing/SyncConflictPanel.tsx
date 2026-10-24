import { AlertTriangle, RefreshCw } from "lucide-react";
import type { PendingChange, SyncResult } from "@shared/operations";
import type { Language } from "@/lib/publicCopy";
import { copyFor } from "@/lib/packingCopy";
import { syncReasonMessage } from "@/lib/syncReasonCopy";
import { packingSecondaryClass } from "./PackingPrimitives";

const words = {
  ar: {
    retry: "تجهيز إعادة محاولة آمنة",
    hint: "يحافظ على المسودة والإصدار المتوقع؛ لن يُرسل الطلب ولن يستبدل بيانات الخادم حتى تراجع وتضغط المزامنة.",
    item: "التغيير المحفوظ محليًا",
  },
  en: {
    retry: "Prepare a safe retry",
    hint: "Keeps the draft and expected version. No request is sent and no server data is replaced until you review and sync.",
    item: "Locally saved change",
  },
  zh: {
    retry: "准备安全重试",
    hint: "保留草稿和预期版本。在您检查并同步之前，不会发送请求或覆盖服务器数据。",
    item: "本地保存的更改",
  },
  tr: {
    retry: "Güvenli yeniden deneme hazırla",
    hint: "Taslak ve beklenen sürüm korunur. İnceleyip eşitlemeden istek gönderilmez veya sunucu verisi değiştirilmez.",
    item: "Yerel kaydedilen değişiklik",
  },
};
type Conflict = SyncResult["conflicts"][number];
export default function SyncConflictPanel({
  conflicts,
  queue,
  language,
  busy,
  onRetry,
  onKeepLocal,
  onUseServer,
}: {
  conflicts: Conflict[];
  queue: PendingChange[];
  language: Language;
  busy: boolean;
  onRetry: (conflict: Conflict) => void;
  onKeepLocal: (conflict: Conflict) => void;
  onUseServer: (conflict: Conflict) => void;
}) {
  if (!conflicts.length) return null;
  const c = copyFor(language);
  const w = words[language];
  return (
    <section
      aria-label={c.conflicts}
      className="mb-5 min-w-0 rounded-2xl border border-amber-300 bg-amber-50 p-4"
    >
      <h2 className="flex items-center gap-2 font-bold text-amber-950">
        <AlertTriangle size={17} className="shrink-0" />
        {c.conflicts}
      </h2>
      <div className="mt-3 grid min-w-0 grid-cols-1 gap-3">
        {conflicts.map(conflict => {
          const change = queue.find(item => item.id === conflict.changeId);
          // Use this user's accessible queue label, never another office's server record.
          const label = change?.label ?? w.item;
          return (
            <article
              key={conflict.changeId}
              className="grid min-w-0 grid-cols-1 gap-3 rounded-xl bg-white p-3 text-sm"
            >
              <h3 className="min-w-0 break-words font-bold text-[#092d50]">
                {label}
              </h3>
              <p
                role="alert"
                className="min-w-0 break-words leading-6 text-amber-950"
              >
                {syncReasonMessage(conflict.reason, language)}
              </p>
              <div className="flex min-w-0 flex-wrap gap-2">
                <button
                  type="button"
                  className={`${packingSecondaryClass} min-w-0 gap-2`}
                  disabled={busy || !change}
                  onClick={() => onRetry(conflict)}
                >
                  <RefreshCw size={15} className="shrink-0" />
                  {w.retry}
                </button>
                <button
                  type="button"
                  className={`${packingSecondaryClass} min-w-0`}
                  disabled={busy}
                  onClick={() => onKeepLocal(conflict)}
                >
                  {c.keepLocal}
                </button>
                <button
                  type="button"
                  className={`${packingSecondaryClass} min-w-0`}
                  disabled={busy || !conflict.current}
                  onClick={() => onUseServer(conflict)}
                >
                  {c.useServer}
                </button>
              </div>
              <p className="min-w-0 break-words text-xs leading-5 text-[#52636e]">
                {w.hint}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
