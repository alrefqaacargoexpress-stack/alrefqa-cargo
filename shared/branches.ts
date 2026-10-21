import { z } from "zod";
import type {
  Account,
  AppRole,
  Entity,
  EntityRecord,
  Invoice,
  Shipment,
} from "./operations";
export const officeIds = ["nouakchott", "dubai", "china", "turkey"] as const;
export type OfficeId = (typeof officeIds)[number];
export const officeIdSchema = z.enum(officeIds);
export const officeNames = {
  ar: { nouakchott: "نواكشوط", dubai: "دبي", china: "الصين", turkey: "تركيا" },
  en: {
    nouakchott: "Nouakchott",
    dubai: "Dubai",
    china: "China",
    turkey: "Turkey",
  },
  zh: {
    nouakchott: "努瓦克肖特",
    dubai: "迪拜",
    china: "中国",
    turkey: "土耳其",
  },
  tr: {
    nouakchott: "Nuakşot",
    dubai: "Dubai",
    china: "Çin",
    turkey: "Türkiye",
  },
} as const;
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const timeSpan = z
  .object({ start: clock, end: clock })
  .strict()
  .refine(x => x.start < x.end, { message: "invalid_time_range" });
export const workDaySchema = z
  .object({
    day: z.number().int().min(0).max(6),
    closed: z.boolean(),
    work: timeSpan.nullable(),
    break: timeSpan.nullable(),
  })
  .strict()
  .superRefine((v, c) => {
    if (!v.closed && !v.work)
      c.addIssue({ code: "custom", message: "work_hours_required" });
    if (
      v.break &&
      (!v.work || v.break.start < v.work.start || v.break.end > v.work.end)
    )
      c.addIssue({ code: "custom", message: "break_outside_work" });
  });
export const publicEmployeeSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    name: z.string().trim().min(1).max(240),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{5,40}$/)
      .refine(value => value.replace(/\D/g, "").length >= 5, {
        message: "invalid_phone",
      }),
  })
  .strict();
export const officeProfileSchema = z
  .object({
    officeId: officeIdSchema,
    address: z.string().trim().max(1000),
    phone: z.string().trim().max(64),
    timezone: z.enum([
      "Africa/Nouakchott",
      "Asia/Dubai",
      "Asia/Shanghai",
      "Europe/Istanbul",
    ]),
    gps: z
      .object({
        lat: z.number().finite().min(-90).max(90),
        lng: z.number().finite().min(-180).max(180),
      })
      .strict()
      .nullable(),
    hours: z.array(workDaySchema).max(7),
    employees: z.array(publicEmployeeSchema).max(100),
  })
  .strict()
  .superRefine((v, c) => {
    if (new Set(v.hours.map(x => x.day)).size !== v.hours.length)
      c.addIssue({ code: "custom", message: "duplicate_work_day" });
    if (new Set(v.employees.map(x => x.id)).size !== v.employees.length)
      c.addIssue({ code: "custom", message: "duplicate_employee" });
    if (
      v.phone &&
      (!/^\+?[0-9 ()-]{5,40}$/.test(v.phone) ||
        v.phone.replace(/\D/g, "").length < 5)
    )
      c.addIssue({ code: "custom", message: "invalid_phone" });
  });
export type OfficeProfile = z.infer<typeof officeProfileSchema>;
export type VersionedOfficeProfile = OfficeProfile & { version: number };
export const officeProfileUpdateSchema = officeProfileSchema.safeExtend({
  expectedVersion: z.number().int().nonnegative(),
});
export const assignedRoles = [
  "staff",
  "accountant",
  "viewer",
  "tracking_staff",
  "supervisor",
] as const;
export const officeMembershipSchema = z
  .object({
    userId: z.number().int().positive(),
    offices: z.array(officeIdSchema).max(4),
    role: z.enum(assignedRoles),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict()
  .refine(v => new Set(v.offices).size === v.offices.length, {
    message: "duplicate_office",
  });
export type OfficeMember = {
  userId: number;
  name: string;
  email: string;
  role: AppRole | null;
  offices: OfficeId[] | null;
  version: number;
};
export function defaultOfficeProfile(
  officeId: OfficeId
): VersionedOfficeProfile {
  const timezone = (
    {
      nouakchott: "Africa/Nouakchott",
      dubai: "Asia/Dubai",
      china: "Asia/Shanghai",
      turkey: "Europe/Istanbul",
    } as const
  )[officeId];
  return {
    officeId,
    address: "",
    phone: "",
    timezone,
    gps: null,
    hours: [],
    employees: [],
    version: 0,
  };
}
export function ownerOffice(
  entity: Entity,
  record: EntityRecord
): OfficeId | null {
  if (record.officeId) return record.officeId;
  if (entity === "shipment") {
    const shipment = record as Shipment;
    return shipment.packing?.source ?? null;
  }
  return null;
}
export function shipmentOffices(shipment: Shipment): OfficeId[] {
  const offices = new Set<OfficeId>();
  const origin = ownerOffice("shipment", shipment);
  if (origin) offices.add(origin);
  if (shipment.packing?.source) offices.add(shipment.packing.source);
  const branch = shipment.journey?.branch;
  if (branch && officeIds.includes(branch as OfficeId))
    offices.add(branch as OfficeId);
  if (
    ["to_nouakchott", "arrived_office"].includes(shipment.journey?.stage ?? "")
  )
    offices.add("nouakchott");
  return [...offices];
}
export function recordBelongsToOffice(
  entity: Entity,
  record: EntityRecord,
  officeId: OfficeId
) {
  return entity === "shipment"
    ? shipmentOffices(record as Shipment).includes(officeId)
    : ownerOffice(entity, record) === officeId;
}
export function canReadOfficeRecord(
  role: AppRole | null,
  offices: OfficeId[] | null,
  entity: Entity,
  record: EntityRecord
) {
  if (!role) return false;
  if (role === "admin" || offices === null) return true;
  return offices.some(id => recordBelongsToOffice(entity, record, id));
}
export function canWriteOfficeRecord(
  role: AppRole | null,
  offices: OfficeId[] | null,
  entity: Entity,
  record: EntityRecord
) {
  if (!role) return false;
  if (role === "admin" || offices === null) return true;
  const home = ownerOffice(entity, record);
  return home !== null && offices.includes(home);
}
export function mapsHref(gps: OfficeProfile["gps"]) {
  return gps
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${gps.lat},${gps.lng}`)}`
    : null;
}
export type OfficeDashboardData = {
  profile: VersionedOfficeProfile;
  shipments: Shipment[];
  accounts: Account[];
  invoices: Invoice[];
  financial: boolean;
};
