import { z } from "zod";
import type { Account, Shipment } from "./operations";
export const sources = ["dubai", "turkey", "china"] as const;
export type PackingSource = (typeof sources)[number];
export const sourceCurrency: Record<PackingSource, string> = {
  dubai: "AED",
  turkey: "TRY",
  china: "CNY",
};
export const sourceName: Record<PackingSource, string> = {
  dubai: "دبي",
  turkey: "تركيا",
  china: "الصين",
};
export function normalizeTracking(value: string): string {
  return value.trim().toLowerCase();
}
const positiveInteger = z.number().int().positive().max(1000000);
const money = z
  .number()
  .finite()
  .nonnegative()
  .max(999999999)
  .refine(
    n => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001,
    "invalid_rate"
  );
export const goodsSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(240),
    phone: z.string().trim().max(64),
    unitWeight: z
      .number()
      .finite()
      .positive()
      .max(1000000)
      .refine(
        n => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.0001,
        "invalid_weight"
      ),
    pieces: positiveInteger,
    deleted: z
      .object({
        at: z.string().datetime(),
        reason: z.string().trim().min(1).max(240),
      })
      .strict()
      .optional(),
  })
  .strict();
export const cartonSchema = z
  .object({
    number: z.number().int().positive().max(1000),
    closed: z.boolean(),
    goods: z.array(goodsSchema).max(5000),
  })
  .strict();
export const packingSchema = z
  .object({
    source: z.enum(sources),
    pricePerKg: money,
    pricePerKgMRU: money.optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    cartons: z.array(cartonSchema).min(1).max(1000),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    let count = 0;
    value.cartons.forEach((carton, index) => {
      if (carton.number !== index + 1)
        ctx.addIssue({ code: "custom", message: "invalid_carton_order" });
      if (index < value.cartons.length - 1 && !carton.closed)
        ctx.addIssue({ code: "custom", message: "invalid_open_carton" });
      if (carton.closed && !carton.goods.length)
        ctx.addIssue({ code: "custom", message: "carton_empty" });
      for (const item of carton.goods) {
        if (ids.has(item.id))
          ctx.addIssue({ code: "custom", message: "duplicate_goods_id" });
        ids.add(item.id);
        count++;
      }
    });
    if (count > 20000)
      ctx.addIssue({ code: "custom", message: "too_many_goods" });
  });
export type PackingGoods = z.infer<typeof goodsSchema>;
export type PackingCarton = z.infer<typeof cartonSchema>;
export type PackingSession = z.infer<typeof packingSchema>;
export type PackedShipment = Shipment & { packing: PackingSession };
export type PackingTotals = { pieces: number; weight: number; amount: number };
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}
function grams(item: PackingGoods): number {
  return Math.round(item.unitWeight * 1000) * item.pieces;
}
export function goodsTotals(
  goods: readonly PackingGoods[],
  pricePerKg = 0
): PackingTotals {
  let totalGrams = 0,
    pieces = 0;
  for (const item of goods) {
    goodsSchema.parse(item);
    if (item.deleted) continue;
    totalGrams += grams(item);
    pieces += item.pieces;
  }
  if (!Number.isSafeInteger(totalGrams) || !Number.isSafeInteger(pieces))
    throw new Error("totals_too_large");
  money.parse(pricePerKg);
  const cents =
    (BigInt(totalGrams) * BigInt(Math.round(pricePerKg * 100)) + 500n) / 1000n;
  const amount = Number(cents) / 100;
  if (amount > 999999999) throw new Error("totals_too_large");
  return { pieces, weight: totalGrams / 1000, amount };
}
export function packingTotals(packing: PackingSession): PackingTotals {
  return goodsTotals(
    packing.cartons.flatMap(c => c.goods),
    packing.pricePerKg
  );
}
export type CustomerSummary = PackingTotals & {
  key: string;
  name: string;
  phones: string[];
  cartons: number[];
};
export function packingCustomers(packing: PackingSession): CustomerSummary[] {
  const map = new Map<
    string,
    {
      name: string;
      phones: Set<string>;
      cartons: Set<number>;
      goods: PackingGoods[];
    }
  >();
  for (const carton of packing.cartons)
    for (const item of carton.goods) {
      if (item.deleted) continue;
      const key = normalizeName(item.name);
      const current = map.get(key) ?? {
        name: item.name,
        phones: new Set<string>(),
        cartons: new Set<number>(),
        goods: [],
      };
      if (item.phone) current.phones.add(item.phone);
      current.cartons.add(carton.number);
      current.goods.push(item);
      map.set(key, current);
    }
  return [...map.entries()].map(([key, value]) => ({
    key,
    name: value.name,
    phones: [...value.phones],
    cartons: [...value.cartons],
    ...goodsTotals(value.goods, packing.pricePerKg),
  }));
}
export function isPackedShipment(
  shipment: Shipment
): shipment is PackedShipment {
  return Boolean(shipment.packing);
}
function freshId() {
  return crypto.randomUUID();
}
export function createPackedShipment(
  input: {
    tracking: string;
    source: PackingSource;
    pricePerKg: number;
    pricePerKgMRU?: number;
  },
  now = new Date().toISOString()
): PackedShipment {
  const tracking = input.tracking.trim();
  if (!tracking || tracking.length > 128) throw new Error("invalid_tracking");
  const packing = packingSchema.parse({
    source: input.source,
    pricePerKg: input.pricePerKg,
    ...(input.pricePerKgMRU === undefined
      ? {}
      : { pricePerKgMRU: input.pricePerKgMRU }),
    createdAt: now,
    updatedAt: now,
    cartons: [{ number: 1, closed: false, goods: [] }],
  });
  return {
    id: `shipment-${freshId()}`,
    tracking,
    account: "شحنة مجمعة",
    route: `${sourceName[input.source]} → نواكشوط`,
    service: "جوي",
    status: "قيد التجهيز",
    eta: "غير محدد",
    amount: 0,
    scope: "pending",
    packing,
  };
}
function editable(shipment: PackedShipment) {
  if (shipment.deleted) throw new Error("shipment_deleted");
  if (shipment.status !== "قيد التجهيز") throw new Error("shipment_not_open");
}
export function addPackingGoods(
  shipment: PackedShipment,
  input: Omit<PackingGoods, "id" | "deleted">
): PackedShipment {
  editable(shipment);
  const packing = structuredClone(shipment.packing);
  const carton = packing.cartons.at(-1)!;
  if (carton.closed) throw new Error("carton_closed");
  const item = goodsSchema.parse({
    name: input.name,
    phone: input.phone,
    unitWeight: input.unitWeight,
    pieces: input.pieces,
    id: freshId(),
  });
  carton.goods.push(item);
  packing.updatedAt = new Date().toISOString();
  packingSchema.parse(packing);
  return {
    ...shipment,
    packing,
    amount: packingTotals(packing).amount,
    scope: "pending",
  };
}
export function closePackingCarton(shipment: PackedShipment): PackedShipment {
  editable(shipment);
  const packing = structuredClone(shipment.packing);
  const carton = packing.cartons.at(-1)!;
  if (carton.closed) throw new Error("carton_closed");
  if (!carton.goods.some(g => !g.deleted)) throw new Error("carton_empty");
  if (packing.cartons.length >= 1000) throw new Error("too_many_cartons");
  carton.closed = true;
  packing.cartons.push({ number: carton.number + 1, closed: false, goods: [] });
  packing.updatedAt = new Date().toISOString();
  packingSchema.parse(packing);
  return { ...shipment, packing, scope: "pending" };
}
export function changePackingStatus(
  shipment: PackedShipment,
  status: "في الطريق" | "مسلّمة"
): PackedShipment {
  if (shipment.deleted) throw new Error("shipment_deleted");
  if (status === "في الطريق") {
    editable(shipment);
    if (!packingTotals(shipment.packing).pieces)
      throw new Error("shipment_empty");
    if (
      shipment.packing.cartons.some(
        c => !c.closed && c.goods.some(g => !g.deleted)
      )
    )
      throw new Error("close_carton_first");
  } else if (shipment.status !== "في الطريق") throw new Error("not_in_transit");
  return {
    ...shipment,
    status,
    packing: { ...shipment.packing, updatedAt: new Date().toISOString() },
    scope: "pending",
  };
}
export function canonicalPackingShipment(shipment: Shipment): Shipment {
  if (!shipment.packing) return shipment;
  const packing = packingSchema.parse(shipment.packing);
  const totals = packingTotals(packing);
  packingTotalsMRU(packing);
  if (shipment.status !== "قيد التجهيز") {
    if (!totals.pieces) throw new Error("shipment_empty");
    if (packing.cartons.some(c => !c.closed && c.goods.some(g => !g.deleted)))
      throw new Error("close_carton_first");
  }
  return { ...shipment, packing, amount: totals.amount };
}
export type CustomerDirectoryEntry = {
  key: string;
  name: string;
  phones: string[];
  accountIds: string[];
  shipmentIds: string[];
  pieces: number;
  weight: number;
};
export function customerDirectory(
  accounts: readonly Account[],
  shipments: readonly Shipment[]
): CustomerDirectoryEntry[] {
  const map = new Map<string, CustomerDirectoryEntry>();
  const get = (name: string) => {
    const key = normalizeName(name);
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        name,
        phones: [],
        accountIds: [],
        shipmentIds: [],
        pieces: 0,
        weight: 0,
      };
      map.set(key, row);
    }
    return row;
  };
  for (const account of accounts) {
    const row = get(account.name);
    if (account.phone && !row.phones.includes(account.phone))
      row.phones.push(account.phone);
    row.accountIds.push(account.id);
  }
  for (const shipment of shipments)
    if (!shipment.deleted && shipment.packing)
      for (const summary of packingCustomers({
        ...shipment.packing,
        pricePerKg: 0,
      })) {
        const row = get(summary.name);
        row.pieces += summary.pieces;
        row.weight = Math.round((row.weight + summary.weight) * 1000) / 1000;
        row.shipmentIds.push(shipment.id);
        for (const phone of summary.phones)
          if (!row.phones.includes(phone)) row.phones.push(phone);
      }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function shipmentReports(
  shipments: readonly Shipment[],
  now = new Date()
) {
  shipments = shipments.filter(shipment=>!shipment.deleted);
  const isToday = (date: string) => {
    const value = new Date(date);
    return (
      !Number.isNaN(value.valueOf()) &&
      value.getFullYear() === now.getFullYear() &&
      value.getMonth() === now.getMonth() &&
      value.getDate() === now.getDate()
    );
  };
  const shared = shipments.filter(s => s.scope === "shared").length;
  return {
    total: shipments.length,
    today: shipments.filter(s => s.packing && isToday(s.packing.createdAt))
      .length,
    inTransit: shipments.filter(s => s.status === "في الطريق").length,
    delivered: shipments.filter(s => s.status === "مسلّمة").length,
    open: shipments.filter(s => s.status === "قيد التجهيز").length,
    unknownDate: shipments.filter(s => !s.packing).length,
    shared,
    local: shipments.filter(s => s.scope === "local" || !s.scope).length,
    pending: shipments.filter(s => s.scope === "pending").length,
  };
}

export function packingTotalsMRU(
  packing: PackingSession
): PackingTotals | null {
  return packing.pricePerKgMRU === undefined
    ? null
    : goodsTotals(
        packing.cartons.flatMap(c => c.goods),
        packing.pricePerKgMRU
      );
}
export function cartonGroups(
  carton: PackingCarton,
  pricePerKg = 0
): Array<
  PackingTotals & {
    key: string;
    name: string;
    phones: string[];
    entries: PackingGoods[];
    repetitions: number;
  }
> {
  const groups = new Map<string, PackingGoods[]>();
  for (const item of carton.goods) {
    if (item.deleted) continue;
    const key = normalizeName(item.name);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([key, entries]) => ({
    key,
    name: entries[0].name,
    phones: [...new Set(entries.map(g => g.phone).filter(Boolean))],
    entries,
    repetitions: entries.length,
    ...goodsTotals(entries, pricePerKg),
  }));
}
export function matchesPackingGoods(
  item: PackingGoods,
  cartonNumber: number,
  query: string
): boolean {
  const needle = normalizeName(query);
  if (!needle) return true;
  return [item.name, item.phone, String(cartonNumber)].some(value =>
    normalizeName(value).includes(needle)
  );
}
export function matchesShipment(shipment: Shipment, query: string): boolean {
  const needle = normalizeName(query);
  if (!needle) return true;
  return (
    [shipment.tracking, shipment.account, shipment.route].some(value =>
      normalizeName(value).includes(needle)
    ) ||
    Boolean(
      shipment.packing?.cartons.some(c =>
        c.goods.some(g => !g.deleted && matchesPackingGoods(g, c.number, query))
      )
    )
  );
}
export function deletePackingGoods(
  shipment: PackedShipment,
  goodsId: string,
  reason: string
): PackedShipment {
  editable(shipment);
  const packing = structuredClone(shipment.packing);
  const item = packing.cartons
    .flatMap(c => c.goods)
    .find(g => g.id === goodsId);
  if (!item || item.deleted) throw new Error("goods_not_found");
  item.deleted = { at: new Date().toISOString(), reason: reason.trim() };
  packing.updatedAt = item.deleted.at;
  packingSchema.parse(packing);
  return {
    ...shipment,
    packing,
    amount: packingTotals(packing).amount,
    scope: "pending",
  };
}
export function restorePackingGoods(
  shipment: PackedShipment,
  goodsId: string
): PackedShipment {
  editable(shipment);
  const packing = structuredClone(shipment.packing);
  const item = packing.cartons
    .flatMap(c => c.goods)
    .find(g => g.id === goodsId);
  if (!item?.deleted) throw new Error("goods_not_found");
  delete item.deleted;
  packing.updatedAt = new Date().toISOString();
  packingSchema.parse(packing);
  return {
    ...shipment,
    packing,
    amount: packingTotals(packing).amount,
    scope: "pending",
  };
}
