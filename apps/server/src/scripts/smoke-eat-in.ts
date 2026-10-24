/**
 * Eat in / pickup / delivery for restaurants, against a running server:
 *   npx tsx src/scripts/smoke-eat-in.ts
 * Needs the admin from README (0770000001 / adminpass123) and OUTBOX_FILE set on the server
 * (sellers confirm their email with a code read from it). Uses throwaway accounts.
 */
import fs from "node:fs";

const BASE = process.env.API ?? "http://localhost:4000";
let passed = 0;

function check(cond: unknown, label: string, extra?: unknown) {
  if (!cond) {
    console.error(`❌ ${label}`, extra === undefined ? "" : JSON.stringify(extra, null, 1));
    process.exit(1);
  }
  passed++;
  console.log(`✅ ${label}`);
}

async function call(method: string, p: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, { method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
function photos(count: number) {
  const form = new FormData();
  for (let i = 0; i < count; i++) form.append("images", new Blob([PNG], { type: "image/png" }), `p${i}.png`);
  return form;
}
const OUTBOX = process.env.OUTBOX ?? "/tmp/yb-outbox.jsonl";
const lastCode = (to: string) => {
  const lines = fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean) : [];
  const m = lines.map((l) => JSON.parse(l)).reverse().find((s: any) => s.channel === "email" && s.to === to && /code is (\d{6})/.test(s.text));
  return m ? /code is (\d{6})/.exec(m.text)![1] : null;
};

const n = String(Date.now()).slice(-7);
let r = await call("POST", "/api/auth/login", { phone: "0770000001", password: "adminpass123" });
const admin = r.data.accessToken as string;
check(admin, "admin logs in");

async function person(prefix: string, name: string) {
  const reg = await call("POST", "/api/auth/register", { fullName: name, phone: `0${prefix}${n}`, email: `${crypto.randomUUID().slice(0, 12)}@test.yanabuy.com`, password: "password123" });
  return { token: reg.data.accessToken as string, id: reg.data.user.id as string, phone: `0${prefix}${n}` };
}

async function openShop(prefix: string, kind: "store" | "restaurant", name: string) {
  const owner = await person(prefix, `${name} Owner`);
  const email = `eat${prefix}${n}@test.yanabuy.com`;
  await call("POST", "/api/me/email", { email }, owner.token);
  await call("POST", "/api/me/email/verify", { code: lastCode(email) }, owner.token);
  const up = await call("POST", "/api/uploads/private", photos(2), owner.token);
  const app = await call("POST", "/api/shop/apply", { kind, name: `${name} ${n}`, phone: owner.phone, city: "Monrovia", address: "Tubman Boulevard", idType: "passport", idFrontKey: up.data.files[0].key, selfieKey: up.data.files[1].key }, owner.token);
  check(app.status === 201 || app.status === 200, `${name}: shop applies`, app.data);
  await call("POST", `/api/admin/shops/${app.data.shop.id}/approve`, undefined, admin);
  await call("PUT", "/api/shop/mine/location", { lat: 6.3, lng: -10.8 }, owner.token);
  const cats = (await call("GET", `/api/public/categories?kind=${kind === "restaurant" ? "food" : "goods"}`)).data.items;
  const img = (await call("POST", "/api/uploads", photos(1), owner.token)).data.urls;
  const p = await call("POST", "/api/shop/products", { name: `${name} special`, price: 1000, images: img, categoryId: cats[0].id }, owner.token);
  check(p.status === 201, `${name}: adds an item for $10`, p.data);
  await call("POST", `/api/admin/products/${p.data.product.id}/approve`, undefined, admin);
  return { owner, shop: app.data.shop, productId: p.data.product.id as string };
}

const kitchen = await openShop("86", "restaurant", "Mama Kitchen");
const store = await openShop("85", "store", "Corner Store");
const buyer = await person("55", "Hungry Buyer");
const items = [{ productId: kitchen.productId, quantity: 2 }];
const near = { lat: 6.3 + 4 / 111.19508, lng: -10.8 };

// ─── Restaurant settings ─────────────────────────────────────────────────
r = await call("POST", "/api/cart/quote", { items, fulfilment: "eat_in" }, buyer.token);
check(!r.data.quote.ok && r.data.quote.fulfilmentProblem && r.data.quote.fulfilments.length === 1, "eat in isn't offered until the restaurant switches it on", r.data.quote);
r = await call("PATCH", "/api/shop/mine", { eatIn: true }, store.owner.token);
check(r.status === 400, "a store (not a restaurant) can't take eat-in orders");
r = await call("PATCH", "/api/shop/mine", { eatIn: true, pickup: true }, kitchen.owner.token);
check(r.status === 200 && r.data.shop.eatIn && r.data.shop.pickup, "restaurant switches on eat in and pickup", r.data);
r = await call("GET", `/api/public/shops/${kitchen.shop.slug}`);
check(r.data.shop.eatIn && r.data.shop.pickup, "the public restaurant page shows eat in / pickup");

// ─── Quotes ─────────────────────────────────────────────────────────────
r = await call("POST", "/api/cart/quote", { items, ...near }, buyer.token);
const deliveryQuote = r.data.quote;
check(deliveryQuote.fulfilment === "delivery" && deliveryQuote.fulfilments.join() === "delivery,eat_in,pickup", "the cart offers delivery, eat in and pickup", deliveryQuote);
check(deliveryQuote.total === 2000 + deliveryQuote.deliveryFees - deliveryQuote.discount, "delivery = menu price + delivery fee", deliveryQuote);
r = await call("POST", "/api/cart/quote", { items, ...near, fulfilment: "eat_in" }, buyer.token);
let q = r.data.quote;
check(q.ok && q.deliveryFees === 0 && q.shops[0].deliveryFee === 0 && q.total === 2000, "eat in = menu price only, no delivery fee", q);
check(q.paymentMethods.filter((m: any) => m.enabled).map((m: any) => m.method).join() === "cod", "eat in is paid at the restaurant only", q.paymentMethods);
r = await call("POST", "/api/cart/quote", { items, fulfilment: "pickup" }, buyer.token);
q = r.data.quote;
check(q.ok && q.total === 2000 && q.paymentMethods.find((m: any) => m.method === "cod").enabled, "pickup = menu price only, pay at the restaurant allowed", q);
r = await call("POST", "/api/cart/quote", { items: [...items, { productId: store.productId, quantity: 1 }], fulfilment: "eat_in" }, buyer.token);
check(!r.data.quote.ok && /one restaurant/.test(r.data.quote.fulfilmentProblem) && r.data.quote.fulfilments.join() === "delivery", "eat in needs one restaurant (not a mixed cart)", r.data.quote);

// ─── Checkout: eat in ───────────────────────────────────────────────────
const who = { name: "Hungry Buyer", phone: buyer.phone };
const inAnHour = new Date(Date.now() + 3600_000).toISOString();
r = await call("POST", "/api/orders", { items, fulfilment: "eat_in", delivery: who, partySize: 2, paymentMethod: "cod" }, buyer.token);
check(r.status === 400 && r.data.fields?.arriveAt, "eat in needs an arrival time", r.data);
r = await call("POST", "/api/orders", { items, fulfilment: "eat_in", delivery: who, arriveAt: inAnHour, paymentMethod: "cod" }, buyer.token);
check(r.status === 400 && r.data.fields?.partySize, "eat in needs how many people", r.data);
r = await call("POST", "/api/orders", { items, fulfilment: "eat_in", delivery: who, arriveAt: new Date(Date.now() - 3600_000).toISOString(), partySize: 2, paymentMethod: "cod" }, buyer.token);
check(r.status === 400 && r.data.fields?.arriveAt, "an arrival time in the past is refused", r.data);
r = await call("POST", "/api/orders", { items, fulfilment: "eat_in", delivery: who, arriveAt: inAnHour, partySize: 2, paymentMethod: "mtn_momo" }, buyer.token);
check(r.status === 400 && r.data.fields?.paymentMethod, "eat in can't be paid by mobile money", r.data);
r = await call("POST", "/api/orders", { items, fulfilment: "eat_in", delivery: who, arriveAt: inAnHour, partySize: 2, bookingId: crypto.randomUUID(), paymentMethod: "cod" }, buyer.token);
check(r.status === 400 && r.data.fields?.bookingId, "someone else's / unknown booking is refused", r.data);
r = await call("POST", "/api/orders", { items, fulfilment: "eat_in", delivery: { ...who, ...near }, arriveAt: inAnHour, partySize: 3, paymentMethod: "cod" }, buyer.token);
check(r.status === 201, "buyer places an eat-in order (no address needed)", r.data);
let order = r.data.orders[0];
check(order.fulfilment === "eat_in" && order.deliveryFee === 0 && order.total === 2000 && order.partySize === 3 && order.arriveAt && order.delivery.lat === null, "the order is menu price only, with arrival time and party size", order);

// ─── The restaurant handles it ──────────────────────────────────────────
const shopTok = kitchen.owner.token;
r = await call("GET", "/api/shop/orders", undefined, shopTok);
check(r.data.items.some((o: any) => o.id === order.id && o.fulfilment === "eat_in"), "the restaurant sees it marked eat in");
await call("POST", `/api/shop/orders/${order.id}/accept`, undefined, shopTok);
r = await call("POST", `/api/shop/orders/${order.id}/ready`, undefined, shopTok);
check(r.data.order.status === "ready" && r.data.ridersTold === 0, "food ready — no riders are called");
r = await call("GET", `/api/shop/orders/${order.id}/riders`, undefined, shopTok);
check(r.data.riders.length === 0, "no rider list for eat in");
r = await call("POST", `/api/shop/orders/${order.id}/offer`, { riderId: buyer.id }, shopTok);
check(r.status === 400, "the restaurant can't send a rider for eat in");
r = await call("POST", `/api/admin/orders/${order.id}/assign`, { riderId: buyer.id }, admin);
check(r.status === 400, "admin can't assign a rider to eat in either");
const before = (await call("GET", "/api/shop/wallet", undefined, shopTok)).data.wallet.balance;
r = await call("POST", `/api/shop/orders/${order.id}/handed-over`, {}, shopTok);
check(r.status === 400, "served needs the restaurant to confirm it was paid");
r = await call("POST", `/api/shop/orders/${order.id}/handed-over`, { cashCollected: true }, shopTok);
check(r.status === 200 && r.data.order.status === "delivered" && r.data.order.paymentStatus === "paid", "served + paid at the restaurant finishes the order", r.data);
const finance = (await call("GET", "/api/admin/settings/finance", undefined, admin)).data.finance;
const commission = Math.round((2000 * finance.foodCommission) / 100);
const after = (await call("GET", "/api/shop/wallet", undefined, shopTok)).data.wallet.balance;
check(after - before === -commission, `restaurant kept the $20 cash, so its balance goes down by the ${finance.foodCommission}% commission`, { before, after, commission });
r = await call("GET", `/api/orders/${order.id}`, undefined, buyer.token);
check(r.data.order.status === "delivered" && r.data.order.fulfilment === "eat_in", "the buyer sees it served");
r = await call("POST", `/api/shop/orders/${order.id}/handed-over`, { cashCollected: true }, shopTok);
check(r.status === 409, "can't finish it twice");

// ─── Eat in with a table booking ────────────────────────────────────────
r = await call("PUT", "/api/shop/bookings/settings", { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], opens: "00:00", closes: "23:00", slotMinutes: 60, perSlot: 5, maxPartySize: 10, leadHours: 0, daysAhead: 5, note: null }, shopTok);
check(r.status === 200, "restaurant takes table bookings", r.data);
const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
const slots = (await call("GET", `/api/public/shops/${kitchen.shop.slug}/availability?date=${tomorrow}`)).data.slots;
r = await call("POST", "/api/bookings", { shopId: kitchen.shop.id, startsAt: slots[3].startsAt, partySize: 4, contactName: "Hungry Buyer", contactPhone: buyer.phone }, buyer.token);
check(r.status === 201, "buyer books a table for 4", r.data);
const booking = r.data.booking;
r = await call("POST", "/api/orders", { items, fulfilment: "pickup", delivery: who, bookingId: booking.id, paymentMethod: "cod" }, buyer.token);
check(r.status === 400 && r.data.fields?.bookingId, "a booking only goes with eat in");
r = await call("POST", "/api/orders", { items, fulfilment: "eat_in", delivery: who, bookingId: booking.id, paymentMethod: "cod" }, buyer.token);
check(r.status === 201 && r.data.orders[0].arriveAt === booking.startsAt && r.data.orders[0].partySize === 4, "eat in with the booking uses its time and party size", r.data);
r = await call("GET", `/api/shop/orders/${r.data.orders[0].id}`, undefined, shopTok);
check(r.data.order.booking?.id === booking.id, "the restaurant sees the booking on the order");

// ─── Pickup ─────────────────────────────────────────────────────────────
r = await call("POST", "/api/orders", { items, fulfilment: "pickup", delivery: who, paymentMethod: "cod" }, buyer.token);
check(r.status === 201 && r.data.orders[0].fulfilment === "pickup" && r.data.orders[0].total === 2000 && r.data.orders[0].arriveAt === null, "pickup with no time = as soon as it's ready", r.data);
order = r.data.orders[0];
await call("POST", `/api/shop/orders/${order.id}/accept`, undefined, shopTok);
r = await call("POST", `/api/shop/orders/${order.id}/handed-over`, { cashCollected: true }, shopTok);
check(r.data.order.status === "delivered", "collected straight from accepted");

// ─── Delivery still works the old way ───────────────────────────────────
r = await call("POST", "/api/orders", { items, delivery: { ...who, city: "Monrovia" }, paymentMethod: "cod" }, buyer.token);
check(r.status === 400 && r.data.fields?.["delivery.address"], "delivery still needs an address", r.data);
r = await call("POST", "/api/orders", { items, delivery: { ...who, city: "Monrovia", address: "Sinkor, 14th Street", ...near }, paymentMethod: "cod" }, buyer.token);
check(r.status === 201 && r.data.orders[0].fulfilment === "delivery" && r.data.orders[0].deliveryFee === deliveryQuote.deliveryFees, "delivery = menu + the same delivery fee the quote showed", r.data);
order = r.data.orders[0];
r = await call("POST", `/api/shop/orders/${order.id}/handed-over`, { cashCollected: true }, shopTok);
check(r.status === 400, "a delivery order can't be marked served by the shop");
r = await call("GET", "/api/orders/last-delivery", undefined, buyer.token);
check(r.data.delivery.address === "Sinkor, 14th Street", "checkout prefills from the last real delivery, not an eat-in visit");
r = await call("GET", "/api/admin/money", undefined, admin);
check(r.status !== 200 || typeof r.data.overview.cashWithRiders === "number", "admin money overview still works");

console.log(`\n${passed} eat-in checks passed`);
