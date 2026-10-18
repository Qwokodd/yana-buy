/**
 * End-to-end check of the phase 1 (accounts) API against a running server.
 *   npx tsx src/scripts/smoke-phase1.ts
 * Uses throwaway phone numbers each run.
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.API ?? "http://localhost:4000";
let passed = 0;

function check(cond: unknown, label: string) {
  if (!cond) {
    console.error(`❌ ${label}`);
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

const n = String(Date.now()).slice(-7);
const buyerPhone = `088${n}`; // 10-digit local format
const pw = "buyerpass123";

// Register & login
let r = await call("POST", "/api/auth/register", { fullName: "Test Buyer", phone: `0${buyerPhone.slice(1)}`.replace(/^00/, "0"), email: `${crypto.randomUUID().slice(0, 12)}@test.yanabuy.com`, password: pw });
check(r.status === 201, "register a buyer");
check(r.data.user.phone === `+231${buyerPhone.slice(1)}`, `phone stored as +231… (${r.data.user.phone})`);
check(r.data.user.role === "buyer", "new accounts are buyers");
check(!("passwordHash" in r.data.user), "password hash never returned");
let buyer = { access: r.data.accessToken as string, refresh: r.data.refreshToken as string, id: r.data.user.id as string };

r = await call("POST", "/api/auth/register", { fullName: "Dup", phone: `+231 ${buyerPhone.slice(1)}`, email: `${crypto.randomUUID().slice(0, 12)}@test.yanabuy.com`, password: pw });
check(r.status === 409, "same phone in another format is refused");

r = await call("POST", "/api/auth/register", { fullName: "X", phone: "12", email: `${crypto.randomUUID().slice(0, 12)}@test.yanabuy.com`, password: "short" });
check(r.status === 400 && r.data.fields?.phone && r.data.fields?.password, "bad form gets per-field messages");

r = await call("POST", "/api/auth/login", { phone: buyerPhone, password: "wrongpass" });
check(r.status === 401, "wrong password refused");

r = await call("POST", "/api/auth/login", { phone: `${buyerPhone.slice(1)}`, password: pw });
check(r.status === 200, "login with bare number works");
buyer = { ...buyer, access: r.data.accessToken, refresh: r.data.refreshToken };

// Profile
r = await call("GET", "/api/me", undefined, buyer.access);
check(r.status === 200 && r.data.user.fullName === "Test Buyer", "GET /api/me");

const form = new FormData();
form.append("images", new Blob([fs.readFileSync(path.resolve("/home/claude/tests/avatar.png"))], { type: "image/png" }), "a.png");
r = await call("POST", "/api/uploads", form, buyer.access);
check(r.status === 201 && r.data.urls?.[0]?.includes("/uploads/"), "upload a profile photo");
const avatarUrl = r.data.urls[0];
const img = await fetch(avatarUrl);
check(img.status === 200 && img.headers.get("cross-origin-resource-policy") === "cross-origin", "uploaded photo is served to other apps");

const bad = new FormData();
bad.append("images", new Blob(["<svg></svg>"], { type: "image/svg+xml" }), "x.svg");
r = await call("POST", "/api/uploads", bad, buyer.access);
check(r.status === 400, "SVG uploads refused");

r = await call("POST", "/api/uploads", form);
check(r.status === 401, "uploads need login");

r = await call("PATCH", "/api/me", { fullName: "Test Buyer Two", city: "Monrovia", avatarUrl}, buyer.access);
check(r.status === 200 && r.data.user.avatarUrl === avatarUrl && r.data.user.city === "Monrovia", "update name, city and photo");

r = await call("PATCH", "/api/me", { role: "admin" }, buyer.access);
check(r.status === 400, "can't make yourself admin through the profile");

r = await call("POST", "/api/me/password", { currentPassword: "nope", newPassword: "newbuyerpass1" }, buyer.access);
check(r.status === 400, "password change needs the current password");
r = await call("POST", "/api/me/password", { currentPassword: pw, newPassword: "newbuyerpass1" }, buyer.access);
check(r.status === 204, "password changed");

// Refresh rotation
r = await call("POST", "/api/auth/refresh", { refreshToken: buyer.refresh });
check(r.status === 200, "refresh token swaps for a new one");
const oldRefresh = buyer.refresh;
buyer = { ...buyer, access: r.data.accessToken, refresh: r.data.refreshToken };
r = await call("POST", "/api/auth/refresh", { refreshToken: oldRefresh });
check(r.status === 401, "an already-used refresh token is refused");

// Admin
r = await call("GET", "/api/admin/stats", undefined, buyer.access);
check(r.status === 403, "buyers can't open admin");

r = await call("POST", "/api/auth/login", { phone: "0770000001", password: "adminpass123" });
check(r.status === 200 && r.data.user.role === "admin", "admin logs in");
const admin = r.data.accessToken as string;
const adminId = r.data.user.id as string;

r = await call("GET", "/api/admin/stats", undefined, admin);
check(r.status === 200 && r.data.users.buyer >= 1 && r.data.users.admin >= 1, "admin stats");

r = await call("GET", `/api/admin/users?q=${buyerPhone}`, undefined, admin);
check(r.status === 200 && r.data.items.some((u: any) => u.id === buyer.id), "admin finds buyer by typed phone number");
r = await call("GET", "/api/admin/users?q=Buyer%20Two", undefined, admin);
check(r.data.items.some((u: any) => u.id === buyer.id), "admin finds buyer by name");

r = await call("POST", `/api/admin/users/${buyer.id}/block`, { reason: "x" }, admin);
check(r.status === 400, "block needs a reason");
r = await call("POST", `/api/admin/users/${buyer.id}/block`, { reason: "Fake orders" }, admin);
check(r.status === 200 && r.data.user.status === "blocked", "admin blocks the buyer");

r = await call("GET", "/api/me", undefined, buyer.access);
check(r.status === 403 && r.data.error.includes("Fake orders"), "blocked buyer is stopped right away, with the reason");
r = await call("POST", "/api/auth/refresh", { refreshToken: buyer.refresh });
check(r.status === 401, "blocked buyer's session can't be renewed");
r = await call("POST", "/api/auth/login", { phone: buyerPhone, password: "newbuyerpass1" });
check(r.status === 403 && r.data.error.includes("Fake orders"), "blocked buyer can't log in and sees why");

r = await call("POST", `/api/admin/users/${buyer.id}/unblock`, undefined, admin);
check(r.status === 200 && r.data.user.status === "active", "admin unblocks");
r = await call("POST", "/api/auth/login", { phone: buyerPhone, password: "newbuyerpass1" });
check(r.status === 200, "unblocked buyer can log in again");

r = await call("PATCH", `/api/admin/users/${buyer.id}/role`, { role: "rider" }, admin);
check(r.status === 200 && r.data.user.role === "rider", "admin changes a role");
r = await call("PATCH", `/api/admin/users/${adminId}/role`, { role: "buyer" }, admin);
check(r.status === 400, "admin can't demote themselves");
r = await call("POST", `/api/admin/users/${adminId}/block`, { reason: "testing self" }, admin);
check(r.status === 400, "admin can't block themselves");
r = await call("GET", "/api/admin/users/not-a-uuid", undefined, admin);
check(r.status === 404, "unknown user id is a clean 404");

r = await call("GET", "/api/admin/audit-log", undefined, admin);
const actions = r.data.items.map((e: any) => e.action);
check(actions.includes("user.block") && actions.includes("user.unblock") && actions.includes("user.role_change"), "every admin action is in the audit log");

// Logout
r = await call("POST", "/api/auth/login", { phone: buyerPhone, password: "newbuyerpass1" });
const s = r.data.refreshToken;
r = await call("POST", "/api/auth/logout", { refreshToken: s });
check(r.status === 204, "logout");
r = await call("POST", "/api/auth/refresh", { refreshToken: s });
check(r.status === 401, "logged-out session can't be renewed");

console.log(`\n🎉 All ${passed} checks passed`);
