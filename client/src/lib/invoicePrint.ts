import type { Invoice } from "@shared/operations";
import { invoiceDocumentAmounts } from "@shared/invoiceDocument";
import { officeNames } from "@shared/branches";
import { invoiceCopyFor, type FinanceLanguage } from "./financeInvoiceCopy";
import { invoicePrintCopy } from "./invoicePrintCopy";

export type InvoicePrintOptions = {
  language: FinanceLanguage;
  online: boolean;
  lastReadAt: string | null;
  pendingSettlement: boolean;
};
export function escapeInvoiceHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!
  );
}
export function invoicePdfFilename(invoiceId: string): string {
  const clean = invoiceId
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_-]/gu, "_")
    .slice(0, 80);
  return `Alrefqa-invoice-${clean || "invoice"}.pdf`;
}
const locale = { ar: "ar-MR", en: "en-GB", zh: "zh-CN", tr: "tr-TR" };
export function invoicePrintDate(
  value: string,
  language: FinanceLanguage
): string {
  // Legacy date strings may be labels, not timestamps. Do not replace them with today's date.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return `${new Intl.DateTimeFormat(locale[language], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date)} UTC`;
}
export function buildInvoicePrintHtml(
  invoice: Invoice,
  options: InvoicePrintOptions
): string {
  const amounts = invoiceDocumentAmounts(invoice);
  if (!amounts.ok) throw new Error(amounts.reason);
  if (
    invoice.scope !== "shared" ||
    !Number.isSafeInteger(invoice.version) ||
    (invoice.version ?? 0) <= 0
  )
    throw new Error("not_confirmed");
  const finance = invoice.finance!;
  const c = invoiceCopyFor(options.language);
  const p = invoicePrintCopy[options.language];
  const e = escapeInvoiceHtml;
  const format = (value: number, decimals = 2) =>
    new Intl.NumberFormat("en-GB", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  const money = (value: number) =>
    `<bdi dir="ltr">${e(format(value))} ${e(finance.currency)}</bdi>`;
  const office = (id: keyof typeof officeNames.ar) =>
    e(officeNames[options.language][id]);
  const field = (label: string, value: string) =>
    `<div class="field"><dt>${e(label)}</dt><dd>${value}</dd></div>`;
  const payment =
    finance.paymentMode === "on_account"
      ? c.onAccount
      : finance.paymentMode === "wallet"
        ? c.wallet
        : finance.paymentMode === "shipping_fee"
          ? c.shippingFee
          : c.cash;
  const status =
    invoice.status === "مدفوعة"
      ? c.paid
      : invoice.status === "دين"
        ? c.debt
        : c.waiting;
  const goods = finance.goods
    .map(
      (good, index) => `<tr>
    <td class="number">${index + 1}</td><td class="number">${e(good.cartonNumber)}</td>
    <td><bdi>${e(good.name)}</bdi>${good.phone ? `<small><bdi dir="ltr">${e(good.phone)}</bdi></small>` : ""}</td>
    <td class="number">${e(format(good.pieces, 0))}</td><td class="number">${e(format(good.weight, 3))}</td>
  </tr>`
    )
    .join("");
  const notes = [
    !options.online ? p.offline : "",
    options.pendingSettlement ? p.pendingPayment : "",
  ]
    .filter(Boolean)
    .map(note => `<p class="notice">${e(note)}</p>`)
    .join("");
  return `<!doctype html>
<html lang="${options.language}" dir="${options.language === "ar" ? "rtl" : "ltr"}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${e(invoicePdfFilename(invoice.id).replace(/\.pdf$/, ""))}</title>
<link rel="stylesheet" href="/fonts/fonts.css">
<style>
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
html { color-scheme: light; background: #fff; }
body { margin: 0; color: #132f45; background: #fff; font: 13px/1.65 'IBM Plex Sans Arabic', 'Inter', system-ui, sans-serif; }
article { max-width: 190mm; margin: auto; padding: 22px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 18px; padding-bottom: 14px; border-bottom: 3px solid #092d50; break-inside: avoid; }
.brand { display: flex; align-items: center; gap: 12px; }
.brand img { width: 54px; height: 54px; object-fit: contain; }
h1 { font-size: 21px; line-height: 1.5; margin: 0; } h2 { font-size: 22px; margin: 0; }
.subtitle, .meta, dt { color: #52636e; font-size: 11px; }
.identity { text-align: end; } .identity bdi { display: block; max-width: 70mm; overflow-wrap: anywhere; }
.status { display: inline-block; margin-top: 6px; border: 1px solid #d5dedf; border-radius: 4px; padding: 2px 10px; font-size: 11px; }
dl { display: grid; grid-template-columns: 1fr 1fr; margin: 16px 0; gap: 12px 24px; }
.field { min-width: 0; } dt, dd { margin: 0; } dd { font-weight: 600; overflow-wrap: anywhere; }
table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
thead { display: table-header-group; } th { background: #edf2f3; text-align: start; color: #092d50; }
th, td { padding: 8px 6px; border-bottom: 1px solid #dce4e7; vertical-align: top; overflow-wrap: anywhere; }
tr { break-inside: avoid; page-break-inside: avoid; } .number { text-align: center; direction: ltr; font-variant-numeric: tabular-nums; }
small { display: block; font-size: 10px; color: #52636e; } .totals { width: 100%; max-width: 90mm; margin: 18px 0 0 auto; border: 1px solid #dce4e7; break-inside: avoid; page-break-inside: avoid; }
[dir=rtl] .totals { margin-left: 0; margin-right: auto; }
.total-row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 7px 12px; }
.total-row strong { white-space: nowrap; font-variant-numeric: tabular-nums; } .grand { background: #edf2f3; border-top: 2px solid #092d50; font-size: 17px; font-weight: 700; }
.notice { border-inline-start: 3px solid #b07820; padding: 7px 10px; font-size: 11px; background: #fff9eb; break-inside: avoid; }
.summary { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 18px; font-size: 11px; }
footer { border-top: 1px solid #dce4e7; margin-top: 18px; padding-top: 8px; color: #52636e; font-size: 10px; break-inside: avoid; }
footer p { margin: 3px 0; } bdi { unicode-bidi: isolate; }
@media print { article { max-width: none; padding: 0; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
@media screen and (max-width: 480px) { article { padding: 12px; } h1 { font-size: 17px; } header { gap: 8px; } .brand img { width: 38px; height: 38px; } dl { gap: 8px 12px; } }
</style></head><body><article>
<header><div class="brand"><img src="/icons/logo.webp" alt=""><div><h1>مؤسسة الرفكة للشحن</h1><div class="subtitle">Alrefqa Cargo</div></div></div>
<div class="identity"><h2>${e(p.invoice)}</h2><bdi dir="ltr">${e(invoice.id)}</bdi><span class="status">${e(status)}</span></div></header>
${notes}
<dl>
${field(c.customer, `<bdi>${e(invoice.account)}</bdi>`)}
${field(p.date, `<bdi>${e(invoicePrintDate(finance.recordedAt || invoice.issuedAt, options.language))}</bdi>`)}
${field(c.issuingOffice, office(finance.issuingOfficeId))}
${field(c.financialOffice, office(finance.financialOfficeId))}
${field(c.actor, `<bdi>${e(finance.actorName || "—")}</bdi>`)}
${field(c.currency, `<bdi dir="ltr">${e(finance.currency)}</bdi>`)}
${field(c.issueMethod, e(payment))}
${field(p.latestPayment, `<bdi>${e(invoice.payment?.methodLabel || "—")}</bdi>`)}
${finance.shipmentId ? field(c.shipment, `<bdi dir="ltr">${e(finance.shipmentId)}</bdi>`) : ""}
${invoice.payment?.reference ? field(c.paymentReference, `<bdi>${e(invoice.payment.reference)}</bdi>`) : ""}
</dl>
${
  goods
    ? `<table aria-label="${e(c.selectedGoods)}"><colgroup><col style="width:7%"><col style="width:13%"><col style="width:46%"><col style="width:14%"><col style="width:20%"></colgroup><thead><tr><th class="number">#</th><th>${e(p.carton)}</th><th>${e(c.goodsName)}</th><th>${e(c.pieces)}</th><th>${e(c.weight)} (${e(p.kg)})</th></tr></thead><tbody>${goods}</tbody></table>
<div class="summary"><span>${e(c.weightTotal)}: <bdi dir="ltr">${e(format(amounts.weight, 3))} ${e(p.kg)}</bdi></span><span>${e(c.piecesTotal)}: <bdi dir="ltr">${e(format(amounts.pieces, 0))}</bdi></span></div><p class="meta">${e(p.detailNote)}</p>`
    : `<p>${e(c.general)}</p>`
}
<section class="totals" aria-label="${e(c.total)}">
<div class="total-row"><span>${e(c.baseAmount)}</span><strong>${money(amounts.baseAmount)}</strong></div>
<div class="total-row"><span>${e(c.adjustment)} · ${e(amounts.adjustment.direction === "increase" ? c.increase : c.decrease)}</span><strong><bdi dir="ltr">${amounts.adjustment.direction === "increase" ? "+" : "−"}${e(format(amounts.adjustment.amount))} ${e(finance.currency)}</bdi></strong></div>
<div class="total-row grand"><span>${e(c.total)}</span><strong>${money(amounts.total)}</strong></div>
<div class="total-row"><span>${e(p.paidAmount)}</span><strong>${money(amounts.paid)}</strong></div>
<div class="total-row"><span>${e(c.remaining)}</span><strong>${money(amounts.remaining)}</strong></div>
</section>
<footer><p>${e(p.footer)}</p><p>${e(p.version)}: <bdi dir="ltr">${e(invoice.version)}</bdi> · ${e(p.lastRead)}: <bdi>${e(options.lastReadAt ? invoicePrintDate(options.lastReadAt, options.language) : p.unknownRead)}</bdi></p></footer>
</article></body></html>`;
}
