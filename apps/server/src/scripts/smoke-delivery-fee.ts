// apps/server/src/scripts/smoke-delivery-fee.ts — run: npx tsx src/scripts/smoke-delivery-fee.ts
import {
  computeDeliveryFee, validatePricing, DEFAULT_DELIVERY_PRICING, switchDistanceUnit, switchWeightUnit,
  straightLineMetres, DeliveryPricing, LatLng, M_PER_MI,
} from "@yanabuy/shared";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  if (cond) pass++; else { fail++; console.log("FAIL:", name, extra ?? ""); }
};
const clone = (): DeliveryPricing => JSON.parse(JSON.stringify(DEFAULT_DELIVERY_PRICING));

const shop: LatLng = { lat: 6.3, lng: -10.8 };
// point exactly `km` north of the shop (straight line)
const north = (km: number): LatLng => ({ lat: shop.lat + km / 111.19508, lng: shop.lng });

// 1. haversine sanity
check("haversine 5 km", Math.abs(straightLineMetres(shop, north(5)) - 5000) < 2, straightLineMetres(shop, north(5)));

// 2. rate mode: 0.75 + (6 - 2) × 0.40 = 2.35 → rounds up to 2.40
{
  const p = clone(); p.mode = "distance"; p.distance.roadFactor = 1;
  const r = computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north(6), items: [{ qty: 1, weightGrams: 500 }], isRestaurant: false });
  check("rate ok", r.ok);
  if (r.ok) {
    check("rate distance fee 235", r.distanceFeeCents === 235, r);
    check("rate rounded 240", r.feeCents === 240, r);
    check("billed 6 km", r.billedDistance === 6, r);
  }
}

// 3. short trip hits minimum
{
  const p = clone(); p.distance.roadFactor = 1; p.minFeeCents = 100;
  const r = computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north(0.5), items: [], isRestaurant: false });
  check("minimum fee", r.ok && r.feeCents === 100, r);
}

// 4. too far (rate max 25 km)
{
  const p = clone(); p.distance.roadFactor = 1;
  const r = computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north(30), items: [], isRestaurant: false });
  check("too far rate", !r.ok && r.reason === "too_far", r);
}

// 5. road factor 1.3 makes 10 km straight → 13 km
{
  const p = clone();
  const r = computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north(10), items: [], isRestaurant: false });
  check("road factor", r.ok && Math.abs(r.billedDistance - 13) < 0.02, r);
}

// 6. bands mode
{
  const p = clone(); p.distance.method = "bands"; p.distance.roadFactor = 1;
  const at = (km: number) => computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north(km), items: [], isRestaurant: false });
  const a = at(2.5), b = at(5), c = at(9.9), d = at(21);
  check("band 0-3 → 100", a.ok && a.feeCents === 100, a);
  check("band 3-6 → 200", b.ok && b.feeCents === 200, b);
  check("band 6-10 → 350", c.ok && c.feeCents === 350, c);
  check("past last band → too far", !d.ok && d.reason === "too_far", d);
}

// 7. no location
{
  const r = computeDeliveryFee({ pricing: clone(), pickup: null, dropoff: north(1), items: [], isRestaurant: false });
  check("no location", !r.ok && r.reason === "no_location");
}

// 8. weight rate: 12 kg, 5 included, 0.20/kg → +1.40
{
  const p = clone(); p.distance.roadFactor = 1; p.weight.enabled = true;
  const r = computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north(2), items: [{ qty: 3, weightGrams: 4000 }], isRestaurant: false });
  check("weight ok", r.ok, r);
  if (r.ok) {
    check("weight 12 kg", r.billedWeight === 12, r);
    check("weight fee 140", r.weightFeeCents === 140, r);
    check("total 75 + 140 = 215 → 220", r.feeCents === 220, r);
    check("not heavy (20 kg limit)", r.heavy === false, r);
  }
}

// 9. heavy flag + default weight for items without weight
{
  const p = clone(); p.distance.roadFactor = 1; p.weight.enabled = true;
  const r = computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north(2), items: [{ qty: 5, weightGrams: 5000 }, { qty: 2 }], isRestaurant: false });
  check("heavy", r.ok && r.heavy === true && r.weightG === 26000 && r.usedDefaultWeight === true, r);
}

// 10. too heavy (rate max 50 kg)
{
  const p = clone(); p.weight.enabled = true; p.distance.roadFactor = 1;
  const r = computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north(2), items: [{ qty: 6, weightGrams: 10000 }], isRestaurant: false });
  check("too heavy", !r.ok && r.reason === "too_heavy", r);
}

// 11. weight bands
{
  const p = clone(); p.weight.enabled = true; p.weight.method = "bands"; p.distance.roadFactor = 1;
  const r = computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north(2), items: [{ qty: 1, weightGrams: 10000 }], isRestaurant: false });
  check("weight band 5-15 → +100", r.ok && r.weightFeeCents === 100, r);
  const r2 = computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north(2), items: [{ qty: 1, weightGrams: 31000 }], isRestaurant: false });
  check("past last weight band", !r2.ok && r2.reason === "too_heavy", r2);
}

// 12. restaurants skip weight unless turned on
{
  const p = clone(); p.weight.enabled = true; p.distance.roadFactor = 1;
  const r = computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north(2), items: [{ qty: 1, weightGrams: 12000 }], isRestaurant: true });
  check("restaurant no weight fee", r.ok && r.weightFeeCents === 0, r);
  p.weight.applyToRestaurants = true;
  const r2 = computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north(2), items: [{ qty: 1, weightGrams: 12000 }], isRestaurant: true });
  check("restaurant weight when on", r2.ok && r2.weightFeeCents === 140, r2);
}

// 13. miles: 0.75 + (4 mi - 1 mi) × 0.60 = 2.55 → 2.60
{
  const p = clone(); p.distance.roadFactor = 1; p.distance.unit = "mi"; p.distance.included = 1; p.distance.rateCents = 60; p.distance.maxDistance = 20;
  const r = computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north((4 * M_PER_MI) / 1000), items: [], isRestaurant: false });
  check("miles fee", r.ok && r.billedDistance === 4 && r.feeCents === 260, r);
}

// 14. max fee cap
{
  const p = clone(); p.distance.roadFactor = 1; p.maxFeeCents = 500;
  const r = computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north(24), items: [], isRestaurant: false });
  check("max fee cap", r.ok && r.feeCents === 500, r);
}

// 15. switching units keeps the price about the same
{
  const p = clone(); p.distance.roadFactor = 1;
  const km = computeDeliveryFee({ pricing: p, pickup: shop, dropoff: north(8), items: [], isRestaurant: false });
  const p2 = { ...p, distance: switchDistanceUnit(p.distance, "mi") };
  const mi = computeDeliveryFee({ pricing: p2, pickup: shop, dropoff: north(8), items: [], isRestaurant: false });
  check("unit switch same price", km.ok && mi.ok && Math.abs(km.feeCents - mi.feeCents) <= 10, { km, mi });
  const w2 = switchWeightUnit(p.weight, "lb");
  check("kg → lb", w2.unit === "lb" && Math.abs(w2.included - 11.02) < 0.01, w2);
}

// 16. validation
{
  check("defaults valid", validatePricing(clone()).length === 0, validatePricing(clone()));
  const bad = clone(); bad.distance.method = "bands"; bad.distance.bands = [{ upTo: 5, feeCents: 100 }, { upTo: 3, feeCents: 200 }];
  check("bands out of order rejected", validatePricing(bad).length > 0);
  const bad2 = clone(); bad2.maxFeeCents = 50;
  check("max < min rejected", validatePricing(bad2).length > 0);
  const bad3 = clone(); bad3.distance.roadFactor = 0.5;
  check("road factor < 1 rejected", validatePricing(bad3).length > 0);
}

console.log(`delivery-fee checks: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
