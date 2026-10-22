import type { AppRole, Shipment } from "./operations";
import {
  ownerOffice,
  shipmentOffices,
  canReadOfficeRecord,
  type OfficeId,
} from "./branches";
export function canBillShipmentCurrency(
  role: AppRole | null,
  offices: OfficeId[] | null,
  shipment: Shipment,
  currency: string
): boolean {
  if (role !== "admin" && role !== "accountant") return false;
  if (!canReadOfficeRecord(role, offices, "shipment", shipment)) return false;
  const source = ownerOffice("shipment", shipment);
  if (
    role === "admin" ||
    offices === null ||
    (source && offices.includes(source))
  )
    return true;
  return (
    currency === "MRU" &&
    offices.includes("nouakchott") &&
    shipmentOffices(shipment).includes("nouakchott")
  );
}
export function protectOfficeShipmentFinance(
  shipment: Shipment,
  role: AppRole | null,
  offices: OfficeId[] | null
): Shipment {
  const source = ownerOffice("shipment", shipment);
  if (
    role !== "accountant" ||
    offices === null ||
    (source && offices.includes(source))
  )
    return shipment;
  return {
    ...shipment,
    amount: 0,
    ...(shipment.packing
      ? {
          packing: {
            ...shipment.packing,
            pricePerKg: 0,
            ...(shipment.packing.pricePerKgMRU === undefined
              ? {}
              : {
                  pricePerKgMRU: canBillShipmentCurrency(
                    role,
                    offices,
                    shipment,
                    "MRU"
                  )
                    ? shipment.packing.pricePerKgMRU
                    : 0,
                }),
          },
        }
      : {}),
  };
}
