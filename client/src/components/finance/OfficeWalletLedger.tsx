import { useLanguage } from "@/contexts/LanguageContext";
import type { OfficeId } from "@shared/branches";
import { permissionAllowed } from "@shared/permissions";
import { trpc } from "@/lib/trpc";
import type { useFinanceWorkspace } from "@/hooks/useFinanceWorkspace";

const copy = {
  ar: {
    title: "دفتر محافظ المكتب",
    hint: "صافي الحركات المسجلة فقط، دون افتراض رصيد افتتاحي أو استعلام عن رصيد المزود الخارجي. العملات منفصلة، وإلغاء الفاتورة لا يعني رد المال تلقائيًا.",
    choose: "اختر مكتبًا واحدًا لعرض دفتر محافظه.",
    empty: "لا توجد حركات محافظ مسجلة لهذا المكتب.",
    error: "تعذر تحميل دفتر المحافظ.",
    retry: "إعادة المحاولة",
    loading: "جارٍ تحميل الحركات…",
    offline: "غير متصل؛ المعروض آخر حركات محملة فقط.",
    received: "المقبوض بالمحفظة",
    refund: "رد موثق",
    net: "صافي الحركات",
    method: "المحفظة",
    invoice: "الفاتورة",
    date: "وقت الحركة",
    amount: "المبلغ",
  },
  en: {
    title: "Office wallet ledger",
    hint: "Recorded movements only, without an assumed opening balance or a query to the external provider. Currencies stay separate; voiding an invoice does not automatically refund money.",
    choose: "Select one office to view its wallet ledger.",
    empty: "No wallet movements are recorded for this office.",
    error: "Could not load the wallet ledger.",
    retry: "Retry",
    loading: "Loading movements…",
    offline: "Offline: only the last loaded movements are shown.",
    received: "Wallet receipts",
    refund: "Recorded refund",
    net: "Net movements",
    method: "Wallet",
    invoice: "Invoice",
    date: "Movement time",
    amount: "Amount",
  },
  zh: {
    title: "办公室钱包台账",
    hint: "仅统计已记录的资金变动，不假定期初余额，也不查询外部服务商余额。币种分别列示；取消发票不等于自动退款。",
    choose: "请选择一个办公室查看钱包台账。",
    empty: "该办公室尚无钱包资金变动记录。",
    error: "无法加载钱包台账。",
    retry: "重试",
    loading: "正在加载资金变动…",
    offline: "离线：仅显示最近已加载的记录。",
    received: "钱包收款",
    refund: "已记录退款",
    net: "净变动",
    method: "钱包",
    invoice: "发票",
    date: "变动时间",
    amount: "金额",
  },
  tr: {
    title: "Ofis cüzdan defteri",
    hint: "Yalnızca kayıtlı hareketler gösterilir; varsayılan açılış bakiyesi veya dış sağlayıcı bakiyesi yoktur. Para birimleri ayrıdır; faturayı iptal etmek otomatik iade yapmaz.",
    choose: "Cüzdan defteri için tek bir ofis seçin.",
    empty: "Bu ofiste kayıtlı cüzdan hareketi yok.",
    error: "Cüzdan defteri yüklenemedi.",
    retry: "Yeniden dene",
    loading: "Hareketler yükleniyor…",
    offline: "Çevrimdışı: yalnızca son yüklenen hareketler gösterilir.",
    received: "Cüzdan tahsilatı",
    refund: "Kayıtlı iade",
    net: "Net hareket",
    method: "Cüzdan",
    invoice: "Fatura",
    date: "Hareket zamanı",
    amount: "Tutar",
  },
} as const;
export const walletLedgerCopy = copy;

export function summarizeWalletLedger(
  rows: readonly {
    officeId: string;
    currency: string;
    kind: string;
    amount: number | string;
  }[],
  officeId: OfficeId
) {
  const grouped = new Map<
    string,
    { currency: string; receivedCents: number; refundsCents: number }
  >();
  for (const row of rows) {
    if (row.officeId !== officeId || !["receipt", "refund"].includes(row.kind))
      continue;
    const amount = Math.round(Number(row.amount) * 100);
    if (!Number.isSafeInteger(amount) || amount < 0) continue;
    const current = grouped.get(row.currency) ?? {
      currency: row.currency,
      receivedCents: 0,
      refundsCents: 0,
    };
    if (row.kind === "receipt") current.receivedCents += amount;
    else current.refundsCents += amount;
    grouped.set(row.currency, current);
  }
  return [...grouped.values()]
    .sort((a, b) => a.currency.localeCompare(b.currency))
    .map(row => ({
      currency: row.currency,
      received: row.receivedCents / 100,
      refunds: row.refundsCents / 100,
      balance: (row.receivedCents - row.refundsCents) / 100,
    }));
}

export default function OfficeWalletLedger({
  workspace,
  selectedOffice,
}: {
  workspace: ReturnType<typeof useFinanceWorkspace>;
  selectedOffice: OfficeId | "all";
}) {
  const { language } = useLanguage();
  const c = copy[language];
  const office = selectedOffice === "all" ? null : selectedOffice;
  const allowed = permissionAllowed(
    {
      role: workspace.role,
      offices: workspace.offices,
      homeOffice: workspace.homeOffice,
      permissions: workspace.permissions,
    },
    "office_wallets",
    "view"
  );
  const inScope = Boolean(
    office && (workspace.offices === null || workspace.offices.includes(office))
  );
  const ledger = trpc.office.walletLedger.useQuery(
    { officeId: office ?? "nouakchott" },
    {
      enabled: Boolean(
        allowed && inScope && workspace.base.userId && workspace.online
      ),
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 0,
      gcTime: 0,
    }
  );
  if (!allowed) return null;
  const rows = inScope && office ? (ledger.data ?? []) : [];
  const totals = office ? summarizeWalletLedger(rows, office) : [];
  const money = (value: number | string, currency: string) =>
    `${new Intl.NumberFormat(language === "ar" ? "ar-MR-u-nu-latn" : language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} ${currency}`;
  const date = (value: string | Date) => {
    const d = new Date(value);
    return Number.isFinite(d.getTime())
      ? d.toLocaleString(language === "ar" ? "ar-MR" : language)
      : "—";
  };
  return (
    <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-[#092d50]">{c.title}</h2>
      <p className="mt-1 text-xs leading-6 text-[#718088]">{c.hint}</p>
      {!workspace.online && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
          {c.offline}
        </p>
      )}
      {!office || !inScope ? (
        <p className="mt-4 text-sm">{c.choose}</p>
      ) : ledger.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-900">
          {c.error}{" "}
          <button
            className="ms-3 underline"
            onClick={() => void ledger.refetch()}
            disabled={!workspace.online}
          >
            {c.retry}
          </button>
        </p>
      ) : ledger.isLoading ? (
        <p className="mt-4 text-sm">{c.loading}</p>
      ) : !rows.length ? (
        <p className="mt-4 text-sm text-[#718088]">{c.empty}</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {totals.map(total => (
              <article
                key={total.currency}
                className="rounded-xl bg-[#f4f8f7] p-4"
              >
                <strong>{total.currency}</strong>
                <dl className="mt-2 grid gap-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt>{c.received}</dt>
                    <dd dir="ltr">{money(total.received, total.currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>{c.refund}</dt>
                    <dd dir="ltr">{money(total.refunds, total.currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 font-bold">
                    <dt>{c.net}</dt>
                    <dd dir="ltr">{money(total.balance, total.currency)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[640px] w-full text-start text-sm">
              <thead>
                <tr>
                  {[c.date, c.method, c.invoice, c.amount].map(label => (
                    <th key={label} className="p-2 text-start">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-t border-[#edf1f1]">
                    <td className="p-2">{date(row.createdAt)}</td>
                    <td className="p-2">
                      {workspace
                        .settingsForOffice(office)
                        ?.methods.find(method => method.id === row.methodId)
                        ?.label ?? row.methodId}
                    </td>
                    <td className="p-2 font-mono text-xs">
                      {row.invoiceId ?? "—"}
                    </td>
                    <td className="p-2" dir="ltr">
                      {row.kind === "refund" ? "−" : "+"}
                      {money(row.amount, row.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
