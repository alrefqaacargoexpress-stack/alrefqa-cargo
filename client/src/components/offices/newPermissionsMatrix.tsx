import type { ChangeEvent } from "react";
import {
  blankPermissions,
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

type PermissionMatrixProps = {
  value: PermissionMap;
  ceiling: PermissionMap;
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

export default function NewPermissionsMatrix({
  value,
  ceiling,
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
  const disabled = !canEdit || pending;

  const change = (
    key: PermissionKey,
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    if (disabled || rootOnlyPermissions.includes(key)) return;
    onChange?.({ ...current, [key]: event.target.value as PermissionLevel });
  };

  const rows = excludeRootOnly
    ? permissionKeys.filter(key => !rootOnlyPermissions.includes(key))
    : permissionKeys;

  return (
    <fieldset
      className="mt-4 rounded-2xl border border-[#dce4e7] bg-white p-4"
      disabled={disabled}
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
          {copy.ceiling}:{" "}
          {available["employees"] === "manage"
            ? copy.manage
            : available["employees"] === "view"
              ? copy.view
              : copy.none}
        </span>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-[#e5ecee]">
        <table className="min-w-[620px] w-full border-collapse text-sm">
          <thead className="bg-[#f7faf9] text-start text-xs text-[#52636e]">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-bold">
                {title ?? copy.title}
              </th>
              <th scope="col" className="px-3 py-2 text-start font-bold">
                {copy.ceiling}
              </th>
              <th scope="col" className="w-44 px-3 py-2 text-start font-bold">
                {copy.manage}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(key => {
              const isRootOnly = rootOnlyPermissions.includes(key);
              const maxRank = permissionRank(available[key]);
              const selected =
                permissionRank(current[key]) <= maxRank
                  ? current[key]
                  : available[key];
              return (
                <tr
                  key={key}
                  className="border-t border-[#edf1f1] align-middle"
                >
                  <th
                    scope="row"
                    className="px-3 py-2.5 text-start font-semibold text-[#243f52]"
                  >
                    {copy.keys[key]}
                  </th>
                  <td className="px-3 py-2.5 text-xs text-[#718088]">
                    {isRootOnly ? copy.rootOnly : copy[available[key]]}
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      aria-label={copy.keys[key]}
                      className={`${packingInputClass} min-w-36 py-2 text-sm`}
                      value={selected}
                      disabled={disabled || isRootOnly}
                      onChange={event => change(key, event)}
                    >
                      {permissionLevels.map(level => {
                        const unavailable = permissionRank(level) > maxRank;
                        return (
                          <option
                            key={level}
                            value={level}
                            disabled={unavailable}
                          >
                            {copy[level]}
                            {unavailable ? ` — ${copy.unavailable}` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!canEdit && (
        <p className="mt-3 text-xs font-semibold text-[#718088]">
          {copy.unavailable}
        </p>
      )}
    </fieldset>
  );
}

export type { PermissionMatrixProps };
