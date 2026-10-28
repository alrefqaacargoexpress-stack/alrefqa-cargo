import { useEffect, useRef, useState } from "react";
import { FileText, Printer } from "lucide-react";
import type { Invoice } from "@shared/operations";
import type { FinanceCommand } from "@shared/finance";
import type { PermissionSubject } from "@shared/permissions";
import { invoicePrintAccess } from "@shared/invoiceDocument";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { packingSecondaryClass } from "@/components/packing/PackingPrimitives";
import { buildInvoicePrintHtml } from "@/lib/invoicePrint";
import { invoicePrintCopy } from "@/lib/invoicePrintCopy";
import type { FinanceLanguage } from "@/lib/financeInvoiceCopy";

export type InvoicePrintButtonProps = {
  invoice: Invoice;
  subject: PermissionSubject;
  userId: string | null;
  permissionFingerprint?: string | null;
  commands: readonly FinanceCommand[];
  online: boolean;
  lastReadAt: string | null;
  language: FinanceLanguage;
};

/** Print a private in-memory document, not the app shell or a public invoice URL. */
export default function InvoicePrintButton(props: InvoicePrintButtonProps) {
  const {
    invoice,
    subject,
    userId,
    permissionFingerprint,
    commands,
    online,
    lastReadAt,
    language,
  } = props;
  const copy = invoicePrintCopy[language];
  const frame = useRef<HTMLIFrameElement>(null);
  const [selection, setSelection] = useState<{
    userId: string;
    fingerprint: string | null;
  } | null>(null);
  const [loadedDocument, setLoadedDocument] = useState<string | null>(null);
  const [error, setError] = useState("");
  const access = invoicePrintAccess(invoice, subject, commands);
  const allowed = Boolean(userId && access.ok);
  const ownerMatches = Boolean(
    selection &&
      selection.userId === userId &&
      selection.fingerprint === (permissionFingerprint ?? null)
  );
  const open = allowed && ownerMatches;
  const html =
    open && access.ok
      ? buildInvoicePrintHtml(invoice, {
          language,
          online,
          lastReadAt,
          pendingSettlement: access.pendingSettlement,
        })
      : "";
  const latest = useRef({ props, html });
  latest.current = { props, html };
  useEffect(() => {
    if (!allowed || !ownerMatches) {
      setSelection(null);
      setLoadedDocument(null);
    }
  }, [allowed, ownerMatches]);
  const onLoad = async () => {
    const target = frame.current;
    if (!target || !html) return;
    try {
      const doc = target.contentDocument;
      if (!doc) throw new Error("print_frame_unavailable");
      // Same-origin local fonts are already included in the PWA precache.
      await doc.fonts?.ready;
      await Promise.all(
        Array.from(doc.images).map(image =>
          image.decode?.().catch(() => undefined)
        )
      );
      if (frame.current === target && latest.current.html === html) {
        setError("");
        setLoadedDocument(html);
      }
    } catch {
      if (latest.current.html === html) setError(copy.failed);
    }
  };
  const print = () => {
    const now = latest.current;
    const currentAccess = invoicePrintAccess(
      now.props.invoice,
      now.props.subject,
      now.props.commands
    );
    if (
      !now.props.userId ||
      !selection ||
      selection.userId !== now.props.userId ||
      selection.fingerprint !== (now.props.permissionFingerprint ?? null) ||
      !currentAccess.ok ||
      !now.html ||
      loadedDocument !== now.html ||
      !frame.current?.contentWindow
    ) {
      setError(copy.unavailable);
      return;
    }
    try {
      frame.current.contentWindow.focus();
      // Native print produces selectable, vector text and supports Save as PDF.
      // Do not call saveCommand, sync or an accounting mutation from this path.
      frame.current.contentWindow.print();
    } catch {
      setError(copy.failed);
    }
  };
  const blocked = !userId
    ? copy.forbidden
    : access.ok
      ? ""
      : copy[access.reason];
  return (
    <div className="space-y-1">
      <button
        type="button"
        className={`${packingSecondaryClass} min-h-10 whitespace-nowrap px-3 py-2 text-xs`}
        disabled={!allowed}
        title={blocked || undefined}
        onClick={() => {
          if (!allowed || !userId) return;
          setError("");
          setLoadedDocument(null);
          setSelection({ userId, fingerprint: permissionFingerprint ?? null });
        }}
      >
        <FileText size={14} aria-hidden="true" />
        {copy.action}
      </button>
      {blocked && (
        <p className="max-w-56 text-xs font-normal text-[#718088]">{blocked}</p>
      )}
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!value) setSelection(null);
        }}
      >
        <DialogContent
          className="w-[calc(100%-1rem)] gap-3 p-3 sm:max-w-4xl sm:p-5"
          dir={language === "ar" ? "rtl" : "ltr"}
        >
          <DialogHeader className="pe-7 text-start">
            <DialogTitle>
              {copy.title} · <bdi>{invoice.id}</bdi>
            </DialogTitle>
            <DialogDescription>{copy.help}</DialogDescription>
          </DialogHeader>
          {open && (
            <iframe
              ref={frame}
              title={`${copy.invoice} ${invoice.id}`}
              srcDoc={html}
              sandbox="allow-same-origin allow-modals"
              referrerPolicy="no-referrer"
              onLoad={() => void onLoad()}
              className="h-[58dvh] min-h-64 w-full rounded-xl border border-[#dce4e7] bg-white"
            />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={packingSecondaryClass}
              disabled={!open || loadedDocument !== html}
              onClick={print}
            >
              <Printer size={16} aria-hidden="true" />
              {copy.print}
            </button>
            {open && loadedDocument !== html && !error && (
              <p role="status" className="text-xs text-[#718088]">
                {copy.loading}
              </p>
            )}
            <button
              type="button"
              className="ms-auto rounded-lg px-3 py-2 text-sm underline"
              onClick={() => setSelection(null)}
            >
              {copy.close}
            </button>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 p-3 text-sm text-red-900"
            >
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
