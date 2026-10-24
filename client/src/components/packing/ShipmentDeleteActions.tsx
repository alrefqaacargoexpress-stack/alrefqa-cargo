import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import ConfirmShipmentDeletionDialog from "@/components/packing/ConfirmShipmentDeletionDialog";
import { copyFor } from "@/lib/packingCopy";
import { canDeleteShipment, deleteShipment } from "@shared/shipmentDeletion";
import type { AppRole, Shipment } from "@shared/operations";
import { permissionAllowed, type PermissionMap } from "@shared/permissions";
import type { OfficeId } from "@shared/branches";
import { compatibilityRoleForAction } from "@/lib/offlineAccess";

type Workspace = {
  role: AppRole | null;
  offices?: OfficeId[] | null;
  permissions?: PermissionMap | null;
  canDeleteShipments?: boolean;
  saveShipment: (
    shipment: Shipment,
    label?: string,
    action?: "delete-shipment"
  ) => Promise<boolean>;
  error: string | null;
  lastSaveError?: () => string | null;
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busyRef = useRef(false);
  const subject = {
    role: workspace.role,
    offices: workspace.offices,
    permissions: workspace.permissions,
  };
  const allowed =
    !shipment.deleted &&
    permissionAllowed(subject, "shipment_delete", "manage") &&
    Boolean(
      canDeleteShipment(
        compatibilityRoleForAction(subject, "shipment_delete", "manage"),
        shipment,
        workspace.offices
      )
    );
  const disabled = saving || busy || !allowed;

  const run = async (reason?: string) => {
    if (busyRef.current || saving || !allowed) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = deleteShipment(shipment, reason || c.shipmentDeleteReason);
      const saved = await workspace.saveShipment(
        next,
        `${c.deleteShipment}: ${shipment.tracking}`,
        "delete-shipment"
      );
      if (!saved) {
        setError(workspace.lastSaveError?.() ?? workspace.error ?? c.saveError);
        return;
      }
      setConfirmOpen(false);
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
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Trash2 size={15} />
        {c.deleteShipment}
      </button>
      {error && !confirmOpen && (
        <span role="alert" className="text-xs font-semibold text-red-700">
          {error}
        </span>
      )}
      {confirmOpen && (
        <ConfirmShipmentDeletionDialog
          open={confirmOpen}
          tracking={shipment.tracking}
          statusLabel={statusLabel}
          defaultReason={c.shipmentDeleteReason}
          busy={busy}
          error={confirmOpen ? error : null}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={reason => void run(reason)}
        />
      )}
    </div>
  );
}
