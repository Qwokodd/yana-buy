/**
 * End-to-end check of the phase 3 API (products, review, storefront, search)
 * against a running server.   npx tsx src/scripts/smoke-phase3.ts
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
const tag = `z${n}`; // unique word so searches only find this run's products

let r = await call("POST", "/api/auth/login", { phone: "0770000001", password: "adminpass123" });
const admin = r.data.accessToken as string;

/** A seller with an approved shop. */
async function seller(prefix: string, kind: "store" | "restaurant", name: string) {
  const reg = await call("POST", "/api/auth/register", { fullName: `${name} Owner`, phone: `0${prefix}${n}`, email: `${crypto.randomUUID().slice(0, 12)}@test.yanabuy.com`, password: "sellerpass1" });
  const token = reg.data.accessToken as string;
  const up = await call("POST", "/api/uploads/private", photos(2), token);
  const app = await call(
    "POST",
    "/api/shop/apply",
    { kind, name, phone: `0${prefix}${n}`, city: "Monrovia", address: "Broad Street", idType: "passport", idFrontKey: up.data.files[0].key, selfieKey: up.data.files[1].key },
    token
  );
  return { token, shopId: app.data.shop.id as string, slug: app.data.shop.slug as string };
}

const shoe = await seller("88", "store", `Shoe Palace ${tag}`);
r = await call("POST", "/api/shop/products", { name: "Too early" }, shoe.token);
check(r.status === 403, "can't add products before the shop is approved");
await call("POST", `/api/admin/shops/${shoe.shopId}/approve`, undefined, admin);

const cats = (await call("GET", "/api/public/categories")).data.items as any[];
const shoesCat = cats.find((c) => c.kind === "goods" && c.slug === "shoes") ?? cats.find((c) => c.kind === "goods");
const foodCat = cats.find((c) => c.kind === "food");

r = await call("POST", "/api/uploads", photos(3), shoe.token);
const imgs = r.data.urls as string[];

// ─── Seller adds products ──────────────────────────────────────────────────
r = await call("POST", "/api/shop/products", { name: "", price: 0, images: [], categoryId: "x" }, shoe.token);
check(r.status === 400 && r.data.fields.name && r.data.fields.price && r.data.fields.images && r.data.fields.categoryId, "product form checks every field", r.data);

r = await call("POST", "/api/shop/products", { name: "Boots", price: 500000, images: imgs, categoryId: foodCat.id }, shoe.token);
check(r.status === 400 && r.data.fields?.categoryId, "a shop can't use a food category");

r = await call("POST", "/api/shop/products", { name: "Boots", price: 500000, compareAtPrice: 400000, images: imgs, categoryId: shoesCat.id }, shoe.token);
check(r.status === 400 && r.data.fields?.compareAtPrice, "old price must be higher than the price");

r = await call(
  "POST",
  "/api/shop/products",
  { name: `Leather boots ${tag}`, description: "Brown, sizes 40-45", price: 450000, compareAtPrice: 600000, stock: 5, images: imgs, categoryId: shoesCat.id },
  shoe.token
);
check(r.status === 201 && r.data.product.status === "pending" && r.data.product.kind === "goods", "seller adds a product — waiting for review");
const boots = r.data.product.id as string;

r = await call("POST", "/api/shop/products", { name: `Canvas sneakers ${tag}`, price: 150000, images: [imgs[0]], categoryId: shoesCat.id }, shoe.token);
const sneakers = r.data.product.id as string;

r = await call("GET", "/api/shop/products", undefined, shoe.token);
check(r.data.items.length === 2, "seller sees their products");

r = await call("GET", `/api/public/products?q=${tag}`);
check(r.data.total === 0, "waiting products aren't on sale");
r = await call("GET", `/api/public/products/${boots}`);
check(r.status === 404, "waiting product page isn't public");

// ─── Admin review ──────────────────────────────────────────────────────────
r = await call("GET", "/api/admin/stats", undefined, admin);
check(r.data.products.pending >= 2, "overview counts waiting products");
r = await call("GET", `/api/admin/products?status=pending&q=${tag}`, undefined, admin);
check(r.data.items.length === 2 && r.data.items[0].shop.ownerName, "admin queue lists them with the owner");

r = await call("POST", `/api/admin/products/${sneakers}/reject`, { reason: "x" }, admin);
check(r.status === 400, "sending back needs a reason");
r = await call("POST", `/api/admin/products/${sneakers}/reject`, { reason: "Please add photos of both sides" }, admin);
check(r.data.product.status === "rejected" && r.data.product.reviewedBy?.fullName, "admin sends one back");
r = await call("POST", `/api/admin/products/${boots}/approve`, undefined, admin);
check(r.data.product.status === "approved", "admin approves the other");
r = await call("POST", `/api/admin/products/${sneakers}/feature`, { featured: true }, admin);
check(r.status === 400, "only live products can be featured");
r = await call("POST", `/api/admin/products/${boots}/feature`, { featured: true }, admin);
check(r.data.product.featured === true, "admin features the live one");

// ─── Storefront ────────────────────────────────────────────────────────────
r = await call("GET", `/api/public/products?q=${tag}`);
check(r.data.total === 1 && r.data.items[0].id === boots && r.data.items[0].image && r.data.items[0].shop.slug === shoe.slug, "live product shows in search");
r = await call("GET", `/api/public/products?q=leather%20${tag}&mode=goods&category=${shoesCat.slug}`);
check(r.data.total === 1, "search with several words, side and category");
r = await call("GET", `/api/public/products?q=${tag}&mode=food`);
check(r.data.total === 0, "goods don't show on the food side");
r = await call("GET", `/api/public/products?q=palace%20${tag}`);
check(r.data.total === 1, "search finds products by shop name");
r = await call("GET", `/api/public/products/${boots}`);
check(r.status === 200 && r.data.product.images.length === 3 && r.data.product.shop.phone && r.data.product.inStock, "product page has photos and the shop's phone");
check(!("status" in r.data.product) && !("hidden" in r.data.product), "product page hides review details");
r = await call("GET", `/api/public/shops/${shoe.slug}`);
check(r.status === 200 && r.data.shop.productCount === 1, "shop page counts live products");
r = await call("GET", `/api/public/shops?q=${tag}`);
check(r.data.items.length === 1, "shops are searchable");
r = await call("GET", `/api/public/products?shop=${shoe.slug}`);
check(r.data.total === 1, "products of one shop");

// ─── Edits ─────────────────────────────────────────────────────────────────
r = await call("PATCH", `/api/shop/products/${boots}`, { price: 420000, stock: 0 }, shoe.token);
check(r.data.product.status === "approved" && r.data.needsReview === false, "price and stock changes stay live");
r = await call("GET", `/api/public/products/${boots}`);
check(r.data.product.price === 420000 && r.data.product.inStock === false, "shoppers see new price and sold out");
r = await call("PATCH", `/api/shop/products/${boots}`, { price: 700000 }, shoe.token);
check(r.status === 400 && r.data.fields?.compareAtPrice, "price can't go above the saved old price");
r = await call("PATCH", `/api/shop/products/${boots}`, { hidden: true }, shoe.token);
r = await call("GET", `/api/public/products/${boots}`);
check(r.status === 404, "seller pauses a product — it disappears");
await call("PATCH", `/api/shop/products/${boots}`, { hidden: false, stock: 3 }, shoe.token);

r = await call("PATCH", `/api/shop/products/${boots}`, { name: `Leather boots deluxe ${tag}` }, shoe.token);
check(r.data.product.status === "pending" && r.data.needsReview === true && r.data.product.featured === false, "renaming sends it back for review");
r = await call("GET", `/api/public/products/${boots}`);
check(r.status === 404, "…and it's off sale until approved");
await call("POST", `/api/admin/products/${boots}/approve`, undefined, admin);

r = await call("PATCH", `/api/shop/products/${sneakers}`, { images: imgs }, shoe.token);
check(r.data.product.status === "pending" && r.data.product.statusReason === null, "fixing a sent-back product puts it back in the queue");

// ─── Take-downs ────────────────────────────────────────────────────────────
r = await call("POST", `/api/admin/products/${boots}/remove`, { reason: "Counterfeit brand" }, admin);
check(r.data.product.status === "removed", "admin removes a product");
r = await call("PATCH", `/api/shop/products/${boots}`, { price: 100000 }, shoe.token);
check(r.status === 403 && r.data.error.includes("Counterfeit"), "seller can't edit a removed product and sees why");
r = await call("POST", `/api/admin/products/${boots}/restore`, undefined, admin);
check(r.data.product.status === "approved", "admin restores it");

await call("POST", `/api/admin/shops/${shoe.shopId}/suspend`, { reason: "Checking complaints" }, admin);
r = await call("GET", `/api/public/products?q=${tag}`);
check(r.data.total === 0, "a suspended shop's products disappear");
r = await call("GET", `/api/public/shops/${shoe.slug}`);
check(r.status === 404, "…and its shop page");
r = await call("POST", "/api/shop/products", { name: "New", price: 100, images: imgs, categoryId: shoesCat.id }, shoe.token);
check(r.status === 403, "suspended sellers can't add products");
await call("POST", `/api/admin/shops/${shoe.shopId}/reinstate`, undefined, admin);
r = await call("GET", `/api/public/products?q=${tag}`);
check(r.data.total === 1, "reinstated shop is back on sale");

// ─── Food side and categories ──────────────────────────────────────────────
const kitchen = await seller("77", "restaurant", `Kitchen ${tag}`);
await call("POST", `/api/admin/shops/${kitchen.shopId}/approve`, undefined, admin);
r = await call("POST", "/api/shop/products", { name: `Jollof rice ${tag}`, price: 35000, images: [imgs[0]], categoryId: foodCat.id }, kitchen.token);
check(r.status === 201 && r.data.product.kind === "food", "a restaurant adds a dish");
await call("POST", `/api/admin/products/${r.data.product.id}/approve`, undefined, admin);
r = await call("GET", `/api/public/products?q=${tag}&mode=food`);
check(r.data.total === 1 && r.data.items[0].kind === "food", "dish shows on the food side only");

r = await call("GET", `/api/public/products?q=${tag}&sort=price_asc`);
check(r.data.items[0].price <= r.data.items[r.data.items.length - 1].price, "sort by price");

r = await call("DELETE", `/api/admin/categories/${shoesCat.id}`, undefined, admin);
check(r.status === 409, "a category in use can't be deleted");

r = await call("DELETE", `/api/shop/products/${sneakers}`, undefined, kitchen.token);
check(r.status === 404, "sellers can't touch other shops' products");
r = await call("DELETE", `/api/shop/products/${sneakers}`, undefined, shoe.token);
check(r.status === 204, "seller deletes their own product");

r = await call("GET", "/api/admin/audit-log", undefined, admin);
const actions = new Set(r.data.items.map((e: any) => e.action));
check(["product.approve", "product.reject", "product.remove", "product.restore", "product.feature"].every((a) => actions.has(a)), "product reviews are in the audit log");

console.log(`\n${passed} checks passed`);
