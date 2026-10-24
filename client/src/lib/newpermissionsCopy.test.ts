import { describe, expect, it } from "vitest";
import {
  newPermissionsCopy,
  permissionCopyLanguages,
} from "./newpermissionsCopy";
import { permissionKeys } from "../../../shared/permissions";

describe("new permissions copy", () => {
  it("keeps all shared permission keys in Arabic, English, Chinese, and Turkish", () => {
    for (const language of permissionCopyLanguages) {
      expect(Object.keys(newPermissionsCopy[language].keys).sort()).toEqual(
        [...permissionKeys].sort()
      );
      expect(newPermissionsCopy[language].keys.shipment_cost).toBeTruthy();
      expect(newPermissionsCopy[language].keys.arrival_cost).toBeTruthy();
      expect(JSON.stringify(newPermissionsCopy[language])).not.toContain(
        "undefined"
      );
    }
  });
});
