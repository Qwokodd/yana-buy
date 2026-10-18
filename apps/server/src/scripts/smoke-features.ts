/**
 * End-to-end check of the new features: shop directory, delivery areas, discount codes,
 * wishlist & notifications, and bookings (restaurant tables and services)
 * against a running server.   npx tsx src/scripts/smoke-features.ts
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


// ─── Shop directory ───────────────────────────────────────────────────────
const goodsCats = (await call("GET", "/api/public/categories?kind=goods")).data.items;
const foodCats = (await call("GET", "/api/public/categories?kind=food")).data.items;
const fashion = goodsCats.find((c: any) => c.slug === "fashion") ?? goodsCats[0];
const store = await sellerWithProducts("81", "store", `Dir Shop ${n}`, [{ name: "Lappa dress", price: 1500, stock: 5 }]);
const kitchen = await sellerWithProducts("82", "restaurant", `Dir Kitchen ${n}`, [{ name: "Fufu & soup", price: 450, stock: null }]);

r = await call("PATCH", "/api/shop/mine", { categoryId: foodCats[0].id }, store.token);
check(r.status === 400 && r.data.fields?.categoryId, "a shop can't pick a Food category");
r = await call("PATCH", "/api/shop/mine", { categoryId: fashion.id, hours: "Mon–Sat 9am–7pm", address: "Randall Street, near Ducor" }, store.token);
check(r.status === 200 && r.data.shop.categoryId === fashion.id && r.data.shop.hours === "Mon–Sat 9am–7pm", "a shop picks its category and opening hours");
r = await call("PATCH", "/api/shop/mine", { categoryId: foodCats[0].id }, kitchen.token);
check(r.status === 200, "a restaurant picks a Food category");

r = await call("GET", "/api/public/shop-categories?mode=goods");
check(r.data.items.some((c: any) => c.id === fashion.id && c.shopCount >= 1), "the directory lists categories with shop counts");
r = await call("GET", `/api/public/shops?mode=goods&category=${fashion.slug}&limit=48`);
const listed = r.data.items.find((s: any) => s.name === `Dir Shop ${n}`);
check(listed && listed.category?.slug === fashion.slug && listed.address.includes("Randall") && listed.hours, "shops are listed by category with address and hours");
check(typeof r.data.total === "number" && r.data.pageSize === 48, "the directory pages through results");
r = await call("GET", `/api/public/shops?mode=food&category=${foodCats[0].slug}&q=${encodeURIComponent(`Dir Kitchen ${n}`)}`);
check(r.data.items.length === 1 && r.data.items[0].kind === "restaurant", "restaurants have their own directory");
r = await call("GET", `/api/public/shops?mode=goods&q=${encodeURIComponent("Randall Street")}`);
check(r.data.items.some((s: any) => s.name === `Dir Shop ${n}`), "search finds shops by their address");
r = await call("GET", `/api/public/shops/${listed.slug}`);
check(r.data.shop.category?.name === fashion.name && r.data.shop.address.includes("Randall"), "the shop page shows its category and address");

// ─── Delivery areas ───────────────────────────────────────────────────────
r = await call("GET", "/api/admin/settings/delivery", undefined, admin);
const originalDelivery = r.data.delivery;
r = await call("PUT", "/api/admin/settings/delivery", { ...originalDelivery, fee: 100, freeOver: 5000, areas: [{ name: "Sinkor – City Hall", fee: 90 }, { name: "sinkor – city hall", fee: 100 }] }, admin);
check(r.status === 400, "an area can't be listed twice");
r = await call(
  "PUT",
  "/api/admin/settings/delivery",
  { ...originalDelivery, fee: 100, freeOver: 5000, areas: [{ name: "Sinkor – City Hall", fee: 90 }, { name: "Upper Caldwell", fee: 490 }, { name: "Closed area", fee: 50, active: false }] },
  admin
);
check(r.status === 200 && r.data.delivery.areas.length === 3 && r.data.delivery.areas.every((a: any) => a.id), "admin sets up delivery areas with their own fees");
const [sinkor, caldwell, closedArea] = r.data.delivery.areas;
const buyer = await person("53", "Area Buyer");
const dress = { productId: store.products[0], quantity: 1 }; // $15
const fufu = { productId: kitchen.products[0], quantity: 2 }; // $9
r = await call("POST", "/api/cart/quote", { items: [dress, fufu] }, buyer.token);
check(r.data.quote.areas.length === 2 && !r.data.quote.areas.some((a: any) => a.id === closedArea.id), "buyers only see the areas that are switched on");
r = await call("POST", "/api/cart/quote", { items: [dress, fufu], areaId: caldwell.id }, buyer.token);
check(r.data.quote.deliveryFees === 490 * 2 && r.data.quote.areaId === caldwell.id, "each shop's order uses the area's fee");
const delivery = { name: "Area Buyer", phone: `053${n}`, city: "Monrovia", address: "Caldwell, near the market" };
r = await call("POST", "/api/orders", { items: [dress], delivery, paymentMethod: "cod" }, buyer.token);
check(r.status === 400 && r.data.fields?.["delivery.areaId"], "checkout asks for the delivery area");

// ─── Discount codes ───────────────────────────────────────────────────────
const code = `WLC${n}`;
r = await call("POST", "/api/admin/discounts", { code: `wlc ${n}`.replace(" ", ""), type: "percent", value: 10, minSubtotal: 2000, perBuyerLimit: 1, usageLimit: 5 }, admin);
check(r.status === 201 && r.data.discount.code === code, "admin creates a discount code (saved in capitals)");
const codeId = r.data.discount.id;
r = await call("POST", "/api/admin/discounts", { code, type: "fixed", value: 100 }, admin);
check(r.status === 409, "codes are unique");
r = await call("POST", "/api/admin/discounts", { code: `BAD${n}`, type: "percent", value: 150 }, admin);
check(r.status === 400, "a percent can't be over 100");
r = await call("POST", "/api/cart/quote", { items: [dress], areaId: sinkor.id, code }, buyer.token);
check(r.data.quote.discount === 0 && r.data.quote.discountProblem?.includes("$20"), "the minimum spend is checked");
r = await call("POST", "/api/cart/quote", { items: [dress, fufu], areaId: sinkor.id, code: code.toLowerCase() }, buyer.token);
const q = r.data.quote;
check(q.discount === 240 && q.discountCode === code && q.total === 2400 + 180 - 240, "10% comes off the items (codes ignore capitals)", q);
check(q.shops.reduce((n: number, s: any) => n + s.discount, 0) === 240, "the discount is shared across the shops' orders");
r = await call("POST", "/api/cart/quote", { items: [dress], code: "NOPE123" }, buyer.token);
check(r.data.quote.discountProblem && r.data.quote.ok, "a wrong code is explained but doesn't block the cart");
r = await call("POST", "/api/orders", { items: [dress, fufu], delivery: { ...delivery, areaId: sinkor.id }, code: "NOPE123", paymentMethod: "cod" }, buyer.token);
check(r.status === 409 && r.data.fields?.code, "checkout refuses a wrong code");
r = await call("POST", "/api/orders", { items: [dress, fufu], delivery: { ...delivery, areaId: sinkor.id }, code, paymentMethod: "cod" }, buyer.token);
check(r.status === 201 && r.data.orders.length === 2, "checkout with an area and a code");
const placed = r.data.orders;
const sum = (k: string) => placed.reduce((n: number, o: any) => n + o[k], 0);
check(sum("discount") === 240 && sum("total") === 2400 + 180 - 240 && placed.every((o: any) => o.delivery.area === "Sinkor – City Hall"), "orders keep the area and their share of the discount");
r = await call("POST", "/api/cart/quote", { items: [dress, fufu], code }, buyer.token);
check(r.data.quote.discountProblem === "You've already used this code", "one use per buyer");
r = await call("GET", "/api/admin/discounts", undefined, admin);
const used = r.data.items.find((d: any) => d.id === codeId);
check(used.timesUsed === 1 && used.totalDiscount === 240, "admin sees how often a code was used and how much it gave");
r = await call("DELETE", `/api/admin/discounts/${codeId}`, undefined, admin);
check(r.status === 409, "a used code can't be deleted, only switched off");
r = await call("PATCH", `/api/admin/discounts/${codeId}`, { active: false }, admin);
check(r.status === 200 && !r.data.discount.active, "admin switches a code off");

// The seller still earns on the full price — YanaBuy pays the discount.
const shopOrder = placed.find((o: any) => o.shop.id === store.shopId);
await call("POST", `/api/shop/orders/${shopOrder.id}/accept`, undefined, store.token);
await call("POST", `/api/shop/orders/${shopOrder.id}/ready`, undefined, store.token);
const riderUser = await person("52", "Disc Rider");
await call("PATCH", `/api/admin/users/${riderUser.id}/role`, { role: "rider" }, admin);
const rider = (await call("POST", "/api/auth/login", { phone: `052${n}`, password: "password123" })).data.accessToken;
await call("POST", `/api/admin/orders/${shopOrder.id}/assign`, { riderId: riderUser.id }, admin);
await call("POST", `/api/rider/orders/${shopOrder.id}/picked-up`, undefined, rider);
r = await call("POST", `/api/rider/orders/${shopOrder.id}/delivered`, { cashCollected: true }, rider);
r = await call("GET", "/api/shop/wallet", undefined, store.token);
const w = r.data.wallet;
check(w.salesThisMonth === 1500 && w.earnedThisMonth === 1500 - Math.round((1500 * w.commission) / 100), "the seller's earnings ignore the discount (YanaBuy pays it)", w);

await call("PUT", "/api/admin/settings/delivery", { ...originalDelivery, areas: [] }, admin);

// ─── Wishlist & notifications ─────────────────────────────────────────────
const fan = await person("51", "Wish Buyer");
const dressId = store.products[0];
r = await call("POST", `/api/me/wishlist/${dressId}`, undefined, fan.token);
check(r.status === 201, "a buyer saves a product");
await call("POST", `/api/me/wishlist/${dressId}`, undefined, fan.token);
r = await call("GET", "/api/me/wishlist", undefined, fan.token);
check(r.data.items.length === 1 && r.data.items[0].product.id === dressId && r.data.items[0].priceAtSave === 1500, "saving twice keeps one entry, with the price when saved");
r = await call("GET", "/api/me/wishlist/ids", undefined, fan.token);
check(r.data.ids.includes(dressId), "the app gets the saved ids for the hearts");
r = await call("PATCH", `/api/shop/products/${dressId}`, { price: 1200 }, store.token);
check(r.status === 200, "the seller lowers the price");
const wait = () => new Promise((ok) => setTimeout(ok, 600));
await wait();
r = await call("GET", "/api/me/notifications", undefined, fan.token);
check(r.data.items.some((x: any) => x.type === "price_drop" && x.body.includes("$12") && x.link === `/p/${dressId}`) && r.data.unread >= 1, "people who saved it are told about the price drop");

r = await call("POST", "/api/orders", { items: [{ productId: dressId, quantity: 1 }], delivery: { name: "Wish Buyer", phone: `051${n}`, city: "Monrovia", address: "Sinkor" }, paymentMethod: "cod" }, fan.token);
check(r.status === 201, "the buyer orders it");
const wishOrder = r.data.orders[0];
await wait();
r = await call("GET", "/api/me/notifications", undefined, store.token);
check(r.data.items.some((x: any) => x.title === `New order ${wishOrder.number}` && x.link === "/sell/orders"), "the shop is told about the new order");
await call("POST", `/api/shop/orders/${wishOrder.id}/accept`, undefined, store.token);
await wait();
r = await call("GET", "/api/me/notifications", undefined, fan.token);
check(r.data.items.some((x: any) => x.type === "order" && x.title.includes("accepted") && x.link === `/orders/${wishOrder.id}`), "the buyer is told when the shop accepts");

r = await call("POST", "/api/chats", { shopId: store.shopId, body: "Is the red one in stock?" }, fan.token);
const chatId = r.data.conversation?.id ?? r.data.id;
await wait();
r = await call("GET", "/api/me/notifications", undefined, store.token);
check(r.data.items.some((x: any) => x.type === "chat" && x.body?.includes("red one")), "the shop is told about a new message", r.data.items.slice(0, 3));

r = await call("GET", "/api/me/notifications/unread", undefined, fan.token);
const before = r.data.unread;
r = await call("POST", "/api/me/notifications/read", {}, fan.token);
r = await call("GET", "/api/me/notifications/unread", undefined, fan.token);
check(before > 0 && r.data.unread === 0, "opening the bell marks everything read");
r = await call("POST", "/api/me/push-token", { token: "not-a-token" }, fan.token);
check(r.status === 400, "only real Expo push tokens are accepted");
r = await call("POST", "/api/me/push-token", { token: `ExponentPushToken[test${n}]`, platform: "android" }, fan.token);
check(r.status === 200, "the phone registers for push notifications");
r = await call("DELETE", `/api/me/wishlist/${dressId}`, undefined, fan.token);
r = await call("GET", "/api/me/wishlist/ids", undefined, fan.token);
check(!r.data.ids.includes(dressId), "unsaving removes it");
void chatId;

// ─── Bookings: restaurant tables ──────────────────────────────────────────
const diner = await person("49", "Table Buyer");
r = await call("GET", `/api/public/shops/${(await call("GET", `/api/public/shops?mode=food&q=${encodeURIComponent(`Dir Kitchen ${n}`)}`)).data.items[0].slug}`);
const kitchenSlug = r.data.shop.slug;
check(r.data.shop.booking === null, "a restaurant doesn't take bookings until it switches them on");
r = await call("PUT", "/api/shop/bookings/settings", { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], opens: "18:00", closes: "12:00", slotMinutes: 60, perSlot: 1, maxPartySize: 6, leadHours: 2, daysAhead: 30, note: null }, kitchen.token);
check(r.status === 400, "closing time must be after opening time");
r = await call("PUT", "/api/shop/bookings/settings", { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], opens: "12:00", closes: "21:00", slotMinutes: 60, perSlot: 1, maxPartySize: 6, leadHours: 2, daysAhead: 30, note: "We hold tables for 15 minutes." }, kitchen.token);
check(r.status === 200 && r.data.settings.enabled, "the restaurant switches on table bookings");
r = await call("GET", `/api/public/shops/${kitchenSlug}`);
check(r.data.shop.booking?.kind === "table" && r.data.shop.booking.maxPartySize === 6, "the shop page says it takes table bookings");
const day = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
r = await call("GET", `/api/public/shops/${kitchenSlug}/availability?date=${day}`);
check(r.data.slots.length === 9 && r.data.slots[0].time === "12:00" && r.data.slots.every((x: any) => x.left === 1), "free times come from the opening hours", r.data.slots);
const seven = r.data.slots.find((x: any) => x.time === "19:00");
const tableReq = { shopId: kitchen.shopId, startsAt: seven.startsAt, partySize: 4, contactName: "Table Buyer", contactPhone: `049${n}`, note: "Birthday" };
r = await call("POST", "/api/bookings", { ...tableReq, partySize: 10 }, diner.token);
check(r.status === 400 && r.data.fields?.partySize, "big groups are asked to call");
r = await call("POST", "/api/bookings", tableReq, diner.token);
check(r.status === 201 && r.data.booking.status === "requested" && /^BK-\d+$/.test(r.data.booking.number), "a buyer requests a table");
const tableBooking = r.data.booking;
const other = await person("48", "Late Buyer");
r = await call("POST", "/api/bookings", { ...tableReq, contactName: "Late Buyer", contactPhone: `048${n}` }, other.token);
check(r.status === 409, "a full time can't be booked twice");
r = await call("GET", `/api/public/shops/${kitchenSlug}/availability?date=${day}`);
check(r.data.slots.find((x: any) => x.time === "19:00").left === 0, "the time shows as full");
await new Promise((ok) => setTimeout(ok, 600));
r = await call("GET", "/api/me/notifications", undefined, kitchen.token);
check(r.data.items.some((x: any) => x.type === "booking" && x.title.includes(tableBooking.number)), "the restaurant is told about the request");
r = await call("GET", "/api/shop/bookings?view=requests", undefined, kitchen.token);
check(r.data.items.some((b: any) => b.id === tableBooking.id && b.partySize === 4), "the restaurant sees the request");
r = await call("POST", `/api/shop/bookings/${tableBooking.id}/decline`, {}, kitchen.token);
check(r.status === 400, "declining needs a reason");
r = await call("POST", `/api/shop/bookings/${tableBooking.id}/confirm`, {}, kitchen.token);
check(r.status === 200 && r.data.booking.status === "confirmed", "the restaurant confirms");
await new Promise((ok) => setTimeout(ok, 600));
r = await call("GET", "/api/me/notifications", undefined, diner.token);
check(r.data.items.some((x: any) => x.type === "booking" && x.title.includes("confirmed") && x.link === `/bookings/${tableBooking.id}`), "the buyer is told it's confirmed");
r = await call("GET", "/api/bookings", undefined, diner.token);
check(r.data.items.some((b: any) => b.id === tableBooking.id && b.status === "confirmed"), "the buyer sees their booking");
r = await call("POST", `/api/bookings/${tableBooking.id}/cancel`, { reason: "Plans changed" }, diner.token);
check(r.status === 200 && r.data.booking.status === "cancelled", "the buyer can cancel");
r = await call("GET", `/api/public/shops/${kitchenSlug}/availability?date=${day}`);
check(r.data.slots.find((x: any) => x.time === "19:00").left === 1, "a cancelled booking frees the time");

// ─── Bookings: services ───────────────────────────────────────────────────
const cats2 = (await call("GET", "/api/public/categories?kind=goods")).data.items;
const imgs = (await call("POST", "/api/uploads", photos(1), store.token)).data.urls;
r = await call("POST", "/api/shop/products", { name: "Photo shoot (1 hour)", categoryId: cats2[0].id, images: imgs, price: 5000, bookable: true, durationMinutes: 90 }, store.token);
check(r.status === 201 && r.data.product.bookable && r.data.product.durationMinutes === 90, "a shop adds a bookable service");
const shoot = r.data.product;
await call("POST", `/api/admin/products/${shoot.id}/approve`, undefined, admin);
await call("PUT", "/api/shop/bookings/settings", { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], opens: "09:00", closes: "12:00", slotMinutes: 30, perSlot: 1, maxPartySize: 1, leadHours: 1, daysAhead: 14, note: null }, store.token);
r = await call("GET", `/api/public/shops/${listed.slug}/availability?date=${day}&productId=${shoot.id}`);
check(r.data.slots.length === 4 && r.data.slots[0].time === "09:00" && r.data.slots[3].time === "10:30", "service times step every 30 minutes and finish by closing time", r.data.slots.map((x: any) => x.time));
r = await call("POST", "/api/bookings", { shopId: store.shopId, startsAt: r.data.slots[0].startsAt, contactName: "Table Buyer", contactPhone: `049${n}` }, diner.token);
check(r.status === 400 && r.data.fields?.productId, "a service booking needs the service");
r = await call("GET", `/api/public/shops/${listed.slug}/availability?date=${day}&productId=${shoot.id}`);
const nine = r.data.slots[0];
r = await call("POST", "/api/bookings", { shopId: store.shopId, productId: shoot.id, startsAt: nine.startsAt, contactName: "Table Buyer", contactPhone: `049${n}` }, diner.token);
check(r.status === 201 && r.data.booking.kind === "service" && r.data.booking.durationMinutes === 90 && r.data.booking.product.name === shoot.name, "a buyer books the service");
r = await call("GET", `/api/public/shops/${listed.slug}/availability?date=${day}&productId=${shoot.id}`);
const busy = r.data.slots.filter((x: any) => x.left === 0).map((x: any) => x.time);
check(busy.join() === "09:00,09:30,10:00", "a 90-minute booking blocks the times it overlaps", busy);
r = await call("GET", "/api/admin/bookings", undefined, admin);
check(r.status === 200 && r.data.items.length >= 2, "admin sees all bookings");

// @@NEXT@@

console.log(`\n${passed} checks passed`);
