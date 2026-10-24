/**
 * Checks rider sign-up against a running server: npx tsx src/scripts/smoke-riders.ts
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
const login = async (phone: string) => (await call("POST", "/api/auth/login", { phone, password: "password123" })).data.accessToken as string;

const rider = await person("66", "Momo Kamara");
const up1 = await call("POST", "/api/uploads/private", photos(2), rider.token);
const up2 = await call("POST", "/api/uploads/private", photos(2), rider.token);
const [front, back, selfie, licence] = [...up1.data.files, ...up2.data.files].map((f: any) => f.key);
// No ID photos any more: riders confirm their email instead.
const base = { vehicle: "motorbike", plateNumber: "MC-4521", city: "Monrovia", areas: "Sinkor, Congo Town, Paynesville", emergencyName: "Ma Musu", emergencyPhone: "0886123456" };
void back;
void licence;

r = await call("GET", "/api/rider-application", undefined, rider.token);
check(r.status === 200 && r.data.application === null, "no application yet");
r = await call("POST", "/api/rider-application", { ...base, plateNumber: "" }, rider.token);
check(r.status === 400 && r.data.fields?.plateNumber && !r.data.fields?.licenseKey, "a motorbike rider needs a plate number (no licence photo)");
r = await call("POST", "/api/rider-application", { ...base, emergencyPhone: "12" }, rider.token);
check(r.status === 400 && r.data.fields?.emergencyPhone, "the emergency contact needs a real number");
r = await call("POST", "/api/rider-application", { ...base, city: "" }, rider.token);
check(r.status === 400 && r.data.fields?.city, "the city is needed");
r = await call("POST", "/api/rider-application", { ...base, emergencyPhone: "123" }, rider.token);
check(r.status === 400 && r.data.fields?.emergencyPhone, "the emergency phone must be a Liberian number");
r = await call("POST", "/api/rider-application", base, rider.token);
check(r.status === 201 && r.data.application.status === "pending" && r.data.application.documents === null, "a buyer applies to be a rider with no ID photos");
const appId = r.data.application.id as string;
r = await call("POST", "/api/rider-application", base, rider.token);
check(r.status === 200, "re-sending updates the same application");

r = await call("GET", "/api/rider/orders", undefined, rider.token);
check(r.status === 403, "not a rider until approved");
r = await call("POST", "/api/shop/apply", { kind: "store", name: "Side hustle", phone: rider.phone, city: "Monrovia", address: "Broad St", idType: "passport", idFrontKey: front, selfieKey: selfie }, rider.token);
check(r.status === 403, "a rider applicant can't also open a shop on the same account");

r = await call("GET", "/api/admin/stats", undefined, admin);
check(r.data.ridersPending >= 1, "admin overview counts riders waiting");
r = await call("GET", "/api/admin/rider-applications", undefined, admin);
check(r.data.items.some((a: any) => a.id === appId && a.user.fullName === "Momo Kamara"), "admin sees the application in the queue");
r = await call("GET", `/api/admin/rider-applications/${appId}`, undefined, rider.token);
check(r.status === 403, "only admins can see applications");
r = await call("POST", `/api/admin/rider-applications/${appId}/reject`, { reason: "x" }, admin);
check(r.status === 400, "sending back needs a reason");
r = await call("POST", `/api/admin/rider-applications/${appId}/reject`, { reason: "The licence photo is blurry" }, admin);
check(r.data.application.status === "rejected", "admin sends it back");
r = await call("GET", "/api/rider-application", undefined, rider.token);
check(r.data.application.statusReason === "The licence photo is blurry" && r.data.application.areas === base.areas, "the applicant sees why, and keeps their details");
r = await call("POST", "/api/rider-application", { ...base }, rider.token);
check(r.data.application.status === "pending", "they fix it and send it again");
r = await call("POST", `/api/admin/rider-applications/${appId}/approve`, undefined, admin);
check(r.data.application.status === "approved" && r.data.application.user.role === "rider", "admin approves — the account becomes a rider");
r = await call("GET", "/api/rider/orders", undefined, rider.token);
check(r.status === 200, "the rider can now see their deliveries");
r = await call("GET", "/api/admin/riders", undefined, admin);
check(r.data.items.some((x: any) => x.id === rider.id), "they appear in Assign riders");
r = await call("POST", "/api/rider-application", base, rider.token);
check(r.status === 400, "an approved rider can't apply again");

const seller = await person("88", "Seller Person");
const sup = await call("POST", "/api/uploads/private", photos(2), seller.token);
await call("POST", "/api/shop/apply", { kind: "store", name: `Rider test shop ${n}`, phone: seller.phone, city: "Monrovia", address: "Broad St", idType: "passport", idFrontKey: sup.data.files[0].key, selfieKey: sup.data.files[1].key }, seller.token);
r = await call("POST", "/api/rider-application", { ...base, idFrontKey: sup.data.files[0].key, selfieKey: sup.data.files[1].key, idBackKey: null, idType: "passport", licenseKey: null, vehicle: "on_foot", plateNumber: null }, seller.token);
check(r.status === 403, "someone with a shop application can't also be a rider");

const walker = await person("44", "Foot Rider");
const wup = await call("POST", "/api/uploads/private", photos(2), walker.token);
r = await call("POST", "/api/rider-application", { vehicle: "on_foot", city: "Monrovia", areas: "Waterside market", idType: "passport", idFrontKey: wup.data.files[0].key, selfieKey: wup.data.files[1].key, emergencyName: "Mary", emergencyPhone: "0886123457", plateNumber: "IGNORED" }, walker.token);
check(r.status === 201 && r.data.application.plateNumber === null && r.data.application.documents === null, "on-foot riders need no plate (old apps sending ID keys are ignored)");

r = await call("POST", `/api/admin/rider-applications/${appId}/suspend`, { reason: "Repeated late deliveries" }, admin);
check(r.data.application.status === "suspended" && r.data.application.user.role === "buyer", "admin suspends the rider — back to a buyer account");
r = await call("GET", "/api/rider/orders", undefined, await login(rider.phone));
check(r.status === 403, "a suspended rider can't see deliveries");
r = await call("POST", "/api/rider-application", base, rider.token);
check(r.status === 403 && /suspended/.test(r.data.error), "a suspended rider can't just apply again");
r = await call("POST", `/api/admin/rider-applications/${appId}/reinstate`, undefined, admin);
check(r.data.application.status === "approved" && r.data.application.user.role === "rider", "admin reinstates the rider");

r = await call("GET", "/api/admin/audit-log", undefined, admin);
const acts = r.data.items.map((e: any) => e.action);
check(["rider.approve", "rider.reject", "rider.suspend", "rider.reinstate"].every((a) => acts.includes(a)), "rider decisions are in the audit log");

console.log(`\n${passed} checks passed`);
