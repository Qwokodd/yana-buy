/**
 * End-to-end check of the Shopify import: shops, products with options and photos, customers taking over
 * their account, past orders, the contact list and handing a shop to its owner
 * against a running server.   npx tsx src/scripts/smoke-shopify.ts
 * Needs the admin from README (0770000001 / adminpass123). Uses throwaway accounts.
 */
export {};
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

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





// A pretend Shopify photo server.
const png = Buffer.from(PNG);
const photoServer = http.createServer((req, res) => {
  if (req.url?.includes("missing")) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "content-type": "image/png" });
  res.end(png);
});
await new Promise<void>((ok) => photoServer.listen(4601, ok));
const IMG = "http://localhost:4601/s/files";

const csv = (rows: Record<string, string>[]) => {
  const head = Object.keys(rows[0]);
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [head.join(","), ...rows.map((r) => head.map((h) => cell(r[h] ?? "")).join(","))].join("\n");
};
const vendor = `Test Crochet ${n}`;
const kitchen = `Test Kitchen ${n}`;
const P = (o: Record<string, string>) => ({
  Handle: "", Title: "", "Body (HTML)": "", Vendor: "", "Product Category": "", Type: "", Status: "", "Option1 Name": "", "Option1 Value": "", "Option2 Name": "", "Option2 Value": "",
  "Variant Price": "", "Variant Compare At Price": "", "Image Src": "", "Image Position": "", "Variant Image": "", ...o,
});
const products = [
  P({ Handle: `durag-${n}`, Title: "Loc Shell Durag", "Body (HTML)": "<p>Hand <b>made</b> crochet.</p><ul><li>Soft</li></ul>", Vendor: vendor, "Product Category": "Apparel & Accessories > Clothing Accessories", Type: "Retail", Status: "active",
     "Option1 Name": "Color", "Option1 Value": "Black", "Option2 Name": "Size", "Option2 Value": "M", "Variant Price": "4.88", "Variant Compare At Price": "5.85", "Image Src": `${IMG}/durag1.jpg?v=1`, "Image Position": "1", "Variant Image": `${IMG}/durag-black.jpg` }),
  P({ Handle: `durag-${n}`, "Option1 Value": "Gold", "Option2 Value": "L", "Variant Price": "6.00", "Image Src": `${IMG}/durag2.jpg`, "Image Position": "2", "Variant Image": `${IMG}/durag-gold.jpg` }),
  P({ Handle: `durag-${n}`, "Option1 Value": "Gold", "Option2 Value": "M", "Variant Price": "0.00" }),
  P({ Handle: `jollof-${n}`, Title: "Jollof Rice & Chicken", Vendor: kitchen, "Product Category": "Food, Beverages & Tobacco > Food Items > Prepared Foods", Type: "Food", Status: "active", "Option1 Name": "Title", "Option1 Value": "Default Title", "Variant Price": "3.50", "Image Src": `${IMG}/jollof.jpg` }),
  P({ Handle: `juice-${n}`, Title: "Fresh Orange Juice", Vendor: kitchen, "Product Category": "Food, Beverages & Tobacco > Beverages > Juices", Type: "Food", Status: "draft", "Option1 Name": "Title", "Option1 Value": "Default Title", "Variant Price": "1.50", "Image Src": `${IMG}/missing.jpg` }),
];
const custPhone = `077${String(n).slice(-7)}`;
const custPhone2 = `088${String(n).slice(-7)}`;
const customers = [
  { "Customer ID": `'9${n}1`, "First Name": "Maryam", "Last Name": "Barry", Email: `maryam${n}@example.com`, Phone: `'+231${custPhone.slice(1)}`, "Default Address Phone": "", "Default Address City": "Monrovia", "Default Address Address1": "Clara Town", "Default Address Address2": "", "Total Spent": "24.40", "Total Orders": "3", "Accepts Email Marketing": "yes", "Accepts SMS Marketing": "no", Tags: "", Note: "" },
  { "Customer ID": `'9${n}2`, "First Name": "Kebbeh", "Last Name": "", Email: "", Phone: "", "Default Address Phone": `'${custPhone2}`, "Default Address City": "Paynesville", "Default Address Address1": "", "Default Address Address2": "", "Total Spent": "0.00", "Total Orders": "0", "Accepts Email Marketing": "no", "Accepts SMS Marketing": "yes", Tags: "vip", Note: "" },
  { "Customer ID": `'9${n}3`, "First Name": "No", "Last Name": "Phone", Email: `nophone${n}@example.com`, Phone: "", "Default Address Phone": "", "Default Address City": "", "Default Address Address1": "", "Default Address Address2": "", "Total Spent": "0", "Total Orders": "0", "Accepts Email Marketing": "no", "Accepts SMS Marketing": "no", Tags: "", Note: "" },
];
const O = (o: Record<string, string>) => ({ Name: "", Email: "", "Financial Status": "", "Fulfillment Status": "", Currency: "", Subtotal: "", Shipping: "", Total: "", "Discount Code": "", "Discount Amount": "", "Shipping Method": "", "Created at": "", "Lineitem quantity": "", "Lineitem name": "", "Lineitem price": "", "Lineitem sku": "", "Shipping Name": "", "Shipping Address1": "", "Shipping City": "", "Shipping Phone": "", "Billing Phone": "", Notes: "", "Cancelled at": "", "Payment Method": "", "Refunded Amount": "", Vendor: "", Id: "", Phone: "", ...o });
const orderName = `#T${n}`;
const orders = [
  O({ Name: orderName, Email: `maryam${n}@example.com`, "Financial Status": "paid", "Fulfillment Status": "fulfilled", Currency: "USD", Subtotal: "9.76", Shipping: "0.90", Total: "10.66", "Shipping Method": "Sinkor-City Hall", "Created at": "2026-10-15 13:02:53 +0000", "Lineitem quantity": "2", "Lineitem name": "Loc Shell Durag - Black / M", "Lineitem price": "4.88", "Shipping Name": "Maryam Barry", "Shipping Address1": "Clara town", "Shipping City": "Monrovia", "Shipping Phone": custPhone, "Payment Method": "Cash on Delivery (COD)", Vendor: vendor, Id: "1" }),
  O({ Name: orderName, "Lineitem quantity": "1", "Lineitem name": "Jollof Rice & Chicken", "Lineitem price": "3.50", Vendor: kitchen }),
  O({ Name: `#U${n}`, "Financial Status": "pending", "Fulfillment Status": "unfulfilled", Currency: "USD", Subtotal: "3.50", Shipping: "0", Total: "3.50", "Created at": "2026-09-01 10:00:00 +0000", "Lineitem quantity": "1", "Lineitem name": "Jollof Rice & Chicken", "Lineitem price": "3.50", "Shipping Phone": "0555000000", Vendor: kitchen }),
];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shopify-"));
fs.writeFileSync(path.join(dir, "products_export_1.csv"), csv(products));
fs.writeFileSync(path.join(dir, "customers_export.csv"), csv(customers));
fs.writeFileSync(path.join(dir, "orders_export_1.csv"), csv(orders));

// Runs the import in its own process (not blocking this one, which serves the pretend photos).
const run = (...extra: string[]) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((done) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/scripts/import-shopify.ts", "--dir", dir, "--shop-phone", "0770000002", ...extra], { env: { ...process.env, PUBLIC_URL: BASE } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => done({ status, stdout, stderr }));
  });

// ─── Practice run ─────────────────────────────────────────────────────────
let out = await run("--dry-run");
check(out.status === 0 && out.stdout.includes("PRACTICE RUN"), "practice run finishes", out.stderr || out.stdout.slice(-800));
check(fs.existsSync(path.join(dir, "import-report-practice.txt")), "practice run writes a report");
r = await call("GET", `/api/public/shops?q=${encodeURIComponent(vendor)}`);
check(r.data.items.length === 0, "a practice run changes nothing");

// ─── Real import ──────────────────────────────────────────────────────────
out = await run();
check(out.status === 0, "import finishes", out.stderr || out.stdout.slice(-800));
const report = fs.readFileSync(path.join(dir, "import-report.txt"), "utf8");
check(/photos (already )?downloaded/.test(report) && report.includes("missing.jpg"), "photos are downloaded, and a broken one is listed in the report");

r = await call("GET", `/api/public/shops?q=${encodeURIComponent(vendor)}`);
check(r.data.items.length === 1 && r.data.items[0].kind === "store", "vendor becomes an approved shop");
r = await call("GET", `/api/public/shops?q=${encodeURIComponent(kitchen)}`);
check(r.data.items.length === 1 && r.data.items[0].kind === "restaurant", "a food vendor becomes a restaurant");

r = await call("GET", `/api/public/products?q=${encodeURIComponent("Loc Shell Durag")}`);
const card = r.data.items.find((p: any) => p.shop.name === vendor);
check(card && card.price === 488 && card.hasOptions && card.category?.name === "Fashion", "product is on sale with the cheapest price and a mapped category", card);
r = await call("GET", `/api/public/products/${card.id}`);
const durag = r.data.product;
check(durag.options.length === 2 && durag.variants.length === 2, "options come over (the one with no price is left out)", durag.options);
check(durag.images.length === 2 && durag.images.every((u: string) => u.startsWith(`${BASE}/uploads/shopify/`)), "photos are stored in YanaBuy, not on Shopify");
check(durag.variants.find((v: any) => v.values.join() === "Gold,L")?.image?.includes("/uploads/shopify/"), "each choice keeps its own photo");
check(durag.description?.includes("Hand made crochet") && !durag.description.includes("<"), "the description is plain text");
const img = await fetch(durag.images[0]);
check(img.status === 200, "the downloaded photo opens");

r = await call("GET", `/api/public/products?q=${encodeURIComponent("Jollof Rice & Chicken")}`);
const jollof = r.data.items.find((p: any) => p.shop.name === kitchen);
check(jollof && jollof.kind === "food" && jollof.category?.name === "Local dishes" && !jollof.hasOptions, "food item lands in Food with a simple price");
r = await call("GET", `/api/public/products?q=${encodeURIComponent("Fresh Orange Juice")}`);
check(!r.data.items.some((p: any) => p.shop.name === kitchen), "a Shopify draft (and an item with no photo) stays hidden");

// ─── Customers ────────────────────────────────────────────────────────────
r = await call("POST", "/api/auth/login", { phone: custPhone, password: "anything123" });
check(r.status === 401 && r.data.error.includes("Sign up"), "an imported customer is told to sign up to set a password");
r = await call("POST", "/api/auth/register", { fullName: "Maryam B.", phone: custPhone, email: `${crypto.randomUUID().slice(0, 12)}@test.yanabuy.com`, password: "newpass123" });
check(r.status === 201 && r.data.welcomeBack, "signing up with the same number takes over the account");
const maryam = r.data.accessToken;
r = await call("GET", "/api/me/shopify-orders", undefined, maryam);
check(r.data.items.length === 1 && r.data.items[0].name === orderName && r.data.items[0].items.length === 2 && r.data.items[0].total === 1066, "they see their past order with its items");
check(r.data.items[0].notes === null, "buyers don't see admin notes");
r = await call("POST", "/api/auth/login", { phone: custPhone, password: "newpass123" });
check(r.status === 200, "and can log in with the new password");

const later = await person("55", "Walk-in Buyer");
r = await call("GET", "/api/me/shopify-orders", undefined, later.token);
check(r.status === 200 && r.data.items.length === 0, "someone else sees no Shopify orders");

// ─── Admin: archive and contacts ─────────────────────────────────────────
r = await call("GET", "/api/admin/shopify/summary", undefined, admin);
check(r.status === 200 && r.data.summary.orders >= 2 && r.data.summary.importedShops >= 2, "admin sees the Shopify summary");
r = await call("GET", `/api/admin/shopify/orders?q=${encodeURIComponent(orderName)}`, undefined, admin);
check(r.data.items.length === 1 && r.data.items[0].shippingMethod === "Sinkor-City Hall", "admin finds a past order");
r = await call("GET", `/api/admin/shopify/contacts?q=${encodeURIComponent(`nophone${n}`)}`, undefined, admin);
check(r.data.items.length === 1 && !r.data.items[0].hasAccount, "customers without a phone are on the contact list only");
const csvRes = await fetch(`${BASE}/api/admin/shopify/contacts.csv`, { headers: { Authorization: `Bearer ${admin}` } });
const csvText = await csvRes.text();
check(csvRes.status === 200 && csvText.includes(`maryam${n}@example.com`) && csvText.includes("Kebbeh"), "admin downloads the contact list");
r = await call("GET", "/api/admin/shopify/summary", undefined, maryam);
check(r.status === 403, "only admins see the archive");

// ─── Hand a shop to its owner ────────────────────────────────────────────
const shops = (await call("GET", `/api/admin/shops?q=${encodeURIComponent(vendor)}`, undefined, admin)).data.items;
const imported = shops[0];
check(imported.importedFrom === "shopify" && imported.owner.unclaimed, "admin sees the shop is waiting for its owner");
r = await call("POST", `/api/admin/shops/${imported.id}/handover`, { phone: `0779${String(n).slice(-6)}` }, admin);
check(r.status === 404, "can't hand over to a number nobody has signed up with");
const bibi = await person("57", "Bibi Owner");
r = await call("POST", `/api/admin/shops/${imported.id}/handover`, { phone: `057${n}` }, admin);
check(r.status === 200 && r.data.owner.fullName === "Bibi Owner", "admin hands the shop to the owner");
const bibiLogin = (await call("POST", "/api/auth/login", { phone: `057${n}`, password: "password123" })).data.accessToken;
r = await call("GET", "/api/shop/products", undefined, bibiLogin);
check(r.data.items.length === 1 && r.data.items[0].name === "Loc Shell Durag", "the owner now manages the imported products");
r = await call("POST", `/api/admin/shops/${imported.id}/handover`, { phone: `055${n}` }, admin);
check(r.status === 409, "a shop can only be handed over once");

// ─── Running it again ─────────────────────────────────────────────────────
out = await run();
check(out.status === 0 && out.stdout.includes("products updated") && out.stdout.includes("orders already in the archive"), "running the import again updates instead of copying", out.stdout.slice(-800));
r = await call("GET", `/api/public/products?q=${encodeURIComponent("Loc Shell Durag")}`);
check(r.data.items.filter((p: any) => p.shop.name === vendor).length === 1, "no duplicate products");
r = await call("GET", `/api/public/products/${card.id}`);
check(r.data.product.variants.map((v: any) => v.id).join() === durag.variants.map((v: any) => v.id).join(), "option ids stay the same, so carts keep working");

photoServer.close();
console.log(`\n${passed} checks passed`);
