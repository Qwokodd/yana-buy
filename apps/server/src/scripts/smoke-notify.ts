/**
 * Email + SMS: sign-up codes, the confirmed-email rule, and notifications by email/SMS
 * (including admin alerts). Needs a second server that writes messages to a file:
 *   OUTBOX_FILE=/tmp/yb-outbox.jsonl PORT=4100 PUSH_DISABLED=1 npx tsx src/index.ts
 *   npx tsx src/scripts/smoke-notify.ts
 * Takes a little over a minute (it waits out the one-code-a-minute limit once).
 */
import crypto from "node:crypto";

const BASE = process.env.API ?? "http://localhost:4100";
import fs from "node:fs";
const OUTBOX = process.env.OUTBOX ?? "/tmp/yb-outbox.jsonl";
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

/** Logs in; when a login code is asked for, reads it from the outbox file and finishes. */
async function login(body: Record<string, unknown>) {
  const read = () => (fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as { text: string }) : []);
  const before = read().length;
  const r = await call("POST", "/api/auth/login", body);
  if (r.status !== 200 || !r.data.needsCode) return r;
  const msg = read().slice(before).reverse().find((m) => /login code is (\d{6})/.test(m.text));
  return call("POST", "/api/auth/login/verify", { challengeId: r.data.challengeId, code: /login code is (\d{6})/.exec(msg?.text ?? "")?.[1] ?? "000000" });
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
let r = await login({ phone: "0770000001", password: "adminpass123" });
const admin = r.data.accessToken as string;

async function person(prefix: string, name: string) {
  const reg = await call("POST", "/api/auth/register", { fullName: name, phone: `0${prefix}${n}`, email: `${crypto.randomUUID().slice(0, 12)}@test.yanabuy.com`, password: "password123" });
  return { token: reg.data.accessToken as string, id: reg.data.user.id as string };
}

async function sellerWithProducts(prefix: string, kind: "store" | "restaurant", shopName: string, items: { name: string; price: number; stock: number | null }[], before?: (token: string) => Promise<unknown>) {
  const me = await person(prefix, `${shopName} Owner`);
  if (before) await before(me.token);
  const up = await call("POST", "/api/uploads/private", photos(2), me.token);
  const app = await call(
    "POST",
    "/api/shop/apply",
    { kind, name: shopName, phone: `0${prefix}${n}`, city: "Monrovia", address: "Broad Street", idType: "passport", idFrontKey: up.data.files[0].key, selfieKey: up.data.files[1].key },
    me.token
  );
  if (app.status !== 201) return { ...me, shopId: "", products: [] as string[], applyStatus: app.status };
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



type Sent = { channel: "email" | "sms"; to: string; subject?: string; text: string };
const outbox = (): Sent[] => (fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
let mark = 0;
const since = () => outbox().slice(mark);
const markNow = () => (mark = outbox().length);
const lastCode = (to: string) => {
  const m = [...outbox()].reverse().find((s) => s.channel === "email" && s.to === to && /code is (\d{6})/.test(s.text));
  return m ? /code is (\d{6})/.exec(m.text)![1] : null;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mailOf = (who: string) => `${who}${n}@test.yanabuy.com`;

// Confirms the email of an account created by person()/sellerWithProducts (they used a random address).
async function confirm(token: string, email: string) {
  await call("POST", "/api/me/email", { email }, token);
  const r = await call("POST", "/api/me/email/verify", { code: lastCode(email) }, token);
  return r;
}

// ─── Sign-up: phone needed, email optional, nothing to confirm ────────────
r = await call("POST", "/api/auth/register", { fullName: "No Phone", email: `nophone${n}@test.yanabuy.com`, password: "password123" });
check(r.status === 400 && r.data.fields?.phone, "signing up without a phone number is refused");
r = await call("POST", "/api/auth/register", { fullName: "Bad Email", phone: `086${n}`, email: "not-an-email", password: "password123" });
check(r.status === 400 && r.data.fields?.email, "a bad email is refused");

markNow();
const bEmail = mailOf("buyer");
r = await call("POST", "/api/auth/register", { fullName: "Mail Buyer", phone: `086${n}`, email: bEmail.toUpperCase(), password: "password123" });
check(r.status === 201 && r.data.user.email === bEmail && r.data.user.emailVerified === false && r.data.user.needsVerification === false, "a buyer signs up (email saved lower-case) and needs nothing confirmed", r.data);
const buyer = { token: r.data.accessToken as string, id: r.data.user.id as string };
check(!since().some((s) => s.to === bEmail || s.to === `+23186${n}`), "no codes are sent at sign-up", since());

r = await call("POST", "/api/me/email", {}, buyer.token);
check(r.status === 200 && lastCode(bEmail), "a code is emailed when they ask to confirm their email");
r = await call("POST", "/api/me/email", {}, buyer.token);
check(r.status === 429, "codes can't be asked for again within a minute");
r = await call("POST", "/api/me/email/verify", { code: "000000" === lastCode(bEmail) ? "111111" : "000000" }, buyer.token);
check(r.status === 400 && r.data.fields?.code, "a wrong code is refused");
r = await call("PATCH", "/api/me", { email: "sneaky@test.yanabuy.com" }, buyer.token);
check(r.status === 400, "the email can't be changed without the code check");

// ─── Sellers must confirm their email before applying ────────────────────
const noMail = await person("85", "Unconfirmed Seller");
const nmUp = await call("POST", "/api/uploads/private", photos(2), noMail.token);
r = await call("POST", "/api/shop/apply", { kind: "store", name: `No Mail Shop ${n}`, phone: `085${n}`, city: "Monrovia", address: "Broad Street", idType: "passport", idFrontKey: nmUp.data.files[0].key, selfieKey: nmUp.data.files[1].key }, noMail.token);
check(r.status === 403 && r.data.fields?.email === "needs_email", "a seller with no confirmed email can't open a shop", r.data);
r = await call("POST", "/api/rider-application", { vehicle: "on_foot", city: "Monrovia", areas: "Waterside", emergencyName: "Mary", emergencyPhone: "0886123457" }, noMail.token);
check(r.status === 403 && r.data.fields?.email === "needs_email", "…nor apply to be a rider");
const sEmail = mailOf("seller");
const seller = await sellerWithProducts("87", "store", `Mail Shop ${n}`, [{ name: `Mail Lappa ${n}`, price: 1500, stock: 9 }], async (token) => {
  const c = await confirm(token, sEmail);
  check(c.status === 200 && c.data.user.email === sEmail && c.data.user.emailVerified, "seller confirms their email");
});
check(seller.products.length === 1, "with a confirmed email the shop opens", seller);

// ─── Buyers order without confirming anything ────────────────────────────
const item = { productId: seller.products[0], quantity: 1 };
const delivery = { name: "Mail Buyer", phone: `086${n}`, city: "Monrovia", address: "Broad Street" };
r = await call("POST", "/api/orders", { items: [item], delivery, paymentMethod: "cod" }, buyer.token);
check(r.status === 201, "a buyer with nothing confirmed can check out", r.data);

r = await call("POST", "/api/me/email/verify", { code: lastCode(bEmail) }, buyer.token);
check(r.status === 200 && r.data.user.emailVerified, "the right code confirms the buyer's email (optional for buyers)");

// Admin confirms theirs so they get alerts.
const aEmail = mailOf("admin");
r = await call("GET", "/api/me", undefined, admin);
const adminPhone = r.data.user.phone;
if (!r.data.user.emailVerified) {
  await wait(1000);
  r = await confirm(admin, aEmail);
  check(r.status === 200, "admin confirms their email");
}
const adminEmail = (await call("GET", "/api/me", undefined, admin)).data.user.email;

markNow();
const shop = await sellerWithProducts("88", "store", `Mail Shop B ${n}`, [{ name: `Mail Dress ${n}`, price: 2000, stock: 9 }], async (token) => confirm(token, mailOf("sellerb")));
await wait(800);
let s = since();
check(s.some((m) => m.channel === "email" && m.to === adminEmail && /to approve/.test(m.subject ?? "")), "admins get an email when a shop applies", s);
check(s.some((m) => m.channel === "sms" && m.to === adminPhone && /to approve/.test(m.text)), "…and a text message");
check(s.some((m) => m.to === adminEmail && /to review/.test(m.subject ?? "")), "admins hear about new products to review");
check(s.some((m) => m.channel === "email" && m.to === mailOf("sellerb") && /approved/.test(m.subject ?? "")), "the seller is emailed when the shop is approved");

// ─── Order updates by email + SMS ─────────────────────────────────────────
markNow();
r = await call("POST", "/api/orders", { items: [{ productId: shop.products[0], quantity: 1 }], delivery, paymentMethod: "cod" }, buyer.token);
check(r.status === 201, "a confirmed buyer can check out", r.data);
const orderId = r.data.orders[0].id;
await wait(800);
s = since();
const sellerPhone = `+23188${n}`;
check(s.some((m) => m.channel === "email" && m.to === mailOf("sellerb") && /New order/.test(m.subject ?? "")), "the seller gets an email about the new order", s);
check(s.some((m) => m.channel === "sms" && m.to === sellerPhone && /New order/.test(m.text)), "…and an SMS");
const orderMail = s.find((m) => m.channel === "email" && /New order/.test(m.subject ?? ""))!;
check(/http:\/\/localhost:3000\/sell\/orders/.test(orderMail.text), "emails link back to the right page");

markNow();
r = await call("POST", `/api/shop/orders/${orderId}/accept`, {}, shop.token);
check(r.status === 200, "the seller accepts", r.data);
await wait(800);
s = since();
check(s.some((m) => m.channel === "email" && m.to === bEmail && /accepted/.test(m.subject ?? "")), "the buyer is emailed when the order is accepted", s);
check(s.some((m) => m.channel === "sms" && m.to === `+23186${n}` && /accepted/.test(m.text)), "…and texted");
check(s.some((m) => m.to === adminEmail && /needs a rider/.test(m.subject ?? "")), "admins are told the order needs a rider");

// ─── Chats don't flood ────────────────────────────────────────────────────
markNow();
r = await call("POST", "/api/chats", { shopId: shop.shopId, body: "Hello, is it in stock?" }, buyer.token);
const convoId = r.data.conversation?.id ?? r.data.id;
check(r.status === 201 || r.status === 200, "buyer messages the shop", r.data);
for (let i = 0; i < 2; i++) await call("POST", `/api/chats/${convoId}/messages`, { body: `More ${i}` }, buyer.token);
await wait(900);
s = since().filter((m) => m.channel === "sms" && m.to === sellerPhone);
check(s.length === 1, "three chat messages send one text, not three", since());

// ─── Changing email ───────────────────────────────────────────────────────
markNow();
r = await call("POST", "/api/me/email", { email: sEmail }, buyer.token);
check(r.status === 409, "someone else's confirmed email can't be taken");
await wait(61_000);
const newMail = mailOf("buyer-new");
r = await call("POST", "/api/me/email", { email: newMail }, buyer.token);
check(r.status === 200 && r.data.email === newMail, "a code goes to the new address");
r = await call("GET", "/api/me", undefined, buyer.token);
check(r.data.user.email === bEmail && r.data.user.emailVerified, "the old address stays until the new one is confirmed");
r = await call("POST", "/api/me/email/verify", { code: lastCode(newMail) }, buyer.token);
check(r.status === 200 && r.data.user.email === newMail && r.data.user.emailVerified, "confirming switches to the new address");

// An address someone typed but never confirmed can be claimed by its real owner.
const squatter = await call("POST", "/api/auth/register", { fullName: "Typo Person", phone: `084${n}`, email: mailOf("real-owner"), password: "password123" });
check(squatter.status === 201, "someone signs up with an address they don't own");
r = await call("POST", "/api/auth/register", { fullName: "Real Owner", phone: `083${n}`, email: mailOf("real-owner"), password: "password123" });
check(r.status === 201, "the real owner can still sign up with it (it wasn't confirmed)", r.data);
r = await confirm(r.data.accessToken, mailOf("real-owner"));
check(r.status === 200, "and confirm it");

console.log(`\n${passed} checks passed`);
