/**
 * Heavy orders (over the admin's "needs a keke or car" weight) only go to keke/car riders —
 * the packed-order broadcast, the rider's open list, and the shop's "ask a rider" list.
 * Against a running server:   npx tsx src/scripts/smoke-heavy-riders.ts
 * Needs the admin from README (0770000001 / adminpass123). Uses throwaway accounts.
 * Puts Liberia's delivery pricing back the way it was at the end.
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Sellers and riders need a confirmed email: the code is read from the dev outbox file.
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
  const p = { token: reg.data.accessToken as string, id: reg.data.user.id as string };
  const email = `${prefix}x${n}@test.yanabuy.com`;
  await call("POST", "/api/me/email", { email }, p.token);
  const v = await call("POST", "/api/me/email/verify", { code: lastCode(email) }, p.token);
  check(v.status === 200, `${name} confirms their email`, v.data);
  return p;
}

// A spot nobody else uses, so other test riders aren't in range.
const shopPin = { lat: 7.1 + Math.random() * 0.2, lng: -9.6 - Math.random() * 0.2 };
const near = (km: number) => ({ lat: shopPin.lat + km / 111.19508, lng: shopPin.lng });

async function rider(prefix: string, name: string, vehicle: string) {
  const p = await person(prefix, name);
  const a = await call(
    "POST",
    "/api/rider-application",
    { vehicle, plateNumber: `PL-${prefix}${n.slice(-3)}`, city: "Monrovia", areas: "Sinkor", emergencyName: "Ma Musu", emergencyPhone: "0886123456" },
    p.token
  );
  check(a.status === 201, `${name} applies to ride a ${vehicle}`, a.data);
  const ok = await call("POST", `/api/admin/rider-applications/${a.data.application.id}/approve`, undefined, admin);
  check(ok.data.application?.status === "approved", `admin approves ${name}`, ok.data);
  // Approval changes the role — sign in again for a token that says "rider".
  const token = (await call("POST", "/api/auth/login", { phone: `0${prefix}${n}`, password: "password123" })).data.accessToken as string;
  const on = await call("POST", "/api/rider/online", { online: true, ...near(1) }, token);
  check(on.status === 200, `${name} goes online 1 km from the shop`, on.data);
  return { ...p, token };
}

const original = (await call("GET", "/api/admin/delivery-pricing/LR", undefined, admin)).data.pricing;

try {
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
  check(r.status === 200 && r.data.pricing.weight.heavyOver === 20, "admin prices Liberia by distance + weight, heavy over 20 kg", r.data);

  // ─── A shop with a pin and a 4 kg product ────────────────────────────────
  const seller = await person("87", "Heavy Goods Owner");
  const up = await call("POST", "/api/uploads/private", photos(2), seller.token);
  const app = await call(
    "POST",
    "/api/shop/apply",
    { kind: "store", name: `Heavy Goods ${n}`, phone: `087${n}`, city: "Monrovia", address: "Broad Street", idType: "passport", idFrontKey: up.data.files[0].key, selfieKey: up.data.files[1].key },
    seller.token
  );
  check(app.status === 201 || app.status === 200, "seller applies for a shop", app.data);
  await call("POST", `/api/admin/shops/${app.data.shop.id}/approve`, undefined, admin);
  r = await call("PUT", "/api/shop/mine/location", shopPin, seller.token);
  check(r.status === 200, "shop puts its pin on the map", r.data);
  const cats = (await call("GET", "/api/public/categories?kind=goods")).data.items;
  const img = (await call("POST", "/api/uploads", photos(1), seller.token)).data.urls;
  r = await call("POST", "/api/shop/products", { name: "Bag of rice", price: 500, images: img, categoryId: cats[0].id, weightGrams: 4000 }, seller.token);
  check(r.status === 201, "seller adds a 4 kg bag of rice", r.data);
  const rice = r.data.product.id;
  await call("POST", `/api/admin/products/${rice}/approve`, undefined, admin);

  // ─── Riders: one on a motorbike, one in a keke ──────────────────────────
  const moto = await rider("66", "Moto Rider", "motorbike");
  const keke = await rider("67", "Keke Rider", "keke");

  // ─── A heavy order (6 × 4 kg = 24 kg) and a light one (1 × 4 kg) ────────
  const buyer = await person("57", "Kofi Buyer");
  const details = { name: "Kofi Buyer", phone: `057${n}`, city: "Monrovia", address: "Sinkor, 14th Street", ...near(4) };
  r = await call("POST", "/api/orders", { items: [{ productId: rice, quantity: 6 }], delivery: details, paymentMethod: "cod" }, buyer.token);
  check(r.status === 201 && r.data.orders[0].deliveryFeeBreakdown?.heavy === true, "24 kg order is marked heavy", r.data.orders?.[0]?.deliveryFeeBreakdown ?? r.data);
  const heavy = r.data.orders[0].id as string;
  r = await call("POST", "/api/orders", { items: [{ productId: rice, quantity: 1 }], delivery: details, paymentMethod: "cod" }, buyer.token);
  check(r.status === 201 && r.data.orders[0].deliveryFeeBreakdown?.heavy === false, "4 kg order isn't heavy", r.data.orders?.[0]?.deliveryFeeBreakdown ?? r.data);
  const light = r.data.orders[0].id as string;

  for (const id of [heavy, light]) {
    r = await call("POST", `/api/shop/orders/${id}/accept`, {}, seller.token);
    check(r.status === 200, "seller accepts the order", r.data);
  }

  // ─── The shop's "ask a rider" list ──────────────────────────────────────
  r = await call("GET", `/api/shop/orders/${heavy}/riders`, undefined, seller.token);
  const list = r.data.riders as any[];
  const m = list?.find((x) => x.id === moto.id);
  const k = list?.find((x) => x.id === keke.id);
  check(r.data.heavy === true && m?.canCarry === false && k?.canCarry === true, "heavy order: motorbike rider listed as can't carry, keke can", r.data);
  r = await call("POST", `/api/shop/orders/${heavy}/offer`, { riderId: moto.id }, seller.token);
  check(r.status === 400 && /heavy/i.test(r.data.error ?? r.data.message ?? JSON.stringify(r.data)), "server refuses to offer the heavy order to the motorbike rider", r.data);
  r = await call("GET", `/api/shop/orders/${light}/riders`, undefined, seller.token);
  check(r.data.heavy === false && r.data.riders.find((x: any) => x.id === moto.id)?.canCarry === true, "light order: motorbike rider can carry it", r.data);

  // ─── Packed: the broadcast ──────────────────────────────────────────────
  r = await call("POST", `/api/shop/orders/${heavy}/ready`, {}, seller.token);
  check(r.status === 200 && r.data.ridersTold >= 1, "heavy order packed — riders told", r.data);
  await sleep(1500);
  const told = async (token: string) => ((await call("GET", "/api/me/notifications", undefined, token)).data.items as any[]).some((x) => /Pickup near you/.test(x.title));
  check(!(await told(moto.token)), "motorbike rider isn't told about the heavy pickup");
  check(await told(keke.token), "keke rider is told about the heavy pickup");

  // ─── The rider's open list ──────────────────────────────────────────────
  r = await call("GET", "/api/rider/open", undefined, moto.token);
  check(r.status === 200 && !r.data.items.some((x: any) => x.id === heavy), "heavy order hidden from the motorbike rider's open list", r.data);
  r = await call("POST", `/api/rider/orders/${heavy}/accept`, {}, moto.token);
  check(r.status === 404 || r.status === 409 || r.status === 400, "motorbike rider can't grab the heavy order", r.data);
  r = await call("GET", "/api/rider/open", undefined, keke.token);
  check(r.data.items.some((x: any) => x.id === heavy), "keke rider sees the heavy order", r.data);

  r = await call("POST", `/api/shop/orders/${light}/ready`, {}, seller.token);
  r = await call("GET", "/api/rider/open", undefined, moto.token);
  check(r.data.items.some((x: any) => x.id === light), "motorbike rider still sees light orders", r.data);

  r = await call("POST", `/api/rider/orders/${heavy}/accept`, {}, keke.token);
  check(r.status === 200, "keke rider takes the heavy order", r.data);

  for (const t of [moto.token, keke.token]) await call("POST", "/api/rider/online", { online: false }, t);
} finally {
  const back = await call("PUT", "/api/admin/delivery-pricing/LR", original, admin);
  console.log(back.status === 200 ? "↩️  Liberia's pricing put back" : `⚠️  Couldn't put Liberia's pricing back (${back.status})`);
}

console.log(`\n${passed} heavy-order rider checks passed`);
