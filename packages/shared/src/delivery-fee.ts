// packages/shared/src/delivery-fee.ts
// Delivery fee by distance (and optionally weight). Pure functions: no DB, no network.
// Money is whole cents, distance is stored in metres, weight in grams.
// The admin enters values in their chosen unit (km/mi, kg/lb); this file converts.

export type DistanceUnit = "km" | "mi";
export type WeightUnit = "kg" | "lb";
export type PriceMethod = "rate" | "bands";

/** One price band. upTo is in the admin's unit (km/mi or kg/lb). */
export interface PriceBand {
  upTo: number;
  feeCents: number;
}

export interface DistancePricing {
  unit: DistanceUnit;
  method: PriceMethod;
  /** rate: charged on every order */
  baseCents: number;
  /** rate: distance covered by the base fee */
  included: number;
  /** rate: price per km/mile after the included distance */
  rateCents: number;
  /** bands: sorted by upTo; past the last band = too far */
  bands: PriceBand[];
  /** straight line × roadFactor ≈ road distance (e.g. 1.3) */
  roadFactor: number;
  /** rate: max delivery distance (null = no limit). Bands use the last band. */
  maxDistance: number | null;
}

export interface WeightPricing {
  enabled: boolean;
  unit: WeightUnit;
  method: PriceMethod;
  /** rate: weight carried at no extra cost */
  included: number;
  /** rate: surcharge per kg/lb above the included weight */
  rateCents: number;
  /** bands: surcharge per band; past the last band = too heavy */
  bands: PriceBand[];
  /** rate: heaviest order allowed (null = no limit). Bands use the last band. */
  maxWeight: number | null;
  /** weight used for items whose product has no weight set */
  defaultItemWeight: number;
  /** restaurant (food) orders skip the weight surcharge unless this is on */
  applyToRestaurants: boolean;
  /** orders heavier than this need a keke or car rider (null = off) */
  heavyOver: number | null;
}

export interface DeliveryPricing {
  mode: "area" | "distance";
  distance: DistancePricing;
  weight: WeightPricing;
  minFeeCents: number;
  maxFeeCents: number | null;
  /** round the total up to this many cents (e.g. 10 → $2.35 becomes $2.40) */
  roundToCents: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface FeeItem {
  qty: number;
  /** product or variant weight in grams; null/undefined = use the default */
  weightGrams?: number | null;
}

export interface FeeInput {
  pricing: DeliveryPricing;
  pickup: LatLng | null;
  dropoff: LatLng | null;
  items: FeeItem[];
  isRestaurant: boolean;
}

export interface FeeBreakdown {
  distanceM: number; // estimated road distance, metres
  billedDistance: number; // in pricing.distance.unit, 2 decimals
  distanceUnit: DistanceUnit;
  weightG: number;
  billedWeight: number; // in pricing.weight.unit, 2 decimals
  weightUnit: WeightUnit;
  distanceFeeCents: number;
  weightFeeCents: number;
  subtotalCents: number; // before rounding and min/max
  feeCents: number; // what the buyer pays
  heavy: boolean; // needs keke/car rider
  usedDefaultWeight: boolean; // at least one item had no weight
}

export type FeeResult =
  | ({ ok: true } & FeeBreakdown)
  | { ok: false; reason: "no_location" | "too_far" | "too_heavy"; distanceM?: number; weightG?: number };

export const M_PER_KM = 1000;
export const M_PER_MI = 1609.344;
export const G_PER_KG = 1000;
export const G_PER_LB = 453.59237;

export const metresToUnit = (m: number, u: DistanceUnit) => m / (u === "km" ? M_PER_KM : M_PER_MI);
export const unitToMetres = (v: number, u: DistanceUnit) => v * (u === "km" ? M_PER_KM : M_PER_MI);
export const gramsToUnit = (g: number, u: WeightUnit) => g / (u === "kg" ? G_PER_KG : G_PER_LB);
export const unitToGrams = (v: number, u: WeightUnit) => v * (u === "kg" ? G_PER_KG : G_PER_LB);

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Straight-line distance in metres (haversine). */
export function straightLineMetres(a: LatLng, b: LatLng): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Band lookup: first band whose upTo ≥ value, or null when past the last band. */
function bandFee(bands: PriceBand[], value: number): number | null {
  for (const b of bands) if (value <= b.upTo + 1e-9) return b.feeCents;
  return null;
}

/** Weight of an order in grams; items with no weight use the default. */
export function orderWeightGrams(items: FeeItem[], w: WeightPricing): { grams: number; usedDefault: boolean } {
  const fallback = unitToGrams(w.defaultItemWeight, w.unit);
  let grams = 0;
  let usedDefault = false;
  for (const it of items) {
    const qty = Math.max(0, Math.floor(it.qty));
    let each = it.weightGrams;
    if (each == null || !(each > 0)) {
      each = fallback;
      if (qty > 0) usedDefault = true;
    }
    grams += each * qty;
  }
  return { grams: Math.round(grams), usedDefault };
}

export function computeDeliveryFee(input: FeeInput): FeeResult {
  const { pricing: p, pickup, dropoff, items, isRestaurant } = input;
  if (!pickup || !dropoff) return { ok: false, reason: "no_location" };

  // ---- distance ----
  const d = p.distance;
  const distanceM = Math.round(straightLineMetres(pickup, dropoff) * Math.max(1, d.roadFactor));
  const dist = metresToUnit(distanceM, d.unit);

  let distanceFeeCents: number;
  if (d.method === "bands") {
    const fee = bandFee(d.bands, dist);
    if (fee == null) return { ok: false, reason: "too_far", distanceM };
    distanceFeeCents = fee;
  } else {
    if (d.maxDistance != null && dist > d.maxDistance + 1e-9) return { ok: false, reason: "too_far", distanceM };
    distanceFeeCents = d.baseCents + Math.max(0, dist - d.included) * d.rateCents;
  }

  // ---- weight ----
  const w = p.weight;
  const { grams: weightG, usedDefault } = orderWeightGrams(items, w);
  const wt = gramsToUnit(weightG, w.unit);
  let weightFeeCents = 0;
  const weightApplies = w.enabled && (!isRestaurant || w.applyToRestaurants);
  if (weightApplies) {
    if (w.method === "bands") {
      const fee = bandFee(w.bands, wt);
      if (fee == null) return { ok: false, reason: "too_heavy", distanceM, weightG };
      weightFeeCents = fee;
    } else {
      if (w.maxWeight != null && wt > w.maxWeight + 1e-9) return { ok: false, reason: "too_heavy", distanceM, weightG };
      weightFeeCents = Math.max(0, wt - w.included) * w.rateCents;
    }
  }
  const heavy = w.enabled && w.heavyOver != null && wt > w.heavyOver + 1e-9;

  // ---- total: round up, then min / max ----
  const subtotalCents = distanceFeeCents + weightFeeCents;
  const step = Math.max(1, Math.round(p.roundToCents));
  let feeCents = Math.ceil(Math.round(subtotalCents * 1000) / 1000 / step) * step;
  feeCents = Math.max(feeCents, p.minFeeCents);
  if (p.maxFeeCents != null) feeCents = Math.min(feeCents, p.maxFeeCents);

  return {
    ok: true,
    distanceM,
    billedDistance: round2(dist),
    distanceUnit: d.unit,
    weightG,
    billedWeight: round2(wt),
    weightUnit: w.unit,
    distanceFeeCents: Math.round(distanceFeeCents),
    weightFeeCents: Math.round(weightFeeCents),
    subtotalCents: Math.round(subtotalCents),
    feeCents,
    heavy,
    usedDefaultWeight: usedDefault,
  };
}

/** Checks admin input before saving. Returns a list of problems (empty = fine). */
export function validatePricing(p: DeliveryPricing): string[] {
  const errs: string[] = [];
  const nonNeg = (v: number, name: string) => {
    if (!Number.isFinite(v) || v < 0) errs.push(`${name} must be 0 or more`);
  };
  const checkBands = (bands: PriceBand[], name: string) => {
    if (bands.length === 0) errs.push(`${name}: add at least one band`);
    if (bands.length > 30) errs.push(`${name}: at most 30 bands`);
    let prev = 0;
    bands.forEach((b, i) => {
      if (!(b.upTo > prev)) errs.push(`${name}: band ${i + 1} must end after ${prev}`);
      nonNeg(b.feeCents, `${name} band ${i + 1} fee`);
      prev = b.upTo;
    });
  };

  const d = p.distance;
  if (d.unit !== "km" && d.unit !== "mi") errs.push("Distance unit must be km or mi");
  if (!(d.roadFactor >= 1 && d.roadFactor <= 3)) errs.push("Road factor must be between 1 and 3");
  if (d.method === "bands") checkBands(d.bands, "Distance bands");
  else {
    nonNeg(d.baseCents, "Base fee");
    nonNeg(d.included, "Included distance");
    nonNeg(d.rateCents, "Rate per distance");
    if (d.maxDistance != null && !(d.maxDistance > 0)) errs.push("Max distance must be more than 0");
  }

  const w = p.weight;
  if (w.enabled) {
    if (w.unit !== "kg" && w.unit !== "lb") errs.push("Weight unit must be kg or lb");
    nonNeg(w.defaultItemWeight, "Default item weight");
    if (w.method === "bands") checkBands(w.bands, "Weight bands");
    else {
      nonNeg(w.included, "Included weight");
      nonNeg(w.rateCents, "Rate per weight");
      if (w.maxWeight != null && !(w.maxWeight > 0)) errs.push("Max weight must be more than 0");
    }
    if (w.heavyOver != null && !(w.heavyOver > 0)) errs.push("Heavy-order limit must be more than 0");
  }

  nonNeg(p.minFeeCents, "Minimum fee");
  if (p.maxFeeCents != null && p.maxFeeCents < p.minFeeCents) errs.push("Maximum fee must be at least the minimum fee");
  if (!(p.roundToCents >= 1 && p.roundToCents <= 100)) errs.push("Round to must be between 1 and 100 cents");
  return errs;
}

/** Sensible starting settings (Liberia-style, USD). Admin changes these. */
export const DEFAULT_DELIVERY_PRICING: DeliveryPricing = {
  mode: "area",
  distance: {
    unit: "km",
    method: "rate",
    baseCents: 75,
    included: 2,
    rateCents: 40,
    bands: [
      { upTo: 3, feeCents: 100 },
      { upTo: 6, feeCents: 200 },
      { upTo: 10, feeCents: 350 },
      { upTo: 20, feeCents: 500 },
    ],
    roadFactor: 1.3,
    maxDistance: 25,
  },
  weight: {
    enabled: false,
    unit: "kg",
    method: "rate",
    included: 5,
    rateCents: 20,
    bands: [
      { upTo: 5, feeCents: 0 },
      { upTo: 15, feeCents: 100 },
      { upTo: 30, feeCents: 300 },
    ],
    maxWeight: 50,
    defaultItemWeight: 0.5,
    applyToRestaurants: false,
    heavyOver: 20,
  },
  minFeeCents: 75,
  maxFeeCents: 1500,
  roundToCents: 10,
};

/** Converts a pricing block when the admin switches units, so prices stay the same in real terms. */
export function switchDistanceUnit(d: DistancePricing, to: DistanceUnit): DistancePricing {
  if (d.unit === to) return d;
  const f = metresToUnit(unitToMetres(1, d.unit), to); // 1 old unit in new units
  return {
    ...d,
    unit: to,
    included: round2(d.included * f),
    rateCents: Math.round(d.rateCents / f),
    maxDistance: d.maxDistance == null ? null : round2(d.maxDistance * f),
    bands: d.bands.map((b) => ({ ...b, upTo: round2(b.upTo * f) })),
  };
}

export function switchWeightUnit(w: WeightPricing, to: WeightUnit): WeightPricing {
  if (w.unit === to) return w;
  const f = gramsToUnit(unitToGrams(1, w.unit), to);
  return {
    ...w,
    unit: to,
    included: round2(w.included * f),
    rateCents: Math.round(w.rateCents / f),
    maxWeight: w.maxWeight == null ? null : round2(w.maxWeight * f),
    defaultItemWeight: round2(w.defaultItemWeight * f),
    heavyOver: w.heavyOver == null ? null : round2(w.heavyOver * f),
    bands: w.bands.map((b) => ({ ...b, upTo: round2(b.upTo * f) })),
  };
}

/** "6.1 km · 12 kg" for checkout and order pages (weight only when it was charged). */
export function deliveryDetailLabel(d: { billedDistance: number; distanceUnit: DistanceUnit; billedWeight: number; weightUnit: WeightUnit; weightCharged?: boolean }) {
  const dist = `${d.billedDistance} ${d.distanceUnit}`;
  return d.weightCharged === false ? dist : `${dist} · ${d.billedWeight} ${d.weightUnit}`;
}
