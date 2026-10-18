/**
 * Country switch (Liberia / USA): phones, shops, products, banners, delivery and checkout.
 *   npx tsx src/scripts/smoke-countries.ts   (server running; admin 0770000001 / adminpass123)
 */
export {};

const BASE = process.env.API ?? "http://localhost:4000";
let passed = 0;

function check(cond: unknown, label: string, extra?: unknown) {
  if (!cond) {
    console.error(`❌ ${label}`, extra ?? "");
    process.exit(1);
  }
  passed++;
  console.log(`✅ ${label}`);
}

async function call(method: string, p: string, body?: unknown, token?: string, country?: string) {
  const headers: Record<string, string> = {};
  if (country) headers["X-Country"] = country;
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

const n = String(Date.now()).slice(-7);
let r = await call("POST", "/api/auth/login", { phone: "0770000001", password: "adminpass123" });
const admin = r.data.accessToken as string;

async function person(prefix: string, name: string) {
  const reg = await call("POST", "/api/auth/register", { fullName: name, phone: `0${prefix}${n}`, email: `${crypto.randomUUID().slice(0, 12)}@test.yanabuy.com`, password: "password123" });
  return { token: reg.data.accessToken as string, id: reg.data.user.id as string };
}

async function sellerWithProducts(prefix: string, kind: "store" | "restaurant", shopName: string, items: { name: string; price: number; stock: number | null }[], country?: "LR" | "US") {
  const me = await person(prefix, `${shopName} Owner`);
  const up = await call("POST", "/api/uploads/private", photos(2), me.token);
  const app = await call(
    "POST",
    "/api/shop/apply",
    { kind, ...(country ? { country } : {}), name: shopName, phone: `0${prefix}${n}`, city: country === "US" ? "Philadelphia, PA" : "Monrovia", address: "Broad Street", idType: "passport", idFrontKey: up.data.files[0].key, selfieKey: up.data.files[1].key },
    me.token
  );
  await call("POST", `/api/admin/shops/${app.data.shop.id}/approve`, undefined, admin);
  const cats = (await call("GET", `/api/public/categories?kind=${kind === "store" ? "goods" : "food"}`)).data.items;
  const img = (await call("POST", "/api/uploads", photos(1), me.token)).data.urls;
  const ids: string[] = [];
  for (const it of items) {
    const p = await call("POST", "/api/shop/products", { ...it, images: img, categoryId: cats[0].id }, me.token);
    await call("POST", `/api/admin/products/${p.data.product.id}/approve`, undefined, admin);
    ids.push(p.data.product.id);
  }
  return { ...me, shopId: app.data.shop.id as string, products: ids };
}



// ─── Phones ───────────────────────────────────────────────────────────────
const usPhone = `(215) 5${n.slice(1, 3)}-${n.slice(3)}`;
const usE164 = `+12155${n.slice(1, 3)}${n.slice(3)}`;
r = await call("POST", "/api/auth/register", { fullName: "US Shopper", phone: usPhone, email: `${crypto.randomUUID().slice(0, 12)}@test.yanabuy.com`, password: "password123" });
check(r.status === 201 && r.data.user.phone === usE164, "people can sign up with a US number", r.data);
const usBuyer = r.data.accessToken as string;
r = await call("POST", "/api/auth/login", { phone: `+1 215-5${n.slice(1, 3)}-${n.slice(3)}`, password: "password123" });
check(r.status === 200, "and log in with it typed another way");
r = await call("POST", "/api/auth/register", { fullName: "Bad Number", phone: "123 456 7890", email: `${crypto.randomUUID().slice(0, 12)}@test.yanabuy.com`, password: "password123" });
check(r.status === 400, "a number that isn't Liberian or American is refused");

// ─── Shops in each country ────────────────────────────────────────────────
const lr = await sellerWithProducts("71", "store", `LR Shop ${n}`, [{ name: `Country Test Lappa ${n}`, price: 1500, stock: 5 }]);
const us = await sellerWithProducts("72", "store", `US Shop ${n}`, [{ name: `Country Test Palm Oil ${n}`, price: 2500, stock: 5 }], "US");
r = await call("GET", `/api/shop/mine`, undefined, us.token);
check(r.data.shop.country === "US", "a seller picks the USA when applying");
r = await call("GET", `/api/shop/mine`, undefined, lr.token);
check(r.data.shop.country === "LR", "shops are in Liberia unless they pick otherwise");

const find = async (country?: string) => (await call("GET", `/api/public/products?q=${encodeURIComponent(`Country Test`)}`, undefined, undefined, country)).data.items.map((p: any) => p.name);
let names = await find("US");
check(names.includes(`Country Test Palm Oil ${n}`) && !names.includes(`Country Test Lappa ${n}`), "USA shoppers only see USA products");
names = await find("LR");
check(names.includes(`Country Test Lappa ${n}`) && !names.includes(`Country Test Palm Oil ${n}`), "Liberia shoppers only see Liberia products");
names = await find();
check(names.includes(`Country Test Lappa ${n}`) && !names.includes(`Country Test Palm Oil ${n}`), "with no country picked, it's Liberia");
r = await call("GET", `/api/public/products?q=x&country=us`);
check(r.status === 200, "?country= works too");

const shopNames = async (country: string) => (await call("GET", `/api/public/shops?q=${n}&limit=48`, undefined, undefined, country)).data.items.map((s: any) => s.name);
check((await shopNames("US")).join() === `US Shop ${n}`, "the USA shop directory lists only USA shops");
check((await shopNames("LR")).join() === `LR Shop ${n}`, "the Liberia directory lists only Liberia shops");
r = await call("GET", `/api/public/shops?q=${n}`, undefined, undefined, "US");
const usSlug = r.data.items[0].slug;
r = await call("GET", `/api/public/shops/${usSlug}`, undefined, undefined, "LR");
check(r.status === 200 && r.data.shop.country === "US", "a shared link to a shop still opens, showing its country");
r = await call("GET", `/api/public/products?shop=${usSlug}`, undefined, undefined, "LR");
check(r.data.items.length === 1, "and its products still show on its page");

// ─── Banners ──────────────────────────────────────────────────────────────
const bannerImg = (await call("POST", "/api/uploads", photos(1), admin)).data.urls[0];
r = await call("POST", "/api/admin/banners", { title: `US only ${n}`, imageUrl: bannerImg, country: "US" }, admin);
check(r.status === 201 && r.data.banner.country === "US", "admin can show a banner in one country");
const bannerId = r.data.banner.id;
const bannerTitles = async (c: string) => (await call("GET", "/api/public/banners?platform=web", undefined, undefined, c)).data.items.map((b: any) => b.title);
check((await bannerTitles("US")).includes(`US only ${n}`) && !(await bannerTitles("LR")).includes(`US only ${n}`), "a USA banner shows only in the USA");
await call("DELETE", `/api/admin/banners/${bannerId}`, undefined, admin);

// ─── Delivery & checkout ──────────────────────────────────────────────────
r = await call("GET", "/api/admin/settings/delivery", undefined, admin);
const original = r.data.delivery;
r = await call(
  "PUT",
  "/api/admin/settings/delivery",
  {
    ...original,
    areas: [
      { name: "Sinkor", fee: 150, country: "LR" },
      { name: "Philadelphia – Southwest", fee: 899, country: "US" },
      { name: "Sinkor", fee: 700, country: "US" },
    ],
    countryFees: { US: { fee: 999, freeOver: 10000 } },
  },
  admin
);
check(r.status === 200 && r.data.delivery.areas.filter((a: any) => a.country === "US").length === 2, "admin sets delivery areas per country (the same name can be in both)", r.data);
const usArea = r.data.delivery.areas.find((a: any) => a.name === "Philadelphia – Southwest");
const lrArea = r.data.delivery.areas.find((a: any) => a.country === "LR");

const oil = { productId: us.products[0], quantity: 1 };
const lappa = { productId: lr.products[0], quantity: 1 };
r = await call("POST", "/api/cart/quote", { items: [oil] }, usBuyer, "US");
let q = r.data.quote;
check(q.country === "US" && q.areas.length === 2 && q.areas.every((a: any) => a.country === "US"), "USA buyers only see USA delivery areas", q.areas);
check(!q.paymentMethods.find((m: any) => m.method === "mtn_momo").enabled, "mobile money is off for USA orders");
r = await call("POST", "/api/cart/quote", { items: [oil], areaId: lrArea.id }, usBuyer, "US");
check(r.data.quote.areaId === null, "a Liberia area can't be used for a USA order");
r = await call("POST", "/api/cart/quote", { items: [oil], areaId: usArea.id }, usBuyer, "US");
check(r.data.quote.deliveryFees === 899 && r.data.quote.ok, "the USA area's fee is used");

r = await call("POST", "/api/cart/quote", { items: [oil, lappa] }, usBuyer, "US");
q = r.data.quote;
const bad = q.lines.find((l: any) => l.productId === lr.products[0]);
check(!q.ok && bad.problem?.includes("Liberia"), "a Liberia item in a USA cart is flagged", bad);

const usDelivery = { name: "US Shopper", phone: usPhone, city: "Philadelphia, PA", address: "5800 Woodland Ave", areaId: usArea.id };
r = await call("POST", "/api/orders", { items: [oil], delivery: usDelivery, paymentMethod: "mtn_momo" }, usBuyer, "US");
check(r.status === 400, "USA orders can't pay with mobile money");
r = await call("POST", "/api/orders", { items: [oil], delivery: usDelivery, paymentMethod: "cod" }, usBuyer, "US");
check(r.status === 201, "a USA buyer orders from a USA shop with a US phone", r.data);
const order = r.data.orders?.[0] ?? r.data.order;
const orderId = order?.id ?? r.data.orderIds?.[0];
r = await call("GET", `/api/orders/${orderId}`, undefined, usBuyer);
check(r.data.order.shop.country === "US" && r.data.order.deliveryFee === 899 && r.data.order.delivery.area === "Philadelphia – Southwest", "the order keeps the USA area and fee");

r = await call("PUT", "/api/admin/settings/delivery", { ...original, areas: [], countryFees: { US: { fee: 999, freeOver: 2000 } } }, admin);
r = await call("POST", "/api/cart/quote", { items: [oil] }, usBuyer, "US");
check(r.data.quote.deliveryFees === 0, "the USA free-delivery amount applies to USA orders");
r = await call("PUT", "/api/admin/settings/delivery", { ...original, areas: [], countryFees: { US: { fee: 999, freeOver: null } } }, admin);
r = await call("POST", "/api/cart/quote", { items: [oil] }, usBuyer, "US");
check(r.data.quote.deliveryFees === 999, "the USA base fee is separate from Liberia's");
r = await call("POST", "/api/cart/quote", { items: [lappa] }, usBuyer, "LR");
check(r.data.quote.deliveryFees === (original.freeOver !== null && 1500 >= original.freeOver ? 0 : original.fee), "Liberia keeps its own fee");
await call("PUT", "/api/admin/settings/delivery", original, admin);

// ─── Admin ────────────────────────────────────────────────────────────────
r = await call("GET", `/api/admin/shops?country=US&q=${n}`, undefined, admin);
check(r.data.items.length === 1 && r.data.items[0].name === `US Shop ${n}`, "admin filters shops by country");
r = await call("POST", `/api/admin/shops/${lr.shopId}/country`, { country: "US" }, admin);
check(r.status === 200 && r.data.shop.country === "US", "admin moves a shop to the USA");
names = await find("US");
check(names.includes(`Country Test Lappa ${n}`), "its products now show in the USA");
r = await call("POST", `/api/admin/shops/${lr.shopId}/country`, { country: "GH" }, admin);
check(r.status === 400, "only Liberia and the USA for now");
r = await call("POST", `/api/shop/apply`, { kind: "store", country: "GH" }, usBuyer);
check(r.status === 400, "sellers can't pick another country");

console.log(`\n${passed} checks passed`);
