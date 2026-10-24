/**
 * End-to-end check of delivery fees by distance and weight — admin settings, cart quote, checkout
 * against a running server.   npx tsx src/scripts/smoke-delivery-pricing.ts
 * Needs the admin from README (0770000001 / adminpass123). Uses throwaway accounts.
 * Puts Liberia's distance pricing back the way it was at the end.
 */
import fs from "node:fs";

const BASE = process.env.API ?? "http://localhost:4000";
let passed = 0;

function check(cond: unknown, label: string, extra?: unknown) {
  if (!cond) {
    console.error(`❌ ${label}`, extra === undefined ? "" : JSON.stringify(extra, null, 1));
    throw new Error(label);
  }
  passed++;
  console.log(`✅ ${label}`);
}

async function call(method: string, p: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0)
);
function photos(count: number) {
  const form = new FormData();
  for (let i = 0; i < count; i++) form.append("images", new Blob([PNG], { type: "image/png" }), `p${i}.png`);
  return form;
}

// Sellers need a confirmed email: the code is read from the dev outbox file (as in smoke-notify).
const OUTBOX = process.env.OUTBOX ?? "/tmp/yb-outbox.jsonl";
const lastCode = (to: string) => {
  const lines = fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean) : [];
  const m = lines.map((l) => JSON.parse(l)).reverse().find((s: any) => s.channel === "email" && s.to === to && /code is (\d{6})/.test(s.text));
  return m ? /code is (\d{6})/.exec(m.text)![1] : null;
};

const n = String(Date.now()).slice(-7);
let r = await call("POST", "/api/auth/login", { phone: "0770000001", password: "adminpass123" });
const admin = r.data.accessToken as string;

async function person(prefix: string, name: string) {
  const reg = await call("POST", "/api/auth/register", { fullName: name, phone: `0${prefix}${n}`, email: `${crypto.randomUUID().slice(0, 12)}@test.yanabuy.com`, password: "password123" });
  return { token: reg.data.accessToken as string, id: reg.data.user.id as string };
}

const original = (await call("GET", "/api/admin/delivery-pricing/LR", undefined, admin)).data.pricing;

try {
  // ─── Admin settings ───────────────────────────────────────────────────────
  check(original?.mode === "area" || original?.mode === "distance", "admin reads Liberia's pricing");
  r = await call("GET", "/api/admin/delivery-pricing/LR");
  check(r.status === 401, "only signed-in admins can read it");
  r = await call("GET", "/api/admin/delivery-pricing/XX", undefined, admin);
  check(r.status === 400, "unknown country is refused");
  const bad = { ...original, distance: { ...original.distance, method: "bands", bands: [{ upTo: 5, feeCents: 100 }, { upTo: 3, feeCents: 200 }] } };
  r = await call("PUT", "/api/admin/delivery-pricing/LR", bad, admin);
  check(r.status === 400, "bands out of order are refused", r.data);

  const pricing = {
    ...original,
    mode: "distance",
    distance: { ...original.distance, unit: "km", method: "rate", baseCents: 75, included: 2, rateCents: 40, roadFactor: 1, maxDistance: 25 },
    weight: { ...original.weight, enabled: true, unit: "kg", method: "rate", included: 5, rateCents: 20, maxWeight: 50, defaultItemWeight: 0.5, applyToRestaurants: false, heavyOver: 20 },
    minFeeCents: 75,
    maxFeeCents: 1500,
    roundToCents: 10,
  };
  r = await call("PUT", "/api/admin/delivery-pricing/LR", pricing, admin);
  check(r.status === 200 && r.data.pricing.mode === "distance" && r.data.pricing.weight.enabled, "admin switches Liberia to distance + weight", r.data);

  // ─── A shop with a pin and a 4 kg product ────────────────────────────────
  const seller = await person("87", "Heavy Goods Owner");
  const sellerEmail = `heavy${n}@test.yanabuy.com`;
  await call("POST", "/api/me/email", { email: sellerEmail }, seller.token);
  r = await call("POST", "/api/me/email/verify", { code: lastCode(sellerEmail) }, seller.token);
  check(r.status === 200, "seller confirms their email", r.data);
  const up = await call("POST", "/api/uploads/private", photos(2), seller.token);
  const app = await call(
    "POST",
    "/api/shop/apply",
    { kind: "store", name: `Heavy Goods ${n}`, phone: `087${n}`, city: "Monrovia", address: "Broad Street", idType: "passport", idFrontKey: up.data.files[0].key, selfieKey: up.data.files[1].key },
    seller.token
  );
  check(app.status === 201 || app.status === 200, "seller applies for a shop", app.data);
  await call("POST", `/api/admin/shops/${app.data.shop.id}/approve`, undefined, admin);
  const shopPin = { lat: 6.3, lng: -10.8 };
  r = await call("PUT", "/api/shop/mine/location", shopPin, seller.token);
  check(r.status === 200, "shop puts its pin on the map", r.data);
  const cats = (await call("GET", "/api/public/categories?kind=goods")).data.items;
  const img = (await call("POST", "/api/uploads", photos(1), seller.token)).data.urls;
  r = await call("POST", "/api/shop/products", { name: "Bag of rice", price: 500, images: img, categoryId: cats[0].id, weightGrams: 4000 }, seller.token);
  check(r.status === 201 && r.data.product.weightGrams === 4000, "seller gives the product a weight (4 kg)", r.data);
  const rice = r.data.product.id;
  await call("POST", `/api/admin/products/${rice}/approve`, undefined, admin);
  r = await call("POST", "/api/shop/products", { name: "Too heavy", price: 500, images: img, categoryId: cats[0].id, weightGrams: 0 }, seller.token);
  check(r.status === 400 && r.data.fields?.weightGrams, "weight must be more than 0");

  // ─── Quote ────────────────────────────────────────────────────────────────
  const north = (km: number) => ({ lat: shopPin.lat + km / 111.19508, lng: shopPin.lng });
  const buyer = await person("57", "Kofi Buyer");
  const items = [{ productId: rice, quantity: 3 }]; // 12 kg
  const delivery = (await call("GET", "/api/admin/settings/delivery", undefined, admin)).data.delivery;
  const free = delivery.freeOver !== null && 1500 >= delivery.freeOver;

  r = await call("POST", "/api/cart/quote", { items }, buyer.token);
  check(r.data.quote.ok && !r.data.quote.shops[0].deliveryDetail, "no drop-off pin → area / flat fee as before", r.data.quote.shops[0]);

  r = await call("POST", "/api/cart/quote", { items, ...north(6) }, buyer.token);
  let s = r.data.quote.shops[0];
  // 0.75 + (6 − 2) × 0.40 = 2.35, + (12 − 5) × 0.20 = 1.40 → 3.75 → rounds to 3.80
  check(r.data.quote.ok && s.deliveryDetail?.billedDistance === 6 && s.deliveryDetail?.billedWeight === 12, "6 km pin → priced by distance and weight", s);
  check(s.deliveryFee === (free ? 0 : 380), "fee is 0.75 + 4 km × 0.40 + 7 kg × 0.20 = $3.80", s);

  r = await call("POST", "/api/cart/quote", { items, ...north(30) }, buyer.token);
  s = r.data.quote.shops[0];
  check(!r.data.quote.ok && s.deliveryProblem?.includes("far"), "30 km pin → too far, checkout blocked", s);

  r = await call("POST", "/api/cart/quote", { items: [{ productId: rice, quantity: 13 }], ...north(3) }, buyer.token);
  s = r.data.quote.shops[0];
  check(!r.data.quote.ok && s.deliveryProblem?.includes("heavy"), "52 kg → too heavy, checkout blocked", s);

  // ─── Checkout recomputes on the server ───────────────────────────────────
  const details = { name: "Kofi Buyer", phone: `057${n}`, city: "Monrovia", address: "Sinkor, 14th Street" };
  r = await call("POST", "/api/orders", { items, delivery: { ...details, ...north(30) }, paymentMethod: "cod" }, buyer.token);
  check(r.status === 409, "checkout refuses a drop-off that's too far", r.data);

  r = await call("POST", "/api/orders", { items, delivery: { ...details, ...north(6) }, paymentMethod: "cod" }, buyer.token);
  check(r.status === 201, "checkout with a 6 km pin", r.data);
  const order = r.data.orders[0];
  check(order.deliveryFee === (free ? 0 : 380) && order.deliveryFeeBreakdown?.distanceM === 6000 && order.deliveryFeeBreakdown?.weightG === 12000, "order saves the fee with its distance and weight", order.deliveryFeeBreakdown);
  r = await call("GET", `/api/orders/${order.id}`, undefined, buyer.token);
  check(r.data.order.deliveryFeeBreakdown?.billedDistance === 6, "the buyer's order page gets the breakdown");

  r = await call("GET", "/api/admin/audit-log?q=delivery_pricing", undefined, admin);
  const logged = JSON.stringify(r.data).includes("delivery_pricing.update");
  check(r.status !== 200 || logged, "pricing changes are in the audit log", r.status);
} finally {
  const back = await call("PUT", "/api/admin/delivery-pricing/LR", original, admin);
  console.log(back.status === 200 ? "↩️  Liberia's pricing put back" : `⚠️  Couldn't put Liberia's pricing back (${back.status})`);
}

console.log(`\n${passed} delivery-pricing checks passed`);
