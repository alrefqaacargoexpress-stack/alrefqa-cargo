import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ShipmentDeleteActions from "./ShipmentDeleteActions";
import { copyFor } from "@/lib/packingCopy";
import { createPackedShipment } from "@shared/packing";
import { deleteShipment } from "@shared/shipmentDeletion";
import type { AppRole } from "@shared/operations";
const original = createPackedShipment({
  tracking: "RF-DELETE",
  source: "china",
  pricePerKg: 4,
  pricePerKgMRU: 120,
});
const archived = deleteShipment(original, "User request");
const workspace = (
  role: AppRole | null,
  offices?: ("nouakchott" | "dubai" | "china" | "turkey")[] | null
) => ({
  role,
  offices,
  error: null,
  saveShipment: async () => true,
});
describe("Shipment deletion action rendering", () => {
  it("renders translated deletion labels in all four languages for an admin", () => {
    for (const lang of ["ar", "en", "zh", "tr"] as const) {
      const c = copyFor(lang);
      const html = renderToStaticMarkup(
        <ShipmentDeleteActions
          shipment={original}
          workspace={workspace("admin")}
          c={c}
        />
      );
      expect(html).toContain(c.deleteShipment);
      expect(html).not.toContain('disabled=""');
    }
  });
  it("does not display an active deletion action to a viewer or accountant", () => {
    for (const role of ["viewer", "accountant", null] as const) {
      const html = renderToStaticMarkup(
        <ShipmentDeleteActions
          shipment={original}
          workspace={workspace(role)}
          c={copyFor("en")}
        />
      );
      expect(html).toBe("");
    }
  });
  it("shows the action to an office manager only for the manager's office", () => {
    const c = copyFor("en");
    expect(
      renderToStaticMarkup(
        <ShipmentDeleteActions
          shipment={original}
          workspace={workspace("office_manager", ["china"])}
          c={c}
        />
      )
    ).toContain(c.deleteShipment);
    expect(
      renderToStaticMarkup(
        <ShipmentDeleteActions
          shipment={original}
          workspace={workspace("office_manager", ["dubai"])}
          c={c}
        />
      )
    ).toBe("");
  });
  it("does not expose restore or delete actions for archived data", () => {
    const c = copyFor("en");
    const admin = renderToStaticMarkup(
      <ShipmentDeleteActions
        shipment={archived}
        workspace={workspace("admin")}
        c={c}
      />
    );
    expect(admin).toBe("");
    const viewer = renderToStaticMarkup(
      <ShipmentDeleteActions
        shipment={archived}
        workspace={workspace("viewer")}
        c={c}
      />
    );
    expect(viewer).toBe("");
  });
  it("does not offer staff deletion after transit and disables duplicate submission while saving", () => {
    const c = copyFor("en");
    const transit = { ...original, status: "في الطريق" as const };
    expect(
      renderToStaticMarkup(
        <ShipmentDeleteActions
          shipment={transit}
          workspace={workspace("staff")}
          c={c}
        />
      )
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <ShipmentDeleteActions
          shipment={original}
          workspace={workspace("admin")}
          c={c}
          saving
        />
      )
    ).toContain('disabled=""');
  });
});
