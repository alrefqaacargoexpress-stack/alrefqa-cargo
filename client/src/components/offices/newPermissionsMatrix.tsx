import type { ChangeEvent } from "react";
import {
  blankPermissions,
  intersectPermissions,
  permissionKeys,
  permissionLevels,
  permissionRank,
  rootOnlyPermissions,
  type PermissionKey,
  type PermissionLevel,
  type PermissionMap,
} from "@shared/permissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { newPermissionsCopyFor } from "@/lib/newpermissionsCopy";
import { packingInputClass } from "@/components/packing/PackingPrimitives";

export const permissionGroups = [
  {
    id: "management",
    keys: [
      "office_settings",
      "employees",
      "office_assign",
      "employee_disable",
    ] as const,
  },
  {
    id: "shipping",
    keys: [
      "shipments",
      "shipment_send",
      "shipment_delete",
      "tracking",
      "market_warehouse",
    ] as const,
  },
  {
    id: "warehouse",
    keys: ["arrival", "storage"] as const,
  },
  {
    id: "salesCustomers",
    keys: ["customers", "invoices", "payments"] as const,
  },
  {
    id: "financeCost",
    keys: [
      "expenses",
      "shipment_cost",
      "arrival_cost",
      "opening_balance",
      "shipment_prices",
      "office_wallets",
      "profit_withdrawal",
      "invoice_void",
      "entry_void",
    ] as const,
  },
  {
    id: "reportsAudit",
    keys: ["reports", "finance_reports", "excel", "audit"] as const,
  },
] as const;

const groupedPermissionKeys = permissionGroups.flatMap(group => [
  ...group.keys,
]);

// Keep this assertion close to the display contract: every shared key appears once.
if (
  groupedPermissionKeys.length !== permissionKeys.length ||
  new Set(groupedPermissionKeys).size !== permissionKeys.length ||
  permissionKeys.some(key => !groupedPermissionKeys.includes(key))
) {
  throw new Error(
    "Permission groups must contain every permission key exactly once"
  );
}

type PermissionDisplaySource = "saved" | "default" | "preview";

type PermissionMatrixProps = {
  value: PermissionMap;
  ceiling: PermissionMap;
  defaultValue?: PermissionMap;
  effectiveValue?: PermissionMap;
  source?: PermissionDisplaySource;
  canEdit?: boolean;
  pending?: boolean;
  onChange?: (next: PermissionMap) => void;
  showRootPermissions?: boolean;
  excludeRootOnly?: boolean;
  title?: string;
  hint?: string;
};

function completePermissions(
  value: PermissionMap | null | undefined,
  preserveRoot = false
): PermissionMap {
  const result = { ...blankPermissions(), ...(value ?? {}) };
  rootOnlyPermissions.forEach(key => {
    if (!preserveRoot) result[key] = "none";
  });
  return result;
}

function levelLabel(
  copy: ReturnType<typeof newPermissionsCopyFor>,
  value: PermissionLevel
) {
  return copy[value];
}

export default function NewPermissionsMatrix({
  value,
  ceiling,
  defaultValue,
  effectiveValue,
  source = "default",
  canEdit = false,
  pending = false,
  onChange,
  showRootPermissions = false,
  excludeRootOnly = false,
  title,
  hint,
}: PermissionMatrixProps) {
  const { language } = useLanguage();
  const copy = newPermissionsCopyFor(language);
  const current = completePermissions(value, showRootPermissions);
  const available = completePermissions(ceiling, showRootPermissions);
  const effective = completePermissions(
    effectiveValue ?? intersectPermissions(current, available),
    showRootPermissions
  );
  const defaults = completePermissions(defaultValue, showRootPermissions);
  const disabled = !canEdit || pending;
  const sourceLabel =
    source === "saved"
      ? copy.sourceSaved
      : source === "preview"
        ? copy.sourcePreview
        : copy.sourceDefault;

  const change = (
    key: PermissionKey,
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    if (disabled || rootOnlyPermissions.includes(key)) return;
    onChange?.({ ...current, [key]: event.target.value as PermissionLevel });
  };

  return (
    <fieldset
      className="mt-4 rounded-2xl border border-[#dce4e7] bg-white p-4"
      disabled={false}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <legend className="text-sm font-black text-[#092d50]">
            {title ?? copy.title}
          </legend>
          <p className="mt-1 text-xs leading-5 text-[#718088]">
            {hint ?? copy.hint}
          </p>
        </div>
        <span className="rounded-full bg-[#eef5f4] px-3 py-1 text-xs font-bold text-[#315b5a]">
          {copy.source}: {sourceLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {permissionGroups.map(group => {
          const rows = group.keys.filter(
            key => !excludeRootOnly || !rootOnlyPermissions.includes(key)
          );
          if (!rows.length) return null;
          return (
            <section
              key={group.id}
              className="rounded-xl border border-[#e5ecee] bg-[#fbfcfb] p-3"
              aria-labelledby={`permission-group-${group.id}`}
            >
              <h3
                id={`permission-group-${group.id}`}
                className="text-sm font-black text-[#243f52]"
              >
                {copy.groups[group.id]}
              </h3>
              <div className="mt-3 grid gap-3">
                {rows.map(key => {
                  const isRootOnly = rootOnlyPermissions.includes(key);
                  const maxRank = permissionRank(available[key]);
                  const isAboveCeiling =
                    !isRootOnly && permissionRank(current[key]) > maxRank;
                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-[#edf1f1] bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-[#243f52]">
                          {copy.keys[key]}
                        </p>
                        {isRootOnly && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                            {copy.rootOnly}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-[#718088]">
                        <div className="flex items-center justify-between gap-2">
                          <span>{copy.ceiling}</span>
                          <strong className="text-[#52636e]">
                            {levelLabel(copy, available[key])}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span>{copy.sourceDefault}</span>
                          <strong className="text-[#52636e]">
                            {levelLabel(copy, defaults[key])}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span>{copy.effective}</span>
                          <strong className="text-[#315b5a]">
                            {levelLabel(copy, effective[key])}
                          </strong>
                        </div>
                      </div>
                      <label className="mt-3 grid gap-1.5 text-xs font-bold text-[#243f52]">
                        <span>{copy.current}</span>
                        <select
                          aria-label={copy.keys[key]}
                          className={`${packingInputClass} w-full py-2 text-sm`}
                          value={current[key]}
                          disabled={disabled || isRootOnly}
                          onChange={event => change(key, event)}
                        >
                          {permissionLevels.map(level => {
                            const unavailable = permissionRank(level) > maxRank;
                            return (
                              <option
                                key={level}
                                value={level}
                                disabled={unavailable || isRootOnly}
                              >
                                {levelLabel(copy, level)}
                                {unavailable ? ` — ${copy.unavailable}` : ""}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      {isAboveCeiling && (
                        <p className="mt-2 text-[11px] font-bold leading-4 text-amber-800">
                          {copy.aboveCeiling}
                        </p>
                      )}
                      {isRootOnly && (
                        <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-500">
                          {copy.rootOnly}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {!canEdit && (
        <p className="mt-3 text-xs font-semibold text-[#718088]">
          {copy.unavailable}
        </p>
      )}
    </fieldset>
  );
}

export type { PermissionDisplaySource, PermissionMatrixProps };
