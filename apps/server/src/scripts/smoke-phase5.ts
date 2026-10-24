/**
 * End-to-end check of the phase 5 API (commission, wallets, payouts, rider
 * cash, MTN Mobile Money) against a running server.
 *   npx tsx src/scripts/mock-mtn.ts      (pretend MTN, port 4555)
 *   start the API with MTN_MOMO_BASE_URL=http://localhost:4555 MTN_MOMO_SUBSCRIPTION_KEY=x MTN_MOMO_API_USER=x MTN_MOMO_API_KEY=x
 *   npx tsx src/scripts/smoke-phase5.ts
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const n = String(Date.now()).slice(-6);
let r = await call("POST", "/api/auth/login", { phone: "0770000001", password: "adminpass123" });
const admin = r.data.accessToken as string;

async function person(prefix: string, name: string) {
  const reg = await call("POST", "/api/auth/register", { fullName: name, phone: `0${prefix}${n}0`, email: `${crypto.randomUUID().slice(0, 12)}@test.yanabuy.com`, password: "password123" });
  return { token: reg.data.accessToken as string, id: reg.data.user.id as string, phone: `0${prefix}${n}0` };
}

// Shop with one product (LD 1,000), a rider, a buyer.
const seller = await person("88", "Wallet Seller");
const up = await call("POST", "/api/uploads/private", photos(2), seller.token);
const app = await call(
  "POST",
  "/api/shop/apply",
  { kind: "store", name: `Wallet Shop ${n}`, phone: seller.phone, city: "Monrovia", address: "Broad Street", idType: "passport", idFrontKey: up.data.files[0].key, selfieKey: up.data.files[1].key },
  seller.token
);
const shopId = app.data.shop.id as string;
await call("POST", `/api/admin/shops/${shopId}/approve`, undefined, admin);
const cat = (await call("GET", "/api/public/categories?kind=goods")).data.items[0];
const img = (await call("POST", "/api/uploads", photos(1), seller.token)).data.urls;
const prod = await call("POST", "/api/shop/products", { name: "Radio", price: 100000, stock: 10, images: img, categoryId: cat.id }, seller.token);
const productId = prod.data.product.id as string;
await call("POST", `/api/admin/products/${productId}/approve`, undefined, admin);
const riderU = await person("66", "Cash Rider");
await call("PATCH", `/api/admin/users/${riderU.id}/role`, { role: "rider" }, admin);
const rider = (await call("POST", "/api/auth/login", { phone: riderU.phone, password: "password123" })).data.accessToken as string;
const buyer = await person("55", "Money Buyer");

r = await call("GET", "/api/admin/settings/finance", undefined, admin);
const originalFinance = r.data.finance;
r = await call("PUT", "/api/admin/settings/finance", { goodsCommission: 80, foodCommission: 10, minPayout: 10000 }, admin);
check(r.status === 400, "commission over 50% is refused");
r = await call("PUT", "/api/admin/settings/finance", { goodsCommission: 12, foodCommission: 8, minPayout: 20000 }, admin);
check(r.data.finance.goodsCommission === 12, "admin sets commission 12% and minimum payout LD 200");
r = await call("GET", "/api/admin/settings/delivery", undefined, admin);
const originalDelivery = r.data.delivery;
check(r.data.ready.includes("mtn_momo"), "server reports MTN Mobile Money as connected");
r = await call("PUT", "/api/admin/settings/delivery", { fee: 10000, freeOver: null, methods: { cod: true, mtn_momo: true, orange_money: false, card: false } }, admin);
check(r.status === 200 && r.data.delivery.methods.mtn_momo, "admin switches MTN MoMo on");
r = await call("PUT", "/api/admin/settings/delivery", { fee: 10000, freeOver: null, methods: { cod: true, mtn_momo: true, orange_money: true, card: false } }, admin);
check(r.status === 400, "Orange Money can't be switched on until it's connected");

const delivery = { name: "Money Buyer", phone: buyer.phone, city: "Monrovia", address: "Sinkor 15th street" };

/** Places an order and walks it all the way to delivered. */
async function deliverCod(qty: number) {
  const placed = await call("POST", "/api/orders", { items: [{ productId, quantity: qty }], delivery, paymentMethod: "cod" }, buyer.token);
  const id = placed.data.orders[0].id as string;
  await call("POST", `/api/shop/orders/${id}/accept`, undefined, seller.token);
  await call("POST", `/api/admin/orders/${id}/assign`, { riderId: riderU.id }, admin);
  await call("POST", `/api/shop/orders/${id}/ready`, undefined, seller.token);
  await call("POST", `/api/rider/orders/${id}/picked-up`, undefined, rider);
  await call("POST", `/api/rider/orders/${id}/delivered`, { cashCollected: true }, rider);
  return id;
}

// ─── Earnings ──────────────────────────────────────────────────────────────
r = await call("GET", "/api/shop/wallet", undefined, seller.token);
check(r.data.wallet.balance === 0 && r.data.wallet.commission === 12, "new shop starts at zero and sees its commission rate");
const o1 = await deliverCod(2); // items LD 2,000 → 12% = LD 240 → seller LD 1,760
r = await call("GET", "/api/shop/wallet", undefined, seller.token);
check(r.data.wallet.balance === 176000, "delivered order credits the seller minus 12%", r.data.wallet);
check(r.data.wallet.entries[0].type === "sale" && r.data.wallet.entries[0].orderNumber, "wallet shows the sale with its order number");
check(r.data.wallet.salesThisMonth === 200000 && r.data.wallet.earnedThisMonth === 176000, "month totals: sales and earnings");
r = await call("GET", `/api/admin/orders/${o1}`, undefined, admin);
check(r.data.order.status === "delivered", "order delivered");

// ─── Rider cash ────────────────────────────────────────────────────────────
r = await call("GET", "/api/rider/cash", undefined, rider);
check(r.data.amount === 210000 && r.data.orders === 1, "rider sees the cash to hand in (items + delivery)");
const o2 = await deliverCod(1);
r = await call("GET", "/api/admin/rider-cash", undefined, admin);
const mine = r.data.items.find((x: any) => x.rider.id === riderU.id);
check(mine && mine.amount === 210000 + 110000 && mine.orders.length === 2, "admin sees cash per rider");
r = await call("GET", "/api/admin/money", undefined, admin);
check(r.data.overview.cashWithRiders >= 320000 && r.data.overview.commissionThisMonth >= 24000 + 12000, "money overview: cash with riders and commission");
r = await call("POST", `/api/admin/rider-cash/${riderU.id}/received`, { orderIds: [o1] }, admin);
check(r.data.received === 210000 && r.data.orders === 1, "admin records cash for the orders it saw");
r = await call("GET", "/api/rider/cash", undefined, rider);
check(r.data.amount === 110000, "rider's cash to hand in goes down");
void o2;

// ─── Payouts ───────────────────────────────────────────────────────────────
r = await call("POST", "/api/shop/wallet/payouts", { amount: 50000 }, seller.token);
check(r.status === 400 && r.data.fields?.payoutDetails, "payout needs mobile money details first");
r = await call("PUT", "/api/shop/wallet/payout-details", { method: "mtn_momo", name: "Wallet Seller", phone: seller.phone }, seller.token);
check(r.status === 200, "seller saves MTN details");
r = await call("POST", "/api/shop/wallet/payouts", { amount: 10000 }, seller.token);
check(r.status === 400 && r.data.error.includes("smallest"), "payout below the minimum is refused");
r = await call("POST", "/api/shop/wallet/payouts", { amount: 10_000_000 }, seller.token);
check(r.status === 400 && r.data.fields?.amount, "can't take out more than the balance");

const [a, b] = await Promise.all([
  call("POST", "/api/shop/wallet/payouts", { amount: 200000 }, seller.token),
  call("POST", "/api/shop/wallet/payouts", { amount: 200000 }, seller.token),
]);
check([a.status, b.status].sort().join() === "201,400", "two payouts at once can't spend the same money", [a.data, b.data]);
const payoutA = (a.status === 201 ? a : b).data.payout;
check(/^PO-\d+$/.test(payoutA.number) && payoutA.status === "requested", "payout requested with a number");
r = await call("GET", "/api/shop/wallet", undefined, seller.token);
const balanceAfter = r.data.wallet.balance;
check(balanceAfter === 176000 + 88000 - 200000 && r.data.wallet.pendingPayouts === 200000, "requested amount leaves the balance");

r = await call("GET", "/api/admin/payouts", undefined, admin);
check(r.data.items.some((p: any) => p.id === payoutA.id), "admin sees the payout queue");
r = await call("POST", `/api/admin/payouts/${payoutA.id}/paid`, { reference: "x" }, admin);
check(r.status === 400, "marking paid needs the transaction ID");
r = await call("POST", `/api/admin/payouts/${payoutA.id}/paid`, { reference: "MP240927.1234.A56789" }, admin);
check(r.data.payout.status === "paid" && r.data.payout.reference, "admin marks it paid with the MoMo transaction ID");
r = await call("POST", `/api/admin/payouts/${payoutA.id}/reject`, { reason: "late" }, admin);
check(r.status === 409, "a paid payout can't be refused");

r = await call("POST", "/api/shop/wallet/payouts", { amount: 50000 }, seller.token);
const payoutB = r.data.payout;
r = await call("POST", `/api/admin/payouts/${payoutB.id}/reject`, { reason: "Wrong MTN number — please check" }, admin);
check(r.data.payout.status === "rejected", "admin refuses a payout with a reason");
r = await call("GET", "/api/shop/wallet", undefined, seller.token);
check(r.data.wallet.balance === balanceAfter && r.data.wallet.entries.some((e: any) => e.type === "payout_returned"), "refused money comes back to the balance");

r = await call("POST", `/api/admin/shops/${shopId}/adjust`, { amount: -1000, note: "x" }, admin);
check(r.status === 400, "adjustments need a reason");
r = await call("POST", `/api/admin/shops/${shopId}/adjust`, { amount: -1000, note: "Refund for a broken radio" }, admin);
check(r.data.balance === balanceAfter - 1000, "admin corrects a balance with a note");
r = await call("GET", "/api/admin/owed/shops?period=all", undefined, admin);
check(r.data.items.find((x: any) => x.shop.id === shopId)?.balance === balanceAfter - 1000, "seller balances list");
r = await call("GET", "/api/shop/wallet", undefined, buyer.token);
check(r.status === 404, "buyers have no wallet");

// ─── MTN Mobile Money ──────────────────────────────────────────────────────
const stockBefore = (await call("GET", `/api/public/products/${productId}`)).data.product.stock;
r = await call("POST", "/api/orders", { items: [{ productId, quantity: 1 }], delivery, paymentMethod: "mtn_momo", paymentPhone: "0770000003" }, buyer.token);
check(r.status === 201 && r.data.payment?.status === "pending" && r.data.orders[0].status === "awaiting_payment", "MoMo checkout sends a payment prompt; order waits for payment");
const paidOrder = r.data.orders[0].id;
r = await call("GET", "/api/shop/orders", undefined, seller.token);
check(!r.data.items.some((o: any) => o.id === paidOrder), "the shop doesn't see unpaid orders");
const pay = (await call("POST", "/api/orders", { items: [{ productId, quantity: 1 }], delivery, paymentMethod: "mtn_momo", paymentPhone: "0770000002" }, buyer.token)).data;
const declinedOrder = pay.orders[0].id;
const declinedPayment = pay.payment.id;

// First (approving) payment
const firstPayment = (await call("GET", `/api/orders/${paidOrder}`, undefined, buyer.token)).data.order;
check(firstPayment.paymentMethod === "mtn_momo", "order remembers it's paid by MoMo");
const list = await call("GET", "/api/orders", undefined, buyer.token);
check(list.data.items.some((o: any) => o.status === "awaiting_payment"), "buyer sees 'waiting for payment'");

r = await call("POST", "/api/orders", { items: [{ productId, quantity: 1 }], delivery, paymentMethod: "mtn_momo", paymentPhone: "0770000011" }, buyer.token);
const okPayment = r.data.payment.id;
const okOrder = r.data.orders[0].id;
await sleep(3200);
r = await call("GET", `/api/orders/payments/${okPayment}`, undefined, buyer.token);
check(r.data.payment.status === "successful", "approved on the phone → payment successful", r.data);
r = await call("GET", `/api/orders/${okOrder}`, undefined, buyer.token);
check(r.data.order.status === "placed" && r.data.order.paymentStatus === "paid", "paid order goes to the shop");
r = await call("GET", "/api/shop/orders", undefined, seller.token);
check(r.data.items.some((o: any) => o.id === okOrder), "shop now sees the paid order");

await sleep(3200);
r = await call("GET", `/api/orders/payments/${declinedPayment}`, undefined, buyer.token);
check(r.data.payment.status === "failed" && r.data.payment.failureReason, "declined on the phone → payment failed");
r = await call("GET", `/api/orders/${declinedOrder}`, undefined, buyer.token);
check(r.data.order.status === "cancelled", "declined payment cancels the order");
r = await call("GET", `/api/orders/payments/${declinedPayment}`, undefined, seller.token);
check(r.status === 404, "only the buyer can see their payment");

r = await call("POST", "/api/orders", { items: [{ productId, quantity: 1 }], delivery, paymentMethod: "mtn_momo", paymentPhone: "0770000009" }, buyer.token);
check(r.status === 502, "if MTN is down, checkout says so clearly");
const stockAfter = (await call("GET", `/api/public/products/${productId}`)).data.product.stock;
// paidOrder (still waiting) and okOrder hold stock; declined and MTN-down orders gave it back.
check(stockAfter === stockBefore - 2, "failed payments put the stock back", { stockBefore, stockAfter });

// Clean up settings
await call("PUT", "/api/admin/settings/finance", originalFinance, admin);
await call("PUT", "/api/admin/settings/delivery", originalDelivery, admin);

r = await call("GET", "/api/admin/audit-log", undefined, admin);
const actions = new Set(r.data.items.map((e: any) => e.action));
check(["payout.paid", "payout.reject", "wallet.adjust", "cash.received", "settings.finance"].every((x) => actions.has(x)), "money actions are in the audit log");

console.log(`\n${passed} checks passed`);
