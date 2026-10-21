import { useRef, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { copyFor } from "@/lib/packingCopy";
import {
  canDeleteShipment,
  deleteShipment,
  restoreShipment,
} from "@shared/shipmentDeletion";
import type { AppRole, Shipment } from "@shared/operations";

type Workspace = {
  role: AppRole | null;
  saveShipment: (
    shipment: Shipment,
    label?: string,
    action?: "delete-shipment" | "restore-shipment"
  ) => Promise<boolean>;
  error: string | null;
};

type Props = {
  shipment: Shipment;
  workspace: Workspace;
  c: ReturnType<typeof copyFor>;
  statusLabel?: string;
  saving?: boolean;
  onSuccess?: (shipment: Shipment) => void;
  className?: string;
};

export default function ShipmentDeleteActions({
  shipment,
  workspace,
  c,
  statusLabel = shipment.status,
  saving = false,
  onSuccess,
  className = "",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const allowed = canDeleteShipment(workspace.role, shipment);
  const disabled = saving || busy || !allowed;

  const run = async (action: "delete-shipment" | "restore-shipment") => {
    if (busyRef.current || saving || !allowed) return;
    const isRestore = action === "restore-shipment";
    const prompt = isRestore
      ? c.confirmRestoreShipment.replace("{tracking}", shipment.tracking)
      : c.confirmDeleteShipment
          .replace("{tracking}", shipment.tracking)
          .replace("{status}", statusLabel);
    if (!window.confirm(prompt)) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = isRestore
        ? restoreShipment(shipment)
        : deleteShipment(shipment, c.shipmentDeleteReason);
      const saved = await workspace.saveShipment(
        next,
        `${isRestore ? c.restoreShipment : c.deleteShipment}: ${shipment.tracking}`,
        action
      );
      if (!saved) {
        setError(workspace.error ?? c.saveError);
        return;
      }
      onSuccess?.(next);
    } catch (value) {
      setError(
        value instanceof Error &&
          value.message === "shipment_deletion_forbidden"
          ? c.noPermission
          : c.saveError
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (!allowed) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {shipment.deleted ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void run("restore-shipment")}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw size={15} />
          {c.restoreShipment}
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void run("delete-shipment")}
          className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={15} />
          {c.deleteShipment}
        </button>
      )}
      {error && (
        <span role="alert" className="text-xs font-semibold text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
