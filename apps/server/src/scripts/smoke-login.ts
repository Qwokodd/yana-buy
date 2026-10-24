/**
 * Login codes: phone or email sign-up, the 6-digit code after the password (text for
 * phone logins, email for email logins), "trust this device", admins always asked,
 * resend / switch channel, forgot password by email, confirming a phone, and
 * claiming an old-store account with a code.
 * Needs the second server that writes emails and texts to a file:
 *   OUTBOX_FILE=/tmp/yb-outbox.jsonl PORT=4100 PUSH_DISABLED=1 npx tsx src/index.ts
 *   npx tsx src/scripts/smoke-login.ts
 * Takes a little over two minutes (it waits out the one-code-a-minute limit twice).
 */
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/client";
import { users } from "../db/schema";

const BASE = process.env.API ?? "http://localhost:4100";
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
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

type Sent = { channel: "email" | "sms"; to: string; subject?: string; text: string };
const outbox = (): Sent[] => (fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
/** The newest code of a kind sent to an address/number. */
const codeFor = (to: string, kind: RegExp) => {
  const m = [...outbox()].reverse().find((s) => s.to === to && kind.test(s.text));
  return m ? /(\d{6})/.exec(m.text.match(kind)![0])![1] : null;
};
const LOGIN = /login code is \d{6}/;
const PHONE = /your code is \d{6}/;
const EMAIL = /code is \d{6}/;
const RESET = /reset code is \d{6}/;
const wrong = (c: string | null) => (c === "000000" ? "111111" : "000000");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const n = String(Date.now()).slice(-7);

// ─── Admins always get a code ──────────────────────────────────────────────
let r = await call("POST", "/api/auth/login", { phone: "0770000001", password: "adminpass123" });
check(r.status === 200 && r.data.needsCode && !r.data.accessToken, "admin: the right password asks for a code (no tokens yet)", r.data);
check(r.data.channel === "sms" && r.data.sentTo.endsWith("001") && !r.data.sentTo.includes("770"), "…texted to the admin's phone, shown partly hidden", r.data);
r = await call("POST", "/api/auth/login/verify", { challengeId: r.data.challengeId, code: codeFor("+231770000001", LOGIN), trustDevice: true });
check(r.status === 200 && r.data.accessToken && r.data.user.role === "admin", "admin: the code finishes logging in");
check(!r.data.deviceToken, "admin: 'trust this device' is ignored for admins");
const admin = r.data.accessToken as string;

// ─── Buyers sign up with a phone and confirm nothing ──────────────────────
const phoneA = `+23188${n}`;
r = await call("POST", "/api/auth/register", { fullName: "Phone Only", phone: `088${n}`, password: "password123" });
check(r.status === 201 && r.data.user.phone === phoneA && r.data.user.email === null, "sign up with just a phone number", r.data);
check(r.data.user.phoneVerified === false && r.data.user.needsVerification === false, "…nothing to confirm for a buyer");
const pa = { token: r.data.accessToken as string, id: r.data.user.id as string };
check(!codeFor(phoneA, PHONE), "…and no code is texted at sign-up");
r = await call("POST", "/api/orders", { items: [], delivery: {}, paymentMethod: "cod" }, pa.token);
check(r.status === 400, "…checkout isn't blocked (only the empty cart is refused)", r.data);
// Confirming the phone is still possible from Account (optional).
r = await call("POST", "/api/me/phone", {}, pa.token);
const firstPhoneCode = codeFor(phoneA, PHONE);
check(r.status === 200 && firstPhoneCode, "a buyer can still ask for a code to confirm their phone");
r = await call("POST", "/api/me/phone/verify", { code: wrong(firstPhoneCode) }, pa.token);
check(r.status === 400 && r.data.fields?.code, "a wrong phone code is refused");
r = await call("POST", "/api/me/phone/verify", { code: firstPhoneCode }, pa.token);
check(r.status === 200 && r.data.user.phoneVerified, "the right code confirms the phone");

// ─── Phone login: code by text, trust this device ─────────────────────────
r = await call("POST", "/api/auth/login", { login: `088${n}`, password: "nope12345" });
check(r.status === 401 && r.data.error === "Wrong phone number or password", "wrong password refused (no code sent)");
r = await call("POST", "/api/auth/login", { login: `+231 88 ${n}`, password: "password123" });
check(r.status === 200 && r.data.needsCode && r.data.channel === "sms" && r.data.channels.join() === "sms", "phone login asks for a text code (no email on the account to switch to)", r.data);
let ch = r.data.challengeId as string;
r = await call("POST", "/api/auth/login/verify", { challengeId: ch, code: wrong(codeFor(phoneA, LOGIN)) });
check(r.status === 400 && r.data.fields?.code, "a wrong login code is refused");
r = await call("POST", "/api/auth/login/resend", { challengeId: ch });
check(r.status === 429, "a new code can't be asked for within a minute");
r = await call("POST", "/api/auth/login/resend", { challengeId: ch, channel: "email" });
check(r.status === 400, "can't switch to email when the account has none");
r = await call("POST", "/api/auth/login/verify", { challengeId: ch, code: codeFor(phoneA, LOGIN), trustDevice: true });
check(r.status === 200 && r.data.accessToken && r.data.user.id === pa.id, "the right code logs in");
check(typeof r.data.deviceToken === "string" && r.data.deviceToken.length > 30, "'trust this device' gives the app a device token");
const deviceA = r.data.deviceToken as string;
r = await call("POST", "/api/auth/login/verify", { challengeId: ch, code: codeFor(phoneA, LOGIN) });
check(r.status === 400, "a login code works only once");
r = await call("POST", "/api/auth/login", { phone: `088${n}`, password: "password123", deviceToken: deviceA });
check(r.status === 200 && r.data.accessToken && !r.data.needsCode, "a trusted device logs in without a code");
r = await call("POST", "/api/auth/login", { phone: `088${n}`, password: "password123", deviceToken: "made-up-device-token-123456789" });
check(r.status === 200 && r.data.needsCode, "a made-up device token still gets asked for a code");
r = await call("POST", "/api/auth/login", { phone: "0770000001", password: "adminpass123", deviceToken: deviceA });
check(r.data.needsCode, "someone else's device token doesn't help (admin still asked)");

// Five wrong codes and that challenge is finished.
r = await call("POST", "/api/auth/login", { phone: `088${n}`, password: "password123" });
ch = r.data.challengeId;
for (let i = 0; i < 5; i++) await call("POST", "/api/auth/login/verify", { challengeId: ch, code: wrong(codeFor(phoneA, LOGIN)) });
r = await call("POST", "/api/auth/login/verify", { challengeId: ch, code: codeFor(phoneA, LOGIN) });
check(r.status === 400 && /log in again/i.test(r.data.error), "after 5 wrong tries even the right code is refused", r.data);

// ─── Email is optional at sign-up; email logins still work ─────────────────
const mailB = `onlymail${n}@test.yanabuy.com`;
const phoneB = `+23177${n}`;
r = await call("POST", "/api/auth/register", { fullName: "Mail Only", email: mailB, password: "password123" });
check(r.status === 400 && r.data.fields?.phone, "signing up without a phone number is refused");
r = await call("POST", "/api/auth/register", { fullName: "Mail Person", phone: `077${n}`, email: mailB, password: "password123" });
check(r.status === 201 && r.data.user.email === mailB && !r.data.user.emailVerified && !r.data.user.needsVerification, "sign up with a phone and an optional email", r.data);
const pb = { token: r.data.accessToken as string, id: r.data.user.id as string };
check(!codeFor(mailB, EMAIL), "…no email code at sign-up either");
r = await call("POST", "/api/auth/login", { login: mailB, password: "wrongpass1" });
check(r.status === 401 && r.data.error === "Wrong email or password", "email login: wrong password refused");
r = await call("POST", "/api/auth/login", { login: mailB.toUpperCase(), password: "password123" });
check(r.status === 200 && r.data.needsCode && r.data.channel === "email" && r.data.sentTo.startsWith("on•••@"), "email login asks for a code by email", r.data);
r = await call("POST", "/api/auth/login/verify", { challengeId: r.data.challengeId, code: codeFor(mailB, LOGIN) });
check(r.status === 200 && r.data.user.id === pb.id && r.data.user.emailVerified, "the emailed code logs in and confirms the email");
r = await call("POST", "/api/me/phone", { phone: `088${n}` }, pb.token);
check(r.status === 409, "can't switch to a number another account uses");

// Both confirmed: phone login can switch to email.
r = await call("POST", "/api/auth/login", { phone: `077${n}`, password: "password123" });
check(r.data.needsCode && r.data.channel === "sms" && r.data.channels.join() === "sms,email", "phone login with a confirmed email: the code can go by text or email", r.data);
ch = r.data.challengeId;
const smsCode = codeFor(phoneB, LOGIN);
r = await call("POST", "/api/auth/login/resend", { challengeId: ch, channel: "email" });
check(r.status === 200 && r.data.channel === "email", "'email me instead' sends a new code by email");
r = await call("POST", "/api/auth/login/verify", { challengeId: ch, code: smsCode });
check(r.status === 400 || smsCode === codeFor(mailB, LOGIN), "…the texted code no longer works");
r = await call("POST", "/api/auth/login/verify", { challengeId: ch, code: codeFor(mailB, LOGIN), trustDevice: true });
check(r.status === 200 && r.data.deviceToken, "…the emailed one does", r);
const deviceB = r.data.deviceToken as string;

// ─── Forgot password by email ─────────────────────────────────────────────
r = await call("POST", "/api/auth/forgot-password", { login: `nobody${n}@test.yanabuy.com` });
check(r.status === 200 && r.data.ok, "forgot password for an unknown email looks the same as a real one");
r = await call("POST", "/api/auth/forgot-password", { login: mailB });
check(r.status === 200 && codeFor(mailB, RESET), "forgot password by email: the code is emailed");
check(!codeFor(phoneB, RESET), "…and not texted");
r = await call("POST", "/api/auth/reset-password", { login: mailB, code: codeFor(mailB, RESET), password: "brandnew123" });
check(r.status === 200 && r.data.accessToken, "the code sets a new password");
r = await call("POST", "/api/auth/login", { login: mailB, password: "brandnew123", deviceToken: deviceB });
check(r.data.needsCode, "a new password means trusted devices need a code again");

// ─── Unconfirmed email + phone typed: the code goes to the phone ───────────
r = await call("POST", "/api/auth/register", { fullName: "Both Typed", phone: `076${n}`, email: `both${n}@test.yanabuy.com`, password: "password123" });
check(r.status === 201 && !codeFor(`+23176${n}`, PHONE) && !codeFor(`both${n}@test.yanabuy.com`, EMAIL), "signing up with both: no codes sent");
r = await call("POST", "/api/auth/login", { login: `both${n}@test.yanabuy.com`, password: "password123" });
check(r.data.needsCode && r.data.channels.join() === "email", "an unconfirmed phone isn't offered when logging in by email", r.data);

// ─── Claiming an old-store account needs a code ───────────────────────────
const oldPhone = `+23186${n}`;
const [old] = await db
  .insert(users)
  .values({ fullName: "Old Shopper", phone: oldPhone, passwordHash: "!", role: "buyer", unclaimed: true, importedFrom: "shopify" })
  .returning();
r = await call("POST", "/api/auth/register", { fullName: "Old Shopper New", phone: `086${n}`, password: "password123" });
check(r.status === 202 && r.data.needsCode && r.data.purpose === "claim" && r.data.channel === "sms" && !r.data.accessToken, "signing up with an old-store number asks for a code first", r.data);
const claimCh = r.data.challengeId as string;
let [still] = await db.select().from(users).where(eq(users.id, old.id));
check(still.unclaimed && still.fullName === "Old Shopper", "…nothing changes until the code is entered");
r = await call("POST", "/api/auth/login/verify", { challengeId: claimCh, code: codeFor(oldPhone, LOGIN) });
check(r.status === 200 && r.data.welcomeBack && r.data.user.id === old.id && r.data.user.phoneVerified, "the code claims the account (welcome back)", r.data);
[still] = await db.select().from(users).where(eq(users.id, old.id));
check(!still.unclaimed && still.fullName === "Old Shopper New", "…with the new name and password");
r = await call("POST", "/api/auth/login", { phone: `086${n}`, password: "password123" });
check(r.data.needsCode, "…and they can log in (with a code) afterwards");

// ─── Admin sees phone-less accounts fine ──────────────────────────────────
r = await call("GET", `/api/admin/users?q=${encodeURIComponent(mailB)}`, undefined, admin);
check(r.status === 200, "admin people list still works with email-only accounts", r.data);

console.log(`\n${passed} login checks passed`);
await pool.end();
await wait(0);
