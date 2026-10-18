/**
 * End-to-end check of the phase 4 API (cart, checkout, orders, riders)
 * against a running server.   npx tsx src/scripts/smoke-phase4.ts
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

// Delivery fee LD 150, free over LD 4,000.
r = await call("GET", "/api/admin/settings/delivery", undefined, admin);
const originalDelivery = r.data.delivery;
r = await call("PUT", "/api/admin/settings/delivery", { fee: 15000, freeOver: 400000, methods: { cod: true, mtn_momo: true, orange_money: false, card: false } }, admin);
check(r.status === 400, "mobile money can't be switched on before it's connected");
r = await call("PUT", "/api/admin/settings/delivery", { fee: 15000, freeOver: 400000, methods: { cod: true, mtn_momo: false, orange_money: false, card: false } }, admin);
check(r.status === 200 && r.data.delivery.fee === 15000, "admin sets the delivery fee");

const shoes = await sellerWithProducts("88", "store", `Shoes ${n}`, [
  { name: "Boots", price: 400000, stock: 2 },
  { name: "Socks", price: 20000, stock: null },
]);
const food = await sellerWithProducts("77", "restaurant", `Kitchen ${n}`, [{ name: "Jollof", price: 35000, stock: null }]);
const [boots, socks] = shoes.products;
const [jollof] = food.products;
const buyer = await person("55", "Grace Buyer");
const riderUser = await person("66", "Momo Rider");
await call("PATCH", `/api/admin/users/${riderUser.id}/role`, { role: "rider" }, admin);
const rider = (await call("POST", "/api/auth/login", { phone: `066${n}`, password: "password123" })).data.accessToken as string;

// ─── Quote ─────────────────────────────────────────────────────────────────
r = await call("POST", "/api/cart/quote", { items: [] }, buyer.token);
check(r.status === 400, "empty cart is refused");
r = await call("POST", "/api/cart/quote", { items: [{ productId: boots, quantity: 1 }, { productId: socks, quantity: 3 }, { productId: jollof, quantity: 2 }] }, buyer.token);
const q = r.data.quote;
check(r.status === 200 && q.ok && q.shops.length === 2, "quote splits the cart by shop", q);
check(q.subtotal === 400000 + 60000 + 70000, "quote uses the server's prices");
const shoeShop = q.shops.find((s: any) => s.shop.id === shoes.shopId);
const foodShop = q.shops.find((s: any) => s.shop.id === food.shopId);
check(shoeShop.deliveryFee === 0 && foodShop.deliveryFee === 15000, "free delivery over LD 4,000, fee under it");
check(q.paymentMethods.find((m: any) => m.method === "cod").enabled && !q.paymentMethods.find((m: any) => m.method === "card").enabled, "only cash on delivery is on");

r = await call("POST", "/api/cart/quote", { items: [{ productId: boots, quantity: 5 }] }, buyer.token);
check(!r.data.quote.ok && r.data.quote.lines[0].problem === "Only 2 left", "quote warns when there isn't enough stock");
r = await call("POST", "/api/cart/quote", { items: [{ productId: boots, quantity: 1 }] }, shoes.token);
check(r.data.quote.lines[0].problem?.includes("own shop"), "sellers can't buy from themselves");

// ─── Checkout ──────────────────────────────────────────────────────────────
const delivery = { name: "Grace Buyer", phone: `055${n}`, city: "Monrovia", address: "12 Randall Street, blue gate", note: "Call when outside" };
r = await call("POST", "/api/orders", { items: [{ productId: boots, quantity: 1 }], delivery: { ...delivery, address: "" }, paymentMethod: "cod" }, buyer.token);
check(r.status === 400 && r.data.fields["delivery.address"], "checkout checks the address");
r = await call("POST", "/api/orders", { items: [{ productId: boots, quantity: 1 }], delivery, paymentMethod: "card" }, buyer.token);
check(r.status === 400 && r.data.fields?.paymentMethod, "card isn't accepted yet");
r = await call("POST", "/api/orders", { items: [{ productId: boots, quantity: 3 }], delivery, paymentMethod: "cod" }, buyer.token);
check(r.status === 409 && r.data.error.includes("Only 2 left"), "can't order more than the stock");

r = await call(
  "POST",
  "/api/orders",
  { items: [{ productId: boots, quantity: 2 }, { productId: socks, quantity: 1 }, { productId: jollof, quantity: 2 }], delivery, paymentMethod: "cod" },
  buyer.token
);
check(r.status === 201 && r.data.orders.length === 2, "checkout places one order per shop");
const shoeOrder = r.data.orders.find((o: any) => o.shop.id === shoes.shopId);
const foodOrder = r.data.orders.find((o: any) => o.shop.id === food.shopId);
check(/^YB-\d{5,}$/.test(shoeOrder.number) && shoeOrder.status === "placed" && shoeOrder.paymentStatus === "pending", "order has a number, waits for the shop, not paid yet");
check(shoeOrder.total === 820000 && shoeOrder.deliveryFee === 0 && foodOrder.total === 70000 + 15000, "order totals include delivery");
check(shoeOrder.items.length === 2 && shoeOrder.items[0].name && shoeOrder.items[0].price, "order keeps a copy of names and prices");

r = await call("GET", `/api/public/products/${boots}`);
check(r.data.product.inStock === false && r.data.product.stock === 0, "stock goes down when ordered");
r = await call("POST", "/api/orders", { items: [{ productId: boots, quantity: 1 }], delivery, paymentMethod: "cod" }, riderUser.token);
check(r.status === 409, "nobody can buy what's sold out");

r = await call("GET", "/api/orders", undefined, buyer.token);
check(r.data.items.length === 2 && r.data.items[0].itemCount > 0, "buyer sees their orders");
r = await call("GET", `/api/orders/${shoeOrder.id}`, undefined, food.token);
check(r.status === 404, "other people can't open someone's order");
r = await call("GET", "/api/orders/last-delivery", undefined, buyer.token);
check(r.data.delivery.address === delivery.address, "checkout remembers the last address");

// ─── Buyer cancels the food order ──────────────────────────────────────────
r = await call("POST", `/api/orders/${foodOrder.id}/cancel`, { reason: "Ordered by mistake" }, buyer.token);
check(r.data.order.status === "cancelled" && r.data.order.cancelledBy === "buyer", "buyer cancels before the shop accepts");
r = await call("GET", "/api/shop/orders?view=done", undefined, food.token);
check(r.data.items.some((o: any) => o.id === foodOrder.id), "restaurant sees the cancelled order");

// ─── Seller ────────────────────────────────────────────────────────────────
r = await call("GET", "/api/shop/orders", undefined, shoes.token);
check(r.data.items.some((o: any) => o.id === shoeOrder.id), "seller sees the new order");
r = await call("GET", `/api/shop/orders/${shoeOrder.id}`, undefined, shoes.token);
check(r.data.order.delivery.phone && r.data.order.buyer.fullName === "Grace Buyer", "seller sees who ordered and where to deliver");
r = await call("POST", `/api/shop/orders/${shoeOrder.id}/ready`, undefined, shoes.token);
check(r.status === 409, "steps can't be skipped");
r = await call("POST", `/api/admin/orders/${shoeOrder.id}/assign`, { riderId: riderUser.id }, admin);
check(r.status === 400, "no rider before the shop accepts");
r = await call("POST", `/api/shop/orders/${shoeOrder.id}/accept`, undefined, shoes.token);
check(r.data.order.status === "accepted" && r.data.order.acceptedAt, "seller accepts");
r = await call("POST", `/api/orders/${shoeOrder.id}/cancel`, {}, buyer.token);
check(r.status === 409 && r.data.error.includes("already accepted"), "buyer can't cancel once accepted");

// ─── Admin assigns a rider ─────────────────────────────────────────────────
r = await call("GET", "/api/admin/stats", undefined, admin);
check(r.data.orders.needRider >= 1, "overview counts orders needing a rider");
r = await call("GET", "/api/admin/orders?view=need_rider", undefined, admin);
check(r.data.items.some((o: any) => o.id === shoeOrder.id), "admin sees it in 'needs a rider'");
r = await call("GET", `/api/admin/orders?q=${shoeOrder.number.replace("YB-", "")}`, undefined, admin);
check(r.data.items[0]?.id === shoeOrder.id, "admin finds an order by its number");
r = await call("POST", `/api/admin/orders/${shoeOrder.id}/assign`, { riderId: buyer.id }, admin);
check(r.status === 400, "only riders can be assigned");
r = await call("GET", "/api/admin/riders", undefined, admin);
check(r.data.items.some((x: any) => x.id === riderUser.id && x.activeDeliveries === 0), "admin sees free riders");
r = await call("POST", `/api/admin/orders/${shoeOrder.id}/assign`, { riderId: riderUser.id }, admin);
check(r.data.order.rider?.fullName === "Momo Rider", "admin assigns the rider");

// ─── Rider ─────────────────────────────────────────────────────────────────
r = await call("GET", "/api/rider/orders", undefined, buyer.token);
check(r.status === 403, "only riders open the rider list");
r = await call("GET", "/api/rider/orders", undefined, rider);
check(r.data.items.some((o: any) => o.id === shoeOrder.id), "rider sees the delivery");
r = await call("GET", `/api/rider/orders/${shoeOrder.id}`, undefined, rider);
check(r.data.order.shop.address && r.data.order.delivery.address, "rider sees pickup and drop-off");
r = await call("POST", `/api/rider/orders/${shoeOrder.id}/picked-up`, undefined, rider);
check(r.status === 409, "rider can't pick up before it's packed");
await call("POST", `/api/shop/orders/${shoeOrder.id}/ready`, undefined, shoes.token);
r = await call("POST", `/api/shop/orders/${shoeOrder.id}/reject`, { reason: "Changed my mind" }, shoes.token);
check(r.status === 409, "seller can't cancel once it's packed");
r = await call("POST", `/api/rider/orders/${shoeOrder.id}/picked-up`, undefined, rider);
check(r.data.order.status === "picked_up", "rider picks it up");
r = await call("POST", `/api/rider/orders/${shoeOrder.id}/delivered`, { cashCollected: false }, rider);
check(r.status === 400, "cash must be confirmed for cash on delivery");
r = await call("POST", `/api/rider/orders/${shoeOrder.id}/delivered`, { cashCollected: true }, rider);
check(r.data.order.status === "delivered" && r.data.order.paymentStatus === "paid", "delivered and paid");

r = await call("GET", `/api/orders/${shoeOrder.id}`, undefined, buyer.token);
const steps = r.data.order.events.map((e: any) => e.status);
check(["placed", "accepted", "rider_assigned", "ready", "picked_up", "delivered"].every((s) => steps.includes(s)), "buyer sees the full timeline", steps);
r = await call("GET", "/api/admin/stats", undefined, admin);
check(r.data.orders.deliveredToday >= 1 && r.data.orders.salesToday >= 820000, "overview counts today's sales");

// ─── Seller rejects, admin cancels, stock comes back ───────────────────────
r = await call("POST", "/api/orders", { items: [{ productId: socks, quantity: 1 }], delivery, paymentMethod: "cod" }, buyer.token);
const second = r.data.orders[0].id;
r = await call("POST", `/api/shop/orders/${second}/reject`, { reason: "x" }, shoes.token);
check(r.status === 400, "turning an order down needs a reason");
r = await call("POST", `/api/shop/orders/${second}/reject`, { reason: "Out of socks today" }, shoes.token);
check(r.data.order.status === "cancelled" && r.data.order.cancelledBy === "seller", "seller turns an order down");

await call("PATCH", `/api/shop/products/${boots}`, { stock: 1 }, shoes.token);
r = await call("POST", "/api/orders", { items: [{ productId: boots, quantity: 1 }], delivery, paymentMethod: "cod" }, buyer.token);
const third = r.data.orders[0].id;
r = await call("GET", `/api/public/products/${boots}`);
check(r.data.product.stock === 0, "last pair bought");
r = await call("POST", `/api/admin/orders/${third}/cancel`, { reason: "Buyer asked by phone" }, admin);
check(r.data.order.status === "cancelled" && r.data.order.cancelledBy === "admin", "admin cancels an order");
r = await call("GET", `/api/public/products/${boots}`);
check(r.data.product.stock === 1, "cancelled orders put the stock back");

r = await call("GET", "/api/admin/audit-log", undefined, admin);
const actions = new Set(r.data.items.map((e: any) => e.action));
check(["order.assign", "order.cancel", "settings.delivery"].every((a) => actions.has(a)), "admin order actions are in the audit log");

await call("PUT", "/api/admin/settings/delivery", originalDelivery, admin);
console.log(`\n${passed} checks passed`);
