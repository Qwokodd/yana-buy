import { eq } from "drizzle-orm";
import type { Country, DeliverySettings, PaymentMethod } from "@yanabuy/shared";
import { db } from "../db/client";
import { settings } from "../db/schema";
import { mtnConfigured } from "./payments/mtn";

const KEY = "delivery";

export const DEFAULT_DELIVERY: DeliverySettings = {
  fee: 100, // $1.00
  freeOver: null,
  methods: { cod: true, mtn_momo: false, orange_money: false, card: false },
  areas: [],
  countryFees: {},
};

/** Mobile money (MTN, Orange) only works in Liberia. */
const LIBERIA_ONLY: PaymentMethod[] = ["mtn_momo", "orange_money"];

/** A way to pay can only be switched on once its provider is set up in the server settings. */
export function readyMethods() {
  const ready = new Set<string>(["cod"]);
  if (mtnConfigured()) ready.add("mtn_momo");
  return ready;
}

export async function getDelivery(): Promise<DeliverySettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  const saved = (row?.value ?? {}) as Partial<DeliverySettings>;
  const merged = { ...DEFAULT_DELIVERY, ...saved, methods: { ...DEFAULT_DELIVERY.methods, ...(saved.methods ?? {}) }, areas: (saved.areas ?? []).map((a) => ({ ...a, country: a.country ?? "LR" })), countryFees: saved.countryFees ?? {} };
  for (const m of Object.keys(merged.methods) as (keyof DeliverySettings["methods"])[]) {
    if (!readyMethods().has(m)) merged.methods[m] = false;
  }
  return merged;
}

export async function saveDelivery(value: DeliverySettings, adminId: string) {
  const now = new Date();
  await db
    .insert(settings)
    .values({ key: KEY, value, updatedAt: now, updatedById: adminId })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now, updatedById: adminId } });
  return getDelivery();
}

/** Areas buyers in a country can pick from right now. */
export const activeAreas = (s: DeliverySettings, country: Country = "LR") => s.areas.filter((a) => a.active && a.country === country);

/** The flat fee and free-over amount for a country (Liberia uses the top-level ones). */
export function baseFee(s: DeliverySettings, country: Country = "LR") {
  return (country !== "LR" && s.countryFees[country]) || { fee: s.fee, freeOver: s.freeOver };
}

/** The fee for one shop's order: the area's fee when areas are used, otherwise the flat fee. Free above the "free from" amount. */
export function feeFor(subtotal: number, s: DeliverySettings, areaId?: string | null, country: Country = "LR") {
  const base = baseFee(s, country);
  if (base.freeOver !== null && subtotal >= base.freeOver) return 0;
  const area = areaId ? activeAreas(s, country).find((a) => a.id === areaId) : undefined;
  return area ? area.fee : base.fee;
}

/** Whether a way to pay can be used for orders in this country. */
export const methodOn = (s: DeliverySettings, method: PaymentMethod, country: Country = "LR") => s.methods[method] && (country === "LR" || !LIBERIA_ONLY.includes(method));
