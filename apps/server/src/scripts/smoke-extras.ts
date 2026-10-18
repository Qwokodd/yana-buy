/**
 * Forgot password, admin messages (broadcasts) and work profiles / portfolios.
 * Needs the second server that writes emails and texts to a file:
 *   OUTBOX_FILE=/tmp/yb-outbox.jsonl PORT=4100 PUSH_DISABLED=1 npx tsx src/index.ts
 *   npx tsx src/scripts/smoke-extras.ts
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


const resetCode = (to: string) => {
  const m = [...outbox()].reverse().find((s) => s.to === to && /reset code is (\d{6})/.test(s.text));
  return m ? /reset code is (\d{6})/.exec(m.text)![1] : null;
};

// ─── Forgot password ──────────────────────────────────────────────────────
r = await call("POST", "/api/auth/forgot-password", { phone: `0866${n.slice(1)}` });
check(r.status === 200 && r.data.ok, "asking for a code for an unknown number looks the same as for a real one");

const uEmail = mailOf("forgetful");
r = await call("POST", "/api/auth/register", { fullName: "Forgetful Fatu", phone: `081${n}`, email: uEmail, password: "oldpass123" });
const fatu = { token: r.data.accessToken as string, refresh: r.data.refreshToken as string, id: r.data.user.id as string };
await call("POST", "/api/me/email/verify", { code: lastCode(uEmail) }, fatu.token);
markNow();
r = await call("POST", "/api/auth/forgot-password", { phone: `+231 81 ${n}` });
check(r.status === 200, "forgot password accepts the number typed any way");
let s = since();
check(s.some((m) => m.channel === "email" && m.to === uEmail && /password reset/.test(m.subject ?? "")), "the code is emailed to the confirmed address", s);
check(s.some((m) => m.channel === "sms" && m.to === `+23181${n}` && /reset code/.test(m.text)), "…and texted to the phone");
r = await call("POST", "/api/auth/forgot-password", { phone: `081${n}` });
check(r.status === 429, "another code can't be asked for within a minute");
r = await call("POST", "/api/auth/reset-password", { phone: `081${n}`, code: resetCode(`+23181${n}`) === "000000" ? "111111" : "000000", password: "newpass123" });
check(r.status === 400 && r.data.fields?.code, "a wrong code is refused");
r = await call("POST", "/api/auth/reset-password", { phone: `081${n}`, code: resetCode(uEmail), password: "short" });
check(r.status === 400 && r.data.fields?.password, "the new password must be at least 8 characters");
r = await call("POST", "/api/auth/reset-password", { phone: `081${n}`, code: resetCode(uEmail), password: "newpass123" });
check(r.status === 200 && r.data.accessToken && r.data.user.id === fatu.id, "the right code sets the new password and logs in");
r = await call("POST", "/api/auth/refresh", { refreshToken: fatu.refresh });
check(r.status === 401, "other devices are logged out");
r = await call("POST", "/api/auth/login", { phone: `081${n}`, password: "oldpass123" });
check(r.status === 401, "the old password no longer works");
r = await call("POST", "/api/auth/login", { phone: `081${n}`, password: "newpass123" });
check(r.status === 200, "the new one does");
r = await call("POST", "/api/auth/reset-password", { phone: `081${n}`, code: resetCode(uEmail), password: "another123" });
check(r.status === 400, "a code works only once");

// ─── Work profile & portfolio ─────────────────────────────────────────────
const pro = await sellerWithProducts("82", "store", `Glam Studio ${n}`, [{ name: `Bridal make-up ${n}`, price: 5000, stock: null }], async (token) => confirm(token, mailOf("glam")));
check(pro.shopId, "a service provider has an approved shop");
r = await call("GET", "/api/shop/work-profile", undefined, fatu.token);
check(r.status === 404, "people without a shop have no work profile");
r = await call("PUT", "/api/shop/work-profile", { videos: [{ url: "https://evil.example.com/v.mp4" }] }, pro.token);
check(r.status === 400, "only links to the big video sites are accepted");
r = await call(
  "PUT",
  "/api/shop/work-profile",
  {
    tagline: "Bridal make-up & gele",
    about: "Ten years making brides glow in Monrovia.",
    yearsExperience: 10,
    skills: ["Bridal make-up", "Gele", "bridal make-up".replace("b", "B"), "Lashes"],
    certifications: ["MAC Pro"],
    languages: ["English", "Kpelle"],
    serviceAreas: ["Sinkor", "Paynesville"],
    servesAt: ["home", "shop"],
    videos: [{ url: "https://youtu.be/dQw4w9WgXcQ", title: "Wedding look" }, { url: "https://www.tiktok.com/@glam/video/123" }],
  },
  pro.token
);
check(r.status === 200 && r.data.profile.skills.length === 3 && r.data.profile.videos.length === 2, "the work profile saves (repeated skills are dropped)", r.data);
const pics = (await call("POST", "/api/uploads", photos(3), pro.token)).data.urls as string[];
r = await call("POST", "/api/shop/portfolio", { title: "Empty" }, pro.token);
check(r.status === 400, "a piece of work needs a photo or a video");
r = await call("POST", "/api/shop/portfolio", { title: "Kebbeh's wedding", description: "Full bridal party, 6 faces.", images: pics }, pro.token);
check(r.status === 201 && r.data.item.images.length === 3, "adds past work with photos");
const wedding = r.data.item.id;
r = await call("POST", "/api/shop/portfolio", { title: "Graduation glam", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }, pro.token);
check(r.status === 201, "adds past work with just a video");
const grad = r.data.item.id;
let mine = (await call("GET", "/api/shop/work-profile", undefined, pro.token)).data.items;
check(mine[0].id === grad && mine[1].id === wedding, "newest work shows first");
r = await call("POST", `/api/shop/portfolio/${wedding}/move`, { direction: "up" }, pro.token);
check(r.data.items[0].id === wedding, "work can be moved up");
r = await call("PATCH", `/api/shop/portfolio/${grad}`, { title: "Graduation glam 2026" }, pro.token);
check(r.status === 200 && r.data.item.title === "Graduation glam 2026", "work can be edited");
r = await call("PATCH", `/api/shop/portfolio/${grad}`, { title: "Hacked" }, fatu.token);
check(r.status === 404 || r.status === 400, "someone else can't edit it");

const slug = (await call("GET", `/api/public/shops?q=${encodeURIComponent(`Glam Studio ${n}`)}`)).data.items[0].slug;
r = await call("GET", `/api/public/shops/${slug}`);
check(r.data.shop.workProfile?.tagline === "Bridal make-up & gele" && r.data.shop.workProfile.yearsExperience === 10 && r.data.shop.portfolioCount === 2, "the shop page shows the work profile", r.data.shop);
r = await call("GET", `/api/public/shops/${slug}/portfolio`);
check(r.data.items.length === 2 && r.data.items[0].id === wedding, "anyone can see the portfolio in the shop's order");
r = await call("DELETE", `/api/shop/portfolio/${grad}`, undefined, pro.token);
check(r.status === 204, "work can be removed");

// ─── Admin messages ───────────────────────────────────────────────────────
r = await call("POST", "/api/admin/broadcasts/preview", { audience: "everyone" }, fatu.token);
check(r.status === 403, "only admins can send messages");
r = await call("POST", "/api/admin/broadcasts/preview", { audience: "user", userId: fatu.id }, admin);
check(r.status === 200 && r.data.preview.recipients === 1 && r.data.preview.withEmail === 1, "admin sees who a message will reach", r.data);
r = await call("POST", "/api/admin/broadcasts", { audience: "user", userId: fatu.id, title: "Hi", body: "Test", channels: { app: false, email: false, sms: false } }, admin);
check(r.status === 400, "at least one way to send is needed");
r = await call("POST", "/api/admin/broadcasts", { audience: "user", userId: fatu.id, title: "Hi", body: "Test", link: "https://phish.example.com", channels: { app: true, email: false, sms: false } }, admin);
check(r.status === 400, "links must be pages on YanaBuy");

markNow();
r = await call("POST", "/api/admin/broadcasts", { audience: "user", userId: fatu.id, title: `Your account ${n}`, body: "Thanks for shopping with us!", link: "/shops", channels: { app: true, email: true, sms: true } }, admin);
check(r.status === 201 && r.data.broadcast.recipients === 1, "admin messages one person", r.data);
await wait(1200);
s = since();
check(s.some((m) => m.channel === "email" && m.to === uEmail && m.subject === `Your account ${n}`), "…by email", s);
check(s.some((m) => m.channel === "sms" && m.to === `+23181${n}` && m.text.includes("Thanks for shopping")), "…by SMS");
const fatuLogin = (await call("POST", "/api/auth/login", { phone: `081${n}`, password: "newpass123" })).data.accessToken;
r = await call("GET", "/api/me/notifications", undefined, fatuLogin);
check(r.data.items.some((x: any) => x.title === `Your account ${n}` && x.link === "/shops"), "…and in the app's bell");

// A USA vendor and a Liberia vendor: a USA-only message reaches just the first.
const usPro = await sellerWithProducts("83", "store", `US Braids ${n}`, [], async (token) => confirm(token, mailOf("usbraids")));
await call("POST", `/api/admin/shops/${usPro.shopId}/country`, { country: "US" }, admin);
markNow();
r = await call("POST", "/api/admin/broadcasts/preview", { audience: "vendors", country: "US" }, admin);
const usVendors = r.data.preview.recipients;
r = await call("POST", "/api/admin/broadcasts", { audience: "vendors", country: "US", title: `US vendors ${n}`, body: "New delivery areas in Philadelphia.", channels: { app: false, email: true, sms: false } }, admin);
check(r.status === 201 && r.data.broadcast.recipients === usVendors, "admin messages USA vendors", r.data);
await wait(1500);
s = since().filter((m) => m.subject === `US vendors ${n}`);
check(s.some((m) => m.to === mailOf("usbraids")) && !s.some((m) => m.to === mailOf("glam")), "USA vendors get it, Liberia vendors don't", s);
check(!s.some((m) => m.to === uEmail), "buyers don't get a vendors message");
check(since().every((m) => m.channel !== "sms" || !m.text.includes(`US vendors ${n}`)), "no texts when SMS wasn't ticked");

r = await call("GET", "/api/admin/broadcasts", undefined, admin);
const sent = r.data.items.find((b: any) => b.title === `US vendors ${n}`);
check(sent && sent.status === "sent" && sent.emailsSent >= 1 && sent.sentBy, "the message history shows what was sent and how many emails went", sent);

console.log(`\n${passed} checks passed`);
