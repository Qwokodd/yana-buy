/**
 * End-to-end check of product options (colour/size) — seller, approval, cart, checkout, stock, cancel
 * against a running server.   npx tsx src/scripts/smoke-options.ts
 * Needs the admin from README (0770000001 / adminpass123). Uses throwaway accounts.
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

const n = String(Date.now()).slice(-7);
let r = await call("POST", "/api/auth/login", { phone: "0770000001", password: "adminpass123" });
const admin = r.data.accessToken as string;

async function person(prefix: string, name: string) {
  const reg = await call("POST", "/api/auth/register", { fullName: name, phone: `0${prefix}${n}`, email: `${crypto.randomUUID().slice(0, 12)}@test.yanabuy.com`, password: "password123" });
  return { token: reg.data.accessToken as string, id: reg.data.user.id as string };
}

async function sellerWithProducts(prefix: string, kind: "store" | "restaurant", shopName: string, items: { name: string; price: number; stock: number | null }[]) {
  const me = await person(prefix, `${shopName} Owner`);
  const up = await call("POST", "/api/uploads/private", photos(2), me.token);
  const app = await call(
    "POST",
    "/api/shop/apply",
    { kind, name: shopName, phone: `0${prefix}${n}`, city: "Monrovia", address: "Broad Street", idType: "passport", idFrontKey: up.data.files[0].key, selfieKey: up.data.files[1].key },
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



const shop = await sellerWithProducts("86", "store", `Dresses ${n}`, []);
const cats = (await call("GET", "/api/public/categories?kind=goods")).data.items;
const img = (await call("POST", "/api/uploads", photos(2), shop.token)).data.urls;
const base = { name: "Ankara Dress", categoryId: cats[0].id, images: [img[0]] };

// ─── Seller adds a product with options ───────────────────────────────────
r = await call("POST", "/api/shop/products", { ...base, options: [{ name: "Colour", values: ["Red", "Blue"] }], variants: [] }, shop.token);
check(r.status === 400, "options need at least one priced combination");
r = await call("POST", "/api/shop/products", { ...base, options: [{ name: "Colour", values: ["Red"] }], variants: [{ values: ["Green"], price: 1000 }] }, shop.token);
check(r.status === 400 && r.data.error.includes("Green"), "a combination must use the listed choices");
r = await call("POST", "/api/shop/products", { ...base, options: [{ name: "Colour", values: ["Red", "Red"] }], variants: [{ values: ["Red"], price: 1000 }] }, shop.token);
check(r.status === 400, "the same choice can't be listed twice");
r = await call("POST", "/api/shop/products", { ...base }, shop.token);
check(r.status === 400 && r.data.fields?.price, "a product without options still needs a price");

const options = [
  { name: "Colour", values: ["Red", "Blue"] },
  { name: "Size", values: ["M", "L"] },
];
const variants = [
  { values: ["Red", "M"], price: 2499, compareAtPrice: 2999, stock: 2 },
  { values: ["Red", "L"], price: 2699, stock: 1 },
  { values: ["Blue", "M"], price: 2499, stock: 0, image: img[1] },
  { values: ["Blue", "L"], price: 2699, stock: 5 },
];
r = await call("POST", "/api/shop/products", { ...base, options, variants }, shop.token);
check(r.status === 201 && r.data.product.variants.length === 4 && r.data.product.variants.every((v: any) => v.id), "seller adds a dress with colour and size");
const dress = r.data.product;
check(dress.price === 2499 && dress.compareAtPrice === 2999 && dress.stock === 8 && dress.hasOptions, "price shows the cheapest choice and stock is the total");
const id = (vals: string[]) => dress.variants.find((v: any) => v.values.join() === vals.join()).id;
const redM = id(["Red", "M"]), redL = id(["Red", "L"]), blueM = id(["Blue", "M"]), blueL = id(["Blue", "L"]);

r = await call("POST", `/api/admin/products/${dress.id}/approve`, undefined, admin);
check(r.status === 200, "admin approves it");
r = await call("GET", `/api/public/products/${dress.id}`);
check(r.data.product.options.length === 2 && r.data.product.variants.length === 4, "shoppers see the options");

// Price/stock change on a choice shows straight away; changing the choices goes back to review.
r = await call("PATCH", `/api/shop/products/${dress.id}`, { variants: variants.map((v) => (v.values.join() === "Blue,L" ? { ...v, price: 2899 } : v)) }, shop.token);
check(r.status === 200 && !r.data.needsReview && r.data.product.status === "approved", "changing a choice's price doesn't need review");
check(r.data.product.variants.find((v: any) => v.id === blueL)?.price === 2899, "variant ids stay the same when prices change");

// ─── Cart ─────────────────────────────────────────────────────────────────
const buyer = await person("54", "Ama Buyer");
r = await call("POST", "/api/cart/quote", { items: [{ productId: dress.id, quantity: 1 }] }, buyer.token);
check(!r.data.quote.ok && r.data.quote.lines[0].problem.includes("Choose"), "the cart asks for a choice");
r = await call("POST", "/api/cart/quote", { items: [{ productId: dress.id, variantId: blueM, quantity: 1 }] }, buyer.token);
check(r.data.quote.lines[0].problem === "Sold out", "a sold-out choice can't be bought");
check(r.data.quote.lines[0].product.image === img[1], "the choice's own photo is used");
r = await call(
  "POST",
  "/api/cart/quote",
  { items: [{ productId: dress.id, variantId: redM, quantity: 1 }, { productId: dress.id, variantId: blueL, quantity: 2 }, { productId: dress.id, variantId: redM, quantity: 1 }] },
  buyer.token
);
const q = r.data.quote;
check(q.ok && q.lines.length === 2, "same choice twice is added up, different choices stay separate", q);
check(q.subtotal === 2499 * 2 + 2899 * 2 && q.lines[0].variantLabel === "Red / M", "each choice uses its own price");
r = await call("POST", "/api/cart/quote", { items: [{ productId: dress.id, variantId: redL, quantity: 2 }] }, buyer.token);
check(r.data.quote.lines[0].problem === "Only 1 left", "stock is counted per choice");

// ─── Checkout ─────────────────────────────────────────────────────────────
const delivery = { name: "Ama Buyer", phone: `054${n}`, city: "Monrovia", address: "Sinkor, 14th Street" };
r = await call("POST", "/api/orders", { items: [{ productId: dress.id, variantId: redM, quantity: 2 }, { productId: dress.id, variantId: redL, quantity: 1 }], delivery, paymentMethod: "cod" }, buyer.token);
check(r.status === 201, "checkout with options");
const order = r.data.orders[0];
check(order.items.length === 2 && order.items.some((i: any) => i.variantLabel === "Red / M" && i.price === 2499 && i.quantity === 2), "the order keeps which choice was bought");
check(order.subtotal === 2499 * 2 + 2699, "order total uses the choices' prices");
r = await call("GET", `/api/public/products/${dress.id}`);
const after = r.data.product;
check(after.variants.find((v: any) => v.id === redM).stock === 0 && after.variants.find((v: any) => v.id === redL).stock === 0 && after.stock === 5, "stock goes down on the bought choices only");
r = await call("POST", "/api/orders", { items: [{ productId: dress.id, variantId: redM, quantity: 1 }], delivery, paymentMethod: "cod" }, buyer.token);
check(r.status === 409, "a choice that sold out can't be ordered");

r = await call("POST", `/api/orders/${order.id}/cancel`, { reason: "Changed my mind" }, buyer.token);
check(r.status === 200 && r.data.order.status === "cancelled", "buyer cancels");
r = await call("GET", `/api/public/products/${dress.id}`);
check(r.data.product.variants.find((v: any) => v.id === redM).stock === 2 && r.data.product.stock === 8, "cancelling puts the stock back on the right choices");

// ─── Changing the choices ─────────────────────────────────────────────────
r = await call("PATCH", `/api/shop/products/${dress.id}`, { options: [{ name: "Colour", values: ["Red", "Blue", "Gold"] }, options[1]], variants: [...variants, { values: ["Gold", "M"], price: 3500, stock: 3 }] }, shop.token);
check(r.status === 200 && r.data.needsReview && r.data.product.status === "pending", "adding a new colour goes back to review");
check(r.data.product.variants.find((v: any) => v.values.join() === "Red,M").id === redM, "existing choices keep their ids");
r = await call("PATCH", `/api/shop/products/${dress.id}`, { options: [], variants: [], price: 1999, stock: 4 }, shop.token);
check(r.status === 200 && !r.data.product.hasOptions && r.data.product.price === 1999 && r.data.product.stock === 4, "seller can turn options off again");

console.log(`\n${passed} checks passed`);
