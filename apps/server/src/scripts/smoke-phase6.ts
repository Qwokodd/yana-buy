/**
 * End-to-end check of the phase 6 API (reviews, chat, disputes, China
 * sourcing) against a running server:  npx tsx src/scripts/smoke-phase6.ts
 * The China MoMo payment checks run only when the API uses the pretend MTN
 * (see smoke-phase5.ts); otherwise they are skipped.
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
const seller = await person("88", "Trust Seller");
const up = await call("POST", "/api/uploads/private", photos(2), seller.token);
const app = await call(
  "POST",
  "/api/shop/apply",
  { kind: "store", name: `Trust Shop ${n}`, phone: seller.phone, city: "Monrovia", address: "Broad Street", idType: "passport", idFrontKey: up.data.files[0].key, selfieKey: up.data.files[1].key },
  seller.token
);
const shopId = app.data.shop.id as string;
await call("POST", `/api/admin/shops/${shopId}/approve`, undefined, admin);
const cat = (await call("GET", "/api/public/categories?kind=goods")).data.items[0];
const img = (await call("POST", "/api/uploads", photos(1), seller.token)).data.urls;
const prod = await call("POST", "/api/shop/products", { name: "Radio", price: 100000, stock: 20, images: img, categoryId: cat.id }, seller.token);
const productId = prod.data.product.id as string;
await call("POST", `/api/admin/products/${productId}/approve`, undefined, admin);
const riderU = await person("66", "Trust Rider");
await call("PATCH", `/api/admin/users/${riderU.id}/role`, { role: "rider" }, admin);
const rider = (await call("POST", "/api/auth/login", { phone: riderU.phone, password: "password123" })).data.accessToken as string;
const seller2 = await person("77", "Other Seller");
const buyer = await person("55", "Grace Wleh");
const stranger = await person("44", "Nosy Person");
const delivery = { name: "Grace Wleh", phone: buyer.phone, city: "Monrovia", address: "Sinkor 15th street" };

async function deliveredOrder(qty = 1) {
  const o = await call("POST", "/api/orders", { items: [{ productId, quantity: qty }], delivery, paymentMethod: "cod" }, buyer.token);
  const id = o.data.orders[0].id as string;
  await call("POST", `/api/shop/orders/${id}/accept`, undefined, seller.token);
  await call("POST", `/api/admin/orders/${id}/assign`, { riderId: riderU.id }, admin);
  await call("POST", `/api/shop/orders/${id}/ready`, undefined, seller.token);
  await call("POST", `/api/rider/orders/${id}/picked-up`, undefined, rider);
  const d = await call("POST", `/api/rider/orders/${id}/delivered`, { cashCollected: true }, rider);
  return d.data.order;
}

// ─── Products: China flag ──────────────────────────────────────────────────
r = await call("POST", "/api/shop/products", { name: "Phone case from Shenzhen", price: 50000, images: img, categoryId: cat.id, shipsFromChina: true, deliveryDays: 21 }, seller.token);
check(r.status === 201 && r.data.product.shipsFromChina && r.data.product.deliveryDays === 21, "seller marks a product 'ships from China' with 21 days");
const chinaId = r.data.product.id as string;
await call("POST", `/api/admin/products/${chinaId}/approve`, undefined, admin);
r = await call("POST", "/api/shop/products", { name: "Bad days", price: 50000, images: img, categoryId: cat.id, deliveryDays: 0 }, seller.token);
check(r.status === 400 && r.data.fields?.deliveryDays, "delivery days must be at least 1");
r = await call("GET", `/api/public/products?china=true&shop=${app.data.shop.slug}`);
check(r.data.items.length === 1 && r.data.items[0].id === chinaId, "the 'From China' filter shows only China items");

// ─── Reviews ────────────────────────────────────────────────────────────────
const placed = await call("POST", "/api/orders", { items: [{ productId, quantity: 1 }], delivery, paymentMethod: "cod" }, buyer.token);
r = await call("POST", "/api/reviews", { orderId: placed.data.orders[0].id, productId, rating: 5 }, buyer.token);
check(r.status === 409, "can't review before the order is delivered");
const order1 = await deliveredOrder();
check(order1.status === "delivered" && order1.reviewedProductIds.length === 0, "order delivered, nothing reviewed yet");
r = await call("POST", "/api/reviews", { orderId: order1.id, productId, rating: 6 }, buyer.token);
check(r.status === 400 && r.data.fields?.rating, "stars must be 1 to 5");
r = await call("POST", "/api/reviews", { orderId: order1.id, productId, rating: 4, comment: "Good radio" }, stranger.token);
check(r.status === 404, "only the buyer can review their order");
r = await call("POST", "/api/reviews", { orderId: order1.id, productId: chinaId, rating: 4 }, buyer.token);
check(r.status === 404, "can't review an item that wasn't in the order");
r = await call("POST", "/api/reviews", { orderId: order1.id, productId, rating: 2, comment: "Crackly sound" }, buyer.token);
check(r.status === 201 && r.data.review.buyerName === "Grace W.", "buyer reviews it (shown as 'Grace W.')");
r = await call("POST", "/api/reviews", { orderId: order1.id, productId, rating: 4, comment: "Seller fixed it, works well" }, buyer.token);
check(r.status === 201 && r.data.review.rating === 4, "buyer can change their review");
const order2 = await deliveredOrder();
await call("POST", "/api/reviews", { orderId: order2.id, productId, rating: 5, comment: "Great" }, buyer.token);
r = await call("GET", `/api/public/products/${productId}/reviews`);
check(r.data.summary.count === 2 && r.data.summary.average === 4.5 && r.data.summary.stars[3] === 1 && r.data.summary.stars[4] === 1, "product shows 4.5 stars from 2 reviews, with the breakdown");
r = await call("GET", `/api/public/products/${productId}`);
check(r.data.product.rating === 4.5 && r.data.product.ratingCount === 2, "product page and cards carry the rating");
r = await call("GET", `/api/public/shops/${app.data.shop.slug}`);
check(r.data.shop.rating === 4.5 && r.data.shop.ratingCount === 2, "shop page carries the rating");
r = await call("GET", `/api/orders/${order1.id}`, undefined, buyer.token);
check(r.data.order.reviewedProductIds.includes(productId), "the order knows which items the buyer reviewed");
r = await call("GET", "/api/shop/reviews", undefined, seller.token);
check(r.data.items.length === 2 && r.data.summary.average === 4.5, "seller sees their reviews");
const reviewId = r.data.items.find((x: any) => x.rating === 5).id as string;
r = await call("POST", `/api/shop/reviews/${reviewId}/reply`, { reply: "Thank you Grace!" }, seller.token);
check(r.status === 200 && r.data.review.sellerReply === "Thank you Grace!", "seller replies to a review");
r = await call("POST", `/api/shop/reviews/${reviewId}/reply`, { reply: "Mine now" }, seller2.token);
check(r.status === 404, "another seller can't reply to it");
r = await call("POST", `/api/admin/reviews/${reviewId}/hide`, { reason: "Test hide" }, admin);
check(r.status === 200 && r.data.review.hidden, "admin hides a review");
r = await call("GET", `/api/public/products/${productId}/reviews`);
check(r.data.summary.count === 1 && r.data.summary.average === 4 && r.data.items.length === 1, "hidden reviews don't show or count");
r = await call("POST", `/api/admin/reviews/${reviewId}/unhide`, undefined, admin);
r = await call("GET", `/api/public/products/${productId}`);
check(r.data.product.rating === 4.5, "unhiding puts it back in the average");
r = await call("GET", "/api/admin/reviews?q=Great", undefined, admin);
check(r.data.items.some((x: any) => x.id === reviewId && x.orderNumber.startsWith("YB-")), "admin searches reviews");
r = await call("GET", `/api/public/products?sort=top_rated&shop=${app.data.shop.slug}`);
check(r.data.items[0].id === productId, "'Top rated' sort puts the rated product first");

// ─── Chat ───────────────────────────────────────────────────────────────────
r = await call("POST", "/api/chats", { shopId, body: "Is the radio still available?", productId }, buyer.token);
check(r.status === 201 && r.data.conversation.side === "buyer", "buyer starts a chat about a product");
const chatId = r.data.conversation.id as string;
r = await call("POST", "/api/chats", { shopId, body: "Hello again" }, buyer.token);
check(r.data.conversation.id === chatId, "one thread per buyer and shop");
r = await call("POST", "/api/chats", { shopId, body: "Talking to myself" }, seller.token);
check(r.status === 400, "sellers can't chat with their own shop");
r = await call("GET", "/api/chats/unread", undefined, seller.token);
check(r.data.count === 2, "seller has 2 unread messages");
r = await call("GET", "/api/chats", undefined, seller.token);
check(r.data.items[0].id === chatId && r.data.items[0].side === "shop" && r.data.items[0].unread === 2, "seller's chat list shows the thread from the shop side");
r = await call("GET", `/api/chats/${chatId}`, undefined, seller.token);
check(r.data.messages.length === 2 && r.data.messages[0].product?.id === productId && !r.data.messages[0].mine, "seller reads the messages, with the product attached");
const lastSeen = r.data.messages[1].createdAt as string;
r = await call("GET", "/api/chats/unread", undefined, seller.token);
check(r.data.count === 0, "reading clears the unread count");
r = await call("POST", `/api/chats/${chatId}/messages`, { body: "Yes! Come by today", orderId: order1.id }, seller.token);
check(r.status === 201 && r.data.message.mine && r.data.message.order?.id === order1.id, "seller replies, pointing at an order");
r = await call("POST", `/api/chats/${chatId}/messages`, { body: "   " }, seller.token);
check(r.status === 400, "empty messages are refused");
r = await call("GET", `/api/chats/${chatId}?after=${encodeURIComponent(lastSeen)}`, undefined, buyer.token);
check(r.data.messages.length === 1 && r.data.messages[0].senderName === `Trust Shop ${n}`, "buyer fetches only the new message");
r = await call("GET", `/api/chats/${chatId}`, undefined, stranger.token);
check(r.status === 404, "nobody else can read the chat");
r = await call("POST", `/api/chats/${chatId}/messages`, { body: "hi" }, seller2.token);
check(r.status === 404, "nobody else can write into it");
r = await call("GET", "/api/admin/chats?q=Grace", undefined, admin);
check(r.data.items.some((c: any) => c.id === chatId && c.messageCount === 3), "admin finds the chat");
r = await call("POST", `/api/admin/chats/${chatId}/messages`, { body: "YanaBuy here — please keep payments inside the app." }, admin);
check(r.status === 201 && r.data.message.sender === "admin", "admin writes into the chat as YanaBuy");
r = await call("GET", `/api/chats/${chatId}`, undefined, buyer.token);
check(r.data.messages.at(-1).senderName === "YanaBuy", "buyer sees YanaBuy's message");

// ─── Disputes ───────────────────────────────────────────────────────────────
r = await call("POST", `/api/orders/${placed.data.orders[0].id}/dispute`, { reason: "damaged", description: "It arrived broken in pieces", photos: [] }, buyer.token);
check(r.status === 409, "can't report a problem before delivery");
const order3 = await deliveredOrder(2);
r = await call("POST", `/api/orders/${order3.id}/dispute`, { reason: "damaged", description: "short" }, buyer.token);
check(r.status === 400 && r.data.fields?.description, "the buyer has to describe the problem");
r = await call("POST", `/api/orders/${order3.id}/dispute`, { reason: "damaged", description: "One of the two radios arrived with a cracked case", photos: img }, stranger.token);
check(r.status === 404, "only the buyer can report a problem");
r = await call("POST", `/api/orders/${order3.id}/dispute`, { reason: "damaged", description: "One of the two radios arrived with a cracked case", photos: img }, buyer.token);
check(r.status === 201 && r.data.order.dispute?.status === "open" && r.data.order.disputeStatus === "open", "buyer reports a damaged item with a photo");
r = await call("POST", `/api/orders/${order3.id}/dispute`, { reason: "other", description: "Another report about the same order" }, buyer.token);
check(r.status === 409, "one report per order");
r = await call("GET", "/api/admin/stats", undefined, admin);
check(r.data.disputesOpen >= 1, "admin overview counts open disputes");
r = await call("POST", `/api/shop/orders/${order3.id}/dispute-response`, { response: "It was fine when packed. Happy to swap it." }, seller.token);
check(r.status === 200 && r.data.order.dispute.sellerResponse.startsWith("It was fine"), "seller gives their side");
r = await call("GET", "/api/admin/disputes", undefined, admin);
const disp = r.data.items.find((d: any) => d.order.id === order3.id);
check(disp && disp.number.startsWith("DP-") && disp.buyer.fullName === "Grace Wleh", "admin sees the dispute in the queue");
const before = (await call("GET", "/api/shop/wallet", undefined, seller.token)).data.wallet.balance as number;
r = await call("POST", `/api/admin/disputes/${disp.id}/resolve`, { outcome: "refund_partial", refundAmount: 100000, sellerCharge: 100000, note: "One radio damaged" }, admin);
check(r.status === 400 && r.data.fields?.refundReference, "a refund needs the transaction ID of the money sent back");
r = await call("POST", `/api/admin/disputes/${disp.id}/resolve`, { outcome: "refund_partial", refundAmount: 100000, sellerCharge: 150000, refundReference: "MP1", note: "One radio damaged" }, admin);
check(r.status === 400 && r.data.fields?.sellerCharge, "can't charge the seller more than the refund");
r = await call("POST", `/api/admin/disputes/${disp.id}/resolve`, { outcome: "refund_full", refundAmount: 100000, sellerCharge: 0, refundReference: "MP1", note: "x full" }, admin);
check(r.status === 400, "a full refund must be the whole order total");
r = await call("POST", `/api/admin/disputes/${disp.id}/resolve`, { outcome: "refund_partial", refundAmount: 100000, sellerCharge: 90000, refundReference: "MP260927.1", note: "One radio was damaged — refunded one" }, admin);
check(r.status === 200 && r.data.dispute.status === "resolved" && r.data.dispute.outcome === "refund_partial", "admin refunds one radio");
r = await call("POST", `/api/admin/disputes/${disp.id}/resolve`, { outcome: "no_refund", refundAmount: 0, sellerCharge: 0, note: "again" }, admin);
check(r.status === 409, "a dispute can only be decided once");
const after = (await call("GET", "/api/shop/wallet", undefined, seller.token)).data.wallet;
check(before - after.balance === 90000 && after.entries.some((e: any) => e.type === "refund" && e.amount === -90000), "LD 900 is taken from the seller's balance");
r = await call("GET", `/api/orders/${order3.id}`, undefined, buyer.token);
check(r.data.order.dispute.refundAmount === 100000 && r.data.order.dispute.sellerCharge === null && r.data.order.events.some((e: any) => e.status === "dispute_resolved"), "buyer sees the refund (not the seller charge) on the order");
r = await call("GET", `/api/shop/orders/${order3.id}`, undefined, seller.token);
check(r.data.order.dispute.sellerCharge === 90000, "seller sees what was charged");
r = await call("POST", `/api/shop/orders/${order3.id}/dispute-response`, { response: "Changing my story now" }, seller.token);
check(r.status === 409, "seller can't change their side after the decision");

// ─── China sourcing ─────────────────────────────────────────────────────────
r = await call("POST", "/api/sourcing", { description: "Solar lamp, 20W", quantity: 5 }, buyer.token);
check(r.status === 400, "a China request needs a link or a photo");
r = await call("POST", "/api/sourcing", { link: "not a link", description: "Solar lamp, 20W, warm white", quantity: 5 }, buyer.token);
check(r.status === 400 && r.data.fields?.link, "the link has to be a real web link");
r = await call("POST", "/api/sourcing", { link: "https://detail.1688.com/offer/123.html", description: "Solar lamp, 20W, warm white", quantity: 5, budget: "about LD 3,000 each", images: img }, buyer.token);
check(r.status === 201 && r.data.request.number.startsWith("CS-") && r.data.request.status === "pending", "buyer asks YanaBuy to source 5 solar lamps");
const csId = r.data.request.id as string;
r = await call("GET", "/api/admin/stats", undefined, admin);
check(r.data.sourcingWaiting >= 1, "admin overview counts China requests waiting");
r = await call("GET", `/api/sourcing/${csId}`, undefined, stranger.token);
check(r.status === 404, "other people can't see the request");
r = await call("POST", `/api/sourcing/${csId}/accept`, { delivery, paymentMethod: "cod" }, buyer.token);
check(r.status === 409, "nothing to accept before a quote");
r = await call("POST", `/api/admin/sourcing/${csId}/status`, { status: "shipped" }, admin);
check(r.status === 409, "admin can't skip steps");
r = await call("POST", `/api/admin/sourcing/${csId}/quote`, { price: 1750000, days: 30, note: "Includes shipping to Monrovia" }, admin);
check(r.status === 200 && r.data.request.status === "quoted" && r.data.request.quotePrice === 1750000, "admin quotes LD 17,500, about 30 days");
r = await call("POST", `/api/admin/sourcing/${csId}/quote`, { price: 1700000, days: 28 }, admin);
check(r.data.request.quotePrice === 1700000, "admin can change the quote before it's accepted");
r = await call("POST", `/api/sourcing/${csId}/accept`, { delivery, paymentMethod: "cod" }, buyer.token);
check(r.status === 200 && r.data.request.status === "accepted" && r.data.request.delivery.city === "Monrovia" && r.data.payment === null, "buyer accepts and will pay on delivery");
r = await call("POST", `/api/sourcing/${csId}/cancel`, undefined, buyer.token);
check(r.status === 409, "can't cancel after accepting");
r = await call("POST", `/api/admin/sourcing/${csId}/quote`, { price: 1, days: 1 }, admin);
check(r.status === 400 || r.status === 409, "the quote can't change after it's accepted");
for (const s of ["ordered", "shipped", "arrived"]) {
  r = await call("POST", `/api/admin/sourcing/${csId}/status`, { status: s, note: s === "shipped" ? "Sea freight, container MSKU123" : null }, admin);
}
check(r.data.request.status === "arrived" && r.data.request.paymentStatus === "pending", "admin moves it ordered → shipped → arrived");
r = await call("POST", `/api/admin/sourcing/${csId}/status`, { status: "delivered" }, admin);
check(r.data.request.status === "delivered" && r.data.request.paymentStatus === "paid", "delivered with cash → marked paid");
r = await call("GET", `/api/sourcing/${csId}`, undefined, buyer.token);
check(r.data.request.events.some((e: any) => e.note === "Sea freight, container MSKU123") && r.data.request.events.length >= 7, "buyer sees every step with notes");
r = await call("POST", "/api/sourcing", { link: "https://item.taobao.com/x", description: "Hair clippers, cordless", quantity: 1 }, buyer.token);
const cs2 = r.data.request.id as string;
r = await call("POST", `/api/admin/sourcing/${cs2}/reject`, { reason: "The seller doesn't ship batteries abroad" }, admin);
check(r.data.request.status === "rejected" && r.data.request.rejectReason?.includes("batteries"), "admin turns a request down with a reason");
r = await call("POST", "/api/sourcing", { link: "https://item.taobao.com/y", description: "Phone tripod stand", quantity: 2 }, buyer.token);
const cs3 = r.data.request.id as string;
r = await call("POST", `/api/sourcing/${cs3}/cancel`, undefined, buyer.token);
check(r.data.request.status === "cancelled", "buyer cancels a request before it's accepted");

const ready = (await call("GET", "/api/admin/settings/delivery", undefined, admin)).data;
if (ready.ready.includes("mtn_momo")) {
  const original = ready.delivery;
  await call("PUT", "/api/admin/settings/delivery", { ...original, methods: { ...original.methods, mtn_momo: true } }, admin);
  r = await call("POST", "/api/sourcing", { link: "https://item.taobao.com/z", description: "Bluetooth speaker, waterproof", quantity: 1 }, buyer.token);
  const cs4 = r.data.request.id as string;
  await call("POST", `/api/admin/sourcing/${cs4}/quote`, { price: 450000, days: 25 }, admin);
  r = await call("POST", `/api/sourcing/${cs4}/accept`, { delivery, paymentMethod: "mtn_momo", paymentPhone: "0880000002" }, buyer.token);
  check(r.status === 200 && r.data.payment?.sourcingId === cs4, "MoMo: the buyer gets a payment prompt for the quote");
  let pay = r.data.payment;
  for (let i = 0; i < 10 && pay.status === "pending"; i++) {
    await sleep(3200);
    pay = (await call("GET", `/api/orders/payments/${pay.id}`, undefined, buyer.token)).data.payment;
  }
  r = await call("GET", `/api/sourcing/${cs4}`, undefined, buyer.token);
  check(pay.status === "failed" && r.data.request.status === "quoted", "MoMo declined → the quote stays open to try again");
  r = await call("POST", `/api/sourcing/${cs4}/accept`, { delivery, paymentMethod: "mtn_momo", paymentPhone: "0880000001" }, buyer.token);
  pay = r.data.payment;
  for (let i = 0; i < 10 && pay.status === "pending"; i++) {
    await sleep(3200);
    pay = (await call("GET", `/api/orders/payments/${pay.id}`, undefined, buyer.token)).data.payment;
  }
  r = await call("GET", `/api/sourcing/${cs4}`, undefined, buyer.token);
  check(pay.status === "successful" && r.data.request.status === "accepted" && r.data.request.paymentStatus === "paid", "MoMo approved → accepted and paid");
  await call("PUT", "/api/admin/settings/delivery", original, admin);
} else {
  console.log("ℹ️  MTN not connected — skipping the China MoMo payment checks");
}

r = await call("GET", "/api/admin/audit-log", undefined, admin);
const actions = r.data.items.map((e: any) => e.action);
check(["dispute.resolve", "sourcing.status", "sourcing.reject", "chat.note"].every((a) => actions.includes(a)), "admin actions are in the audit log");

console.log(`\n${passed} checks passed`);
