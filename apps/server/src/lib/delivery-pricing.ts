import { eq } from "drizzle-orm";
import {
  computeDeliveryFee,
  DEFAULT_DELIVERY_PRICING,
  type Country,
  type DeliveryPricing,
  type FeeItem,
  type FeeResult,
  type GeoPoint,
} from "@yanabuy/shared";
import { db } from "../db/client";
import { settings } from "../db/schema";

/** Distance / weight delivery pricing, one block per country, saved under one settings key. */
const KEY = "delivery_pricing";

type Saved = Partial<Record<Country, Partial<DeliveryPricing>>>;

/** US starts in miles and pounds; everywhere else in km and kg. Still "area" mode, so nothing changes until an admin switches. */
function defaultsFor(country: Country): DeliveryPricing {
  const d: DeliveryPricing = JSON.parse(JSON.stringify(DEFAULT_DELIVERY_PRICING));
  if (country === "US") {
    d.distance = { ...d.distance, unit: "mi", included: 1, rateCents: 60, maxDistance: 15, bands: [{ upTo: 2, feeCents: 300 }, { upTo: 5, feeCents: 500 }, { upTo: 10, feeCents: 800 }] };
    d.weight = { ...d.weight, unit: "lb", included: 10, rateCents: 10, maxWeight: 100, defaultItemWeight: 1, heavyOver: 40, bands: [{ upTo: 10, feeCents: 0 }, { upTo: 30, feeCents: 200 }, { upTo: 60, feeCents: 500 }] };
    d.minFeeCents = 300;
    d.maxFeeCents = 3000;
  }
  return d;
}

function merge(country: Country, saved?: Partial<DeliveryPricing>): DeliveryPricing {
  const base = defaultsFor(country);
  if (!saved) return base;
  return { ...base, ...saved, distance: { ...base.distance, ...(saved.distance ?? {}) }, weight: { ...base.weight, ...(saved.weight ?? {}) } };
}

async function readAll(): Promise<Saved> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  return (row?.value ?? {}) as Saved;
}

export async function getDeliveryPricing(country: Country): Promise<DeliveryPricing> {
  return merge(country, (await readAll())[country]);
}

export async function saveDeliveryPricing(country: Country, value: DeliveryPricing, adminId: string) {
  const all = { ...(await readAll()), [country]: value };
  const now = new Date();
  await db
    .insert(settings)
    .values({ key: KEY, value: all, updatedAt: now, updatedById: adminId })
    .onConflictDoUpdate({ target: settings.key, set: { value: all, updatedAt: now, updatedById: adminId } });
  return getDeliveryPricing(country);
}

/** Plain words for why a shop can't deliver an order. */
export function feeProblem(r: Extract<FeeResult, { ok: false }>, p: DeliveryPricing): string | null {
  if (r.reason === "too_far") {
    const max = p.distance.method === "bands" ? p.distance.bands.at(-1)?.upTo : p.distance.maxDistance;
    return `This shop doesn't deliver that far${max != null ? ` (up to ${max} ${p.distance.unit})` : ""}. Pick a closer drop-off spot.`;
  }
  if (r.reason === "too_heavy") {
    const max = p.weight.method === "bands" ? p.weight.bands.at(-1)?.upTo : p.weight.maxWeight;
    return `This order is too heavy to deliver${max != null ? ` (up to ${max} ${p.weight.unit})` : ""}. Remove some items.`;
  }
  return null; // no_location: fall back to area fees
}

/** Distance pricing for one shop's order. null = not in distance mode or a pin is missing → use the area / flat fee. */
export function distanceFee(p: DeliveryPricing, pickup: GeoPoint | null, dropoff: GeoPoint | null, items: FeeItem[], isRestaurant: boolean) {
  if (p.mode !== "distance") return null;
  const r = computeDeliveryFee({ pricing: p, pickup, dropoff, items, isRestaurant });
  if (!r.ok && r.reason === "no_location") return null;
  return r;
}
