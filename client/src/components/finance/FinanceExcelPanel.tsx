import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { useFinanceWorkspace } from "@/hooks/useFinanceWorkspace";
import {
  exportFinanceWorkbook,
  exportFinanceTemplate,
  parseFinanceWorkbook,
  type FinanceImportResult,
} from "@/lib/financeExcel";
import { loadWorkspace, saveWorkspace, stageChange } from "@/lib/offlineStore";
import { downloadFinanceArchive } from "@/lib/financeStore";
import { canWriteOfficeRecord } from "@shared/branches";
import { canWriteFinance } from "@shared/finance";
import {
  packingPrimaryClass,
  packingSecondaryClass,
} from "@/components/packing/PackingPrimitives";
const copy = {
  ar: {
    title: "Excel والتفاصيل المالية",
    export: "تصدير التفاصيل",
    template: "تنزيل قالب",
    import: "استيراد للمراجعة",
    hint: "الفواتير والقيود المسجلة مرجع فقط. تُستورد الحسابات الجديدة ومسودات الفواتير والمصروفات بعد المعاينة، ولا تتحول إلى ديون أو تحصيل مشترك إلا بعد المزامنة الصريحة.",
    review: "معاينة الاستيراد",
    accounts: "حسابات جديدة",
    commands: "مسودات مالية",
    rejected: "صفوف مرفوضة",
    confirm: "حفظ المقبول محليًا",
    saved:
      "حُفظت الصفوف المقبولة كمسودات محلية. شارك الحسابات الجديدة من شاشة الحسابات قبل مزامنة الفواتير المرتبطة بها.",
    failed:
      "تعذر الحفظ. بقيت البيانات في المعاينة؛ لم نكتب فوق السجلات القديمة.",
    fileFailed:
      "تعذر قراءة الملف أو أعمدته. استخدم القالب بصيغة XLSX وراجع الصفوف.",
    blocked: "المكتب في الصف خارج صلاحياتك؛ لم يُحفظ تلقائيًا.",
    archive: "تنزيل أرشيف محلي",
    readOnly: "أوراق للعرض فقط",
    sheet: "الورقة",
    row: "الصف",
    close: "إغلاق المعاينة",
    pending: "العمليات المالية المعلقة",
    sync: "مراجعة وتسجيل العمليات",
    empty: "لا توجد عمليات مالية معلقة.",
    invoice: "فاتورة",
    expense: "مصروف",
    settlement: "سداد دين",
    movement: "حركة حساب العميل",
    openingBalance: "رصيد افتتاحي",
    profitWithdrawal: "سحب ربح",
    shipmentPrice: "سعر شحنة",
    reason: "بيانات الصف غير صالحة أو معرفه مكرر؛ لن يُستبدل سجل موجود.",
  },
  en: {
    title: "Excel and financial details",
    export: "Export details",
    template: "Download template",
    import: "Import for review",
    hint: "Posted invoices and entries are reference only. New accounts and invoice/expense drafts are imported after preview, and do not become shared debts or collections until explicit sync.",
    review: "Import preview",
    accounts: "New accounts",
    commands: "Financial drafts",
    rejected: "Rejected rows",
    confirm: "Save accepted rows locally",
    saved:
      "Accepted rows were saved as local drafts. Share new accounts from Accounts before syncing their invoices.",
    failed:
      "Save failed. Preview data remains; existing records were preserved.",
    fileFailed:
      "The file or headers could not be read. Use the XLSX template and review the rows.",
    blocked:
      "This row belongs to an office outside your permissions; it was not saved automatically.",
    archive: "Download local archive",
    readOnly: "Reference-only sheets",
    sheet: "Sheet",
    row: "Row",
    close: "Close preview",
    pending: "Pending financial operations",
    sync: "Review and post operations",
    empty: "No pending financial operations.",
    invoice: "Invoice",
    expense: "Expense",
    settlement: "Debt payment",
    movement: "Customer account movement",
    openingBalance: "Opening balance",
    profitWithdrawal: "Profit withdrawal",
    shipmentPrice: "Shipment price",
    reason:
      "Invalid row data or duplicate identifier; existing records will not be replaced.",
  },
  zh: {
    title: "Excel 与财务明细",
    export: "导出明细",
    template: "下载模板",
    import: "导入审核",
    hint: "已登记发票和账目仅供参考。新账户及发票、支出草稿须先预览，只有明确同步后才成为共享欠款或收款。",
    review: "导入预览",
    accounts: "新客户账户",
    commands: "财务草稿",
    rejected: "被拒行",
    confirm: "将可接受行保存至本地",
    saved:
      "可接受行已保存为本地草稿。同步相关发票前，请先在账户页面共享新账户。",
    failed: "保存失败，预览仍在，原记录未被覆盖。",
    fileFailed: "无法读取文件或表头，请使用 XLSX 模板并检查数据行。",
    blocked: "该行办公室不在权限范围内，未自动保存。",
    archive: "下载本地存档",
    readOnly: "只读参考工作表",
    sheet: "工作表",
    row: "行",
    close: "关闭预览",
    pending: "待处理财务操作",
    sync: "审核并登记操作",
    empty: "没有待处理财务操作。",
    invoice: "发票",
    expense: "支出",
    settlement: "偿还欠款",
    movement: "客户账户流水",
    openingBalance: "期初余额",
    profitWithdrawal: "利润提取",
    shipmentPrice: "货件价格",
    reason: "数据无效或标识重复，不会替换现有记录。",
  },
  tr: {
    title: "Excel ve mali ayrıntılar",
    export: "Ayrıntıları dışa aktar",
    template: "Şablon indir",
    import: "İnceleme için içe aktar",
    hint: "Kayıtlı fatura ve hareketler yalnızca referanstır. Yeni hesaplar ile fatura/gider taslakları önizleme sonrası alınır; açık senkronizasyon olmadan ortak borç veya tahsilat oluşmaz.",
    review: "İçe aktarma önizlemesi",
    accounts: "Yeni hesaplar",
    commands: "Mali taslaklar",
    rejected: "Reddedilen satırlar",
    confirm: "Kabul edilenleri yerelde kaydet",
    saved:
      "Kabul edilen satırlar yerel taslak olarak kaydedildi. İlgili faturaları eşitlemeden önce Hesaplar ekranından yeni hesapları paylaşın.",
    failed:
      "Kaydetme başarısız. Önizleme korunuyor; eski kayıtlar değiştirilmedi.",
    fileFailed:
      "Dosya veya başlıklar okunamadı. XLSX şablonunu kullanıp satırları kontrol edin.",
    blocked: "Satırın ofisi yetki kapsamınız dışında; otomatik kaydedilmedi.",
    archive: "Yerel arşiv indir",
    readOnly: "Yalnızca referans sayfaları",
    sheet: "Sayfa",
    row: "Satır",
    close: "Önizlemeyi kapat",
    pending: "Bekleyen mali işlemler",
    sync: "İşlemleri incele ve kaydet",
    empty: "Bekleyen mali işlem yok.",
    invoice: "Fatura",
    expense: "Gider",
    settlement: "Borç ödemesi",
    movement: "Müşteri hesap hareketi",
    openingBalance: "Açılış bakiyesi",
    profitWithdrawal: "Kâr çekimi",
    shipmentPrice: "Gönderi fiyatı",
    reason: "Geçersiz veri veya yinelenen kimlik; mevcut kayıt değiştirilmez.",
  },
};
export default function FinanceExcelPanel({
  workspace: f,
}: {
  workspace: ReturnType<typeof useFinanceWorkspace>;
}) {
  const { language } = useLanguage();
  const c = copy[language];
  const [preview, setPreview] = useState<FinanceImportResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canWrite = canWriteFinance({
    role: f.role,
    offices: f.offices,
    homeOffice: f.homeOffice,
    permissions: f.permissions,
  });
  const read = async (file?: File) => {
    if (!file) return;
    setMessage("");
    try {
      setPreview(
        await parseFinanceWorkbook(file, {
          invoiceIds: [
            ...f.invoices.map(i => i.id),
            ...f.commands.flatMap(x =>
              x.kind === "invoice" ? [x.payload.invoiceId] : []
            ),
          ],
          expenseIds: [
            ...f.entries.map(e => e.id),
            ...f.commands.flatMap(x =>
              x.kind === "expense" ? [x.payload.expenseId] : []
            ),
          ],
          movementIds: [
            ...f.entries.map(e => e.id),
            ...f.commands.flatMap(x =>
              x.kind === "customer_movement" ? [x.payload.movementId] : []
            ),
          ],
          accountIds: f.base.state.accounts.map(a => a.id),
          shipmentIds: f.base.state.shipments.map(s => s.id),
          openingIds: f.entries
            .filter(e => e.kind === "opening_balance")
            .map(e => e.id),
          shipmentPriceShipmentIds: f.commands
            .filter(x => x.kind === "shipment_price")
            .map(x => x.payload.shipmentId),
        })
      );
    } catch {
      setMessage(c.fileFailed);
    }
  };
  const accept = async () => {
    if (!preview || !canWrite || !f.base.userId || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (
        preview.accounts.some(
          a => !canWriteOfficeRecord(f.role, f.offices, "account", a)
        )
      )
        throw new Error("scope");
      if (preview.accounts.length) {
        let next = loadWorkspace(f.base.userId);
        for (const account of preview.accounts) {
          if (next.state.accounts.some(a => a.id === account.id))
            throw new Error("duplicate");
          next = stageChange(
            next,
            "account",
            account,
            `Excel: ${account.name}`
          );
        }
        await saveWorkspace(f.base.userId, next);
        await f.base.reload();
        setPreview(p => (p ? { ...p, accounts: [] } : p));
      }
      for (const command of preview.commands) {
        if (!(await f.saveCommand(command))) throw new Error("save");
        setPreview(p =>
          p
            ? { ...p, commands: p.commands.filter(x => x.id !== command.id) }
            : p
        );
      }
      setMessage(c.saved);
    } catch (e) {
      setMessage(
        e instanceof Error && e.message === "scope" ? c.blocked : c.failed
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-2xl border border-[#dce4e7] bg-white p-4 sm:p-5">
      <h2 className="text-lg font-black text-[#092d50]">{c.title}</h2>
      <p className="mt-2 text-sm text-[#52636e]">{c.hint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={packingSecondaryClass}
          onClick={() =>
            exportFinanceWorkbook(
              {
                invoices: f.invoices,
                entries: f.entries,
                homeOffice: f.homeOffice,
                offices: f.offices,
                lastReadAt: f.store?.snapshot.lastReadAt ?? null,
                receivables: f.store?.snapshot.receivables ?? [],
                shipmentReceivables:
                  f.store?.snapshot.shipmentReceivables ??
                  f.store?.snapshot.receivables ??
                  [],
              },
              f.commands,
              f.base.state.accounts
            )
          }
        >
          {c.export}
        </button>
        <button
          className={packingSecondaryClass}
          onClick={() => exportFinanceTemplate()}
        >
          {c.template}
        </button>
        <label className={`${packingSecondaryClass} cursor-pointer`}>
          {c.import}
          <input
            aria-label={c.import}
            type="file"
            accept=".xlsx"
            className="sr-only"
            disabled={!f.canEdit || busy}
            onChange={e => {
              void read(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {f.base.userId && (
          <button
            className={packingSecondaryClass}
            onClick={() => downloadFinanceArchive(f.base.userId!)}
          >
            {c.archive}
          </button>
        )}
      </div>
      {preview && (
        <div className="mt-4 rounded-xl bg-[#f5f8f6] p-3">
          <h3 className="font-bold">{c.review}</h3>
          <p className="mt-2 text-sm">
            {c.accounts}: {preview.accounts.length} · {c.commands}:{" "}
            {preview.commands.length} · {c.rejected}: {preview.rejected.length}
          </p>
          <p className="mt-2 break-words text-xs">
            {c.readOnly}: {preview.readOnlySheets.join("، ")}
          </p>
          <div className="mt-2 max-h-64 overflow-auto text-xs">
            {preview.accounts.map(a => (
              <p key={a.id}>
                {a.name} · {a.phone} · {a.officeId ?? "—"}
              </p>
            ))}
            {preview.commands.map(x => (
              <p key={x.id} className="py-1">
                {x.kind === "invoice"
                  ? `${c.invoice}: ${x.payload.invoiceId} · ${x.payload.customerId} · ${x.payload.currency}`
                  : x.kind === "expense"
                    ? `${c.expense}: ${x.payload.amount} ${x.payload.currency} · ${x.payload.officeId}`
                    : x.kind === "customer_movement"
                      ? `${c.movement}: ${x.payload.customerId} · ${x.payload.amount} ${x.payload.currency} · ${x.payload.officeId}`
                        : x.kind === "opening_balance"
                          ? `${c.openingBalance}: ${x.payload.officeId} · ${x.payload.amount} ${x.payload.currency} · ${x.payload.direction}`
                          : x.kind === "profit_withdrawal"
                            ? `${c.profitWithdrawal}: ${x.payload.officeId} · ${x.payload.amount} ${x.payload.currency}`
                          : x.kind === "shipment_price"
                          ? `${c.shipmentPrice}: ${x.payload.shipmentId} · ${x.payload.pricePerKg}`
                          : c.settlement}
              </p>
            ))}
            {preview.rejected.map((r, i) => (
              <p key={i} className="py-1 text-red-800">
                {c.sheet} {r.sheet} · {c.row} {r.row}:{" "}
                {r.sheet === "الحسابات" ? r.reason : c.reason}
              </p>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className={packingPrimaryClass}
              disabled={
                busy ||
                !canWrite ||
                !(preview.accounts.length + preview.commands.length)
              }
              onClick={() => void accept()}
            >
              {c.confirm}
            </button>
            <button
              className={packingSecondaryClass}
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              {c.close}
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">
          {message}
        </p>
      )}
      <div className="mt-4 border-t border-[#edf1f1] pt-3">
        <h3 className="font-bold">
          {c.pending} ({f.commands.length})
        </h3>
        {!f.commands.length ? (
          <p className="mt-2 text-sm text-[#718088]">{c.empty}</p>
        ) : (
          <>
            <div className="mt-2 max-h-64 space-y-2 overflow-auto text-xs">
              {f.commands.map(x => (
                <p key={x.id} className="rounded-lg bg-amber-50 p-2">
                  {x.kind === "invoice"
                    ? `${c.invoice}: ${x.payload.invoiceId} · ${x.payload.customerId} · ${x.payload.employeeOfficeId ?? f.homeOffice ?? "—"} · ${x.payload.currency}`
                    : x.kind === "expense"
                      ? `${c.expense}: ${x.payload.category} · ${x.payload.amount} ${x.payload.currency} · ${x.payload.officeId}`
                      : x.kind === "customer_movement"
                        ? `${c.movement}: ${x.payload.customerId} · ${x.payload.amount} ${x.payload.currency} · ${x.payload.officeId}`
                          : x.kind === "opening_balance"
                            ? `${c.openingBalance}: ${x.payload.officeId} · ${x.payload.amount} ${x.payload.currency}`
                            : x.kind === "profit_withdrawal"
                              ? `${c.profitWithdrawal}: ${x.payload.officeId} · ${x.payload.amount} ${x.payload.currency}`
                            : x.kind === "shipment_price"
                            ? `${c.shipmentPrice}: ${x.payload.shipmentId} · ${x.payload.pricePerKg}`
                            : `${c.settlement}: ${x.payload.invoiceId} · ${x.payload.amount}`}
                </p>
              ))}
            </div>
          </>
        )}
        {f.notice && (
          <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">
            {f.notice}
          </p>
        )}
      </div>
    </section>
  );
}
