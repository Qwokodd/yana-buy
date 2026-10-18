/**
 * End-to-end check of the phase 2 API (shops, ID review, categories,
 * banners & ads, branding) against a running server.
 *   npx tsx src/scripts/smoke-phase2.ts
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

/** A tiny valid PNG, so the test needs no image files. */
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
async function newUser(prefix: string, name: string) {
  const r = await call("POST", "/api/auth/register", { fullName: name, phone: `0${prefix}${n}`, email: `${crypto.randomUUID().slice(0, 12)}@test.yanabuy.com`, password: "sellerpass1" });
  if (r.status !== 201) throw new Error(`register failed ${JSON.stringify(r.data)}`);
  return { token: r.data.accessToken as string, id: r.data.user.id as string };
}

// ─── Public, no login ──────────────────────────────────────────────────────
let r = await call("GET", "/api/public/branding");
check(r.status === 200 && r.data.branding.appName && r.data.branding.colors.primary, "branding is public");
r = await call("GET", "/api/public/categories?kind=goods");
check(r.status === 200 && r.data.items.length > 0 && r.data.items.every((c: any) => c.kind === "goods"), "starter goods categories are there");
r = await call("GET", "/api/public/banners?platform=web&mode=goods");
check(r.status === 200 && Array.isArray(r.data.items), "banners are public");
r = await call("GET", "/api/public/banners");
check(r.status === 400, "banners need a platform");

// ─── Private uploads ───────────────────────────────────────────────────────
const seller = await newUser("88", "Kebbeh Seller");
r = await call("POST", "/api/uploads/private", photos(3));
check(r.status === 401, "private upload needs login");
r = await call("POST", "/api/uploads/private", photos(3), seller.token);
check(r.status === 201 && r.data.files.length === 3 && r.data.files[0].key && r.data.files[0].url, "upload ID front, back and selfie privately");
const [front, back, selfie] = r.data.files as { key: string; url: string }[];

let res = await fetch(front.url);
check(res.status === 200 && res.headers.get("content-type")?.startsWith("image/"), "signed link shows the photo");
res = await fetch(front.url.replace(/sig=[^&]+/, "sig=forged"));
check(res.status === 403, "a forged link is refused");
res = await fetch(front.url.replace(/exp=\d+/, `exp=${Math.floor(Date.now() / 1000) - 10}`));
check(res.status === 403, "an expired link is refused");
res = await fetch(`${BASE}/uploads/${front.key}`);
check(res.status === 404, "ID photos are not in the public uploads folder");

r = await call("POST", "/api/uploads", photos(1), seller.token);
const logoUrl = r.data.urls[0];

// ─── Applying ──────────────────────────────────────────────────────────────
r = await call("GET", "/api/shop/mine", undefined, seller.token);
check(r.status === 200 && r.data.shop === null, "no shop yet");

const application = {
  kind: "restaurant",
  name: "Kebbeh's Kitchen",
  description: "Jollof, fufu and palm butter.",
  phone: `088${n}`,
  city: "Monrovia",
  address: "Carey Street, near the market",
  logoUrl,
  idType: "national_id",
  idFrontKey: front.key,
  idBackKey: back.key,
  selfieKey: selfie.key,
};

r = await call("POST", "/api/shop/apply", { ...application, name: "", idBackKey: null, selfieKey: "nope.jpg" }, seller.token);
check(r.status === 400 && r.data.fields.name && r.data.fields.idBackKey && r.data.fields.selfieKey, "bad application gets per-field messages", r.data);

r = await call("POST", "/api/shop/apply", { ...application, idType: "passport", idBackKey: null, extra: 1 }, seller.token);
check(r.status === 400, "unknown fields are refused");

r = await call("POST", "/api/shop/apply", application, seller.token);
check(r.status === 201 && r.data.shop.status === "pending" && r.data.shop.slug.startsWith("kebbehs-kitchen"), "application sent — waiting for review", r.data);
const shopId = r.data.shop.id as string;
check(r.data.shop.documents.selfieUrl.includes("/private-files/"), "owner sees their own ID photos through private links");
check(!("idFrontKey" in r.data.shop), "storage keys are not sent back");

r = await call("PATCH", "/api/shop/mine", { name: "Too early" }, seller.token);
check(r.status === 400, "can't edit the shop before approval");

r = await call("GET", "/api/me", undefined, seller.token);
check(r.data.user.role === "buyer", "still a buyer while waiting");

// ─── Admin review ──────────────────────────────────────────────────────────
r = await call("POST", "/api/auth/login", { phone: "0770000001", password: "adminpass123" });
check(r.status === 200, "admin logs in");
const admin = r.data.accessToken as string;

r = await call("GET", "/api/admin/shops?status=pending", undefined, seller.token);
check(r.status === 403, "sellers can't open the review queue");

r = await call("GET", "/api/admin/stats", undefined, admin);
check(r.data.shops.pending >= 1, "overview counts shops waiting");

r = await call("GET", "/api/admin/shops?status=pending", undefined, admin);
check(r.data.items.some((s: any) => s.id === shopId) && !r.data.items[0].documents, "queue lists it (no ID photos in the list)");

r = await call("GET", `/api/admin/shops?q=${encodeURIComponent("kebbeh")}`, undefined, admin);
check(r.data.items.some((s: any) => s.id === shopId), "admin finds the shop by name");
r = await call("GET", `/api/admin/shops?q=088${n}`, undefined, admin);
check(r.data.items.some((s: any) => s.id === shopId), "admin finds the shop by phone");

r = await call("GET", `/api/admin/shops/${shopId}`, undefined, admin);
check(r.status === 200 && r.data.shop.documents.idFrontUrl && r.data.shop.owner.fullName === "Kebbeh Seller", "admin opens the ID and selfie");
res = await fetch(r.data.shop.documents.selfieUrl);
check(res.status === 200, "admin's selfie link works");

r = await call("POST", `/api/admin/shops/${shopId}/reject`, { reason: "" }, admin);
check(r.status === 400 && r.data.fields.reason, "rejecting needs a reason");
r = await call("POST", `/api/admin/shops/${shopId}/reject`, { reason: "The selfie is blurry — please retake it" }, admin);
check(r.status === 200 && r.data.shop.status === "rejected", "admin asks for changes");

r = await call("GET", "/api/shop/mine", undefined, seller.token);
check(r.data.shop.status === "rejected" && r.data.shop.statusReason.includes("blurry"), "owner sees the reason");

r = await call("POST", `/api/admin/shops/${shopId}/approve`, undefined, admin);
check(r.status === 400, "can't approve until it's sent again");

r = await call("POST", "/api/uploads/private", photos(1), seller.token);
r = await call("POST", "/api/shop/apply", { ...application, selfieKey: r.data.files[0].key }, seller.token);
check(r.status === 200 && r.data.shop.status === "pending" && r.data.shop.statusReason === null && r.data.shop.id === shopId, "owner fixes it and sends again");

r = await call("POST", `/api/admin/shops/${shopId}/approve`, undefined, admin);
check(r.status === 200 && r.data.shop.status === "approved" && r.data.shop.reviewedBy?.fullName, "admin approves");

r = await call("GET", "/api/me", undefined, seller.token);
check(r.data.user.role === "vendor", "owner is now a seller");

r = await call("POST", "/api/shop/apply", application, seller.token);
check(r.status === 400, "an approved shop can't be re-applied");

r = await call("PATCH", "/api/shop/mine", { description: "Best palm butter in Sinkor", city: "Sinkor" }, seller.token);
check(r.status === 200 && r.data.shop.city === "Sinkor", "approved owner edits shop details");

r = await call("POST", `/api/admin/shops/${shopId}/suspend`, { reason: "Customer complaints" }, admin);
check(r.status === 200 && r.data.shop.status === "suspended", "admin suspends");
r = await call("PATCH", "/api/shop/mine", { city: "Paynesville" }, seller.token);
check(r.status === 400, "suspended shop can't be edited");
r = await call("POST", "/api/shop/apply", application, seller.token);
check(r.status === 403 && r.data.error.includes("Customer complaints"), "suspended owner sees why");
r = await call("POST", `/api/admin/shops/${shopId}/reinstate`, undefined, admin);
check(r.status === 200 && r.data.shop.status === "approved", "admin reinstates");

const other = await newUser("77", "Second Seller");
r = await call("POST", "/api/uploads/private", photos(2), other.token);
r = await call(
  "POST",
  "/api/shop/apply",
  { ...application, kind: "store", idType: "passport", idFrontKey: r.data.files[0].key, idBackKey: null, selfieKey: r.data.files[1].key, phone: `077${n}` },
  other.token
);
check(r.status === 201 && r.data.shop.slug !== "kebbehs-kitchen" && r.data.shop.slug.startsWith("kebbehs-kitchen"), "same name gets its own web address; passport needs no back photo", r.data.shop?.slug);

// ─── Categories ────────────────────────────────────────────────────────────
r = await call("POST", "/api/uploads", photos(1), admin);
const iconUrl = r.data.urls[0];
const catName = `Test Toys ${n}`;
r = await call("POST", "/api/admin/categories", { kind: "goods", name: catName, iconUrl }, admin);
check(r.status === 201 && r.data.category.iconUrl === iconUrl, "admin adds a category with an icon");
const catId = r.data.category.id;
r = await call("POST", "/api/admin/categories", { kind: "goods", name: catName.toUpperCase() }, admin);
check(r.status === 409, "no duplicate category names");
r = await call("POST", "/api/admin/categories", { kind: "food", name: catName }, admin);
check(r.status === 201, "same name is fine on the food side");
const foodCatId = r.data.category.id;

r = await call("PATCH", `/api/admin/categories/${catId}`, { visible: false }, admin);
check(r.data.category.visible === false, "admin hides a category");
r = await call("GET", "/api/public/categories?kind=goods");
check(!r.data.items.some((c: any) => c.id === catId), "hidden category is gone from the shop");

r = await call("GET", "/api/admin/categories", undefined, admin);
const goodsIds = r.data.items.filter((c: any) => c.kind === "goods").map((c: any) => c.id);
const reordered = [catId, ...goodsIds.filter((id: string) => id !== catId)];
r = await call("POST", "/api/admin/categories/reorder", { ids: reordered }, admin);
check(r.data.items.find((c: any) => c.id === catId).sortOrder === 0, "admin reorders categories");

r = await call("DELETE", `/api/admin/categories/${catId}`, undefined, admin);
check(r.status === 204, "admin deletes a category");
await call("DELETE", `/api/admin/categories/${foodCatId}`, undefined, admin);
r = await call("POST", "/api/admin/categories", { kind: "goods", name: "X" }, seller.token);
check(r.status === 403, "sellers can't touch categories");

// ─── Banners & ads ─────────────────────────────────────────────────────────
r = await call("POST", "/api/uploads", photos(1), admin);
const imageUrl = r.data.urls[0];
r = await call("POST", "/api/admin/banners", { kind: "ad", title: "", imageUrl: "x" }, admin);
check(r.status === 400 && r.data.fields.title && r.data.fields.imageUrl, "banner form checks fields", r.data);
r = await call("POST", "/api/admin/banners", { kind: "ad", title: "Big sale", imageUrl }, admin);
check(r.status === 400 && r.data.fields.advertiser, "ads must say who they're for");

r = await call(
  "POST",
  "/api/admin/banners",
  { kind: "banner", title: `Rainy season deals ${n}`, subtitle: "Umbrellas and boots", imageUrl, linkUrl: "/search?q=boots", buttonLabel: "Shop now", platform: "web", mode: "goods" },
  admin
);
check(r.status === 201 && r.data.banner.state === "live", "admin creates a live banner");
const webBanner = r.data.banner.id;

const tomorrow = new Date(Date.now() + 86400_000).toISOString();
const nextWeek = new Date(Date.now() + 7 * 86400_000).toISOString();
r = await call("POST", "/api/admin/banners", { kind: "ad", advertiser: "Lonestar Cell", title: `Data bundles ${n}`, imageUrl, placement: "strip", startsAt: tomorrow, endsAt: nextWeek }, admin);
check(r.status === 201 && r.data.banner.state === "scheduled", "admin schedules an ad for tomorrow");
const scheduledAd = r.data.banner.id;
r = await call("POST", "/api/admin/banners", { title: "Bad dates", imageUrl, startsAt: nextWeek, endsAt: tomorrow }, admin);
check(r.status === 400 && r.data.fields.endsAt, "end must be after start");
r = await call("PATCH", `/api/admin/banners/${scheduledAd}`, { endsAt: new Date(Date.now() + 3600_000).toISOString() }, admin);
check(r.status === 400, "edits are checked against saved dates too");

r = await call("GET", "/api/public/banners?platform=web&mode=goods");
check(r.data.items.some((b: any) => b.id === webBanner) && !r.data.items.some((b: any) => b.id === scheduledAd), "website shows the live banner, not the scheduled ad");
r = await call("GET", "/api/public/banners?platform=app&mode=goods");
check(!r.data.items.some((b: any) => b.id === webBanner), "web-only banner stays off the phone app");
r = await call("GET", "/api/public/banners?platform=web&mode=food");
check(!r.data.items.some((b: any) => b.id === webBanner), "goods banner stays off the food side");

r = await call("PATCH", `/api/admin/banners/${webBanner}`, { active: false }, admin);
check(r.data.banner.state === "off", "admin switches a banner off");
r = await call("GET", "/api/public/banners?platform=web&mode=goods");
check(!r.data.items.some((b: any) => b.id === webBanner), "switched-off banner disappears");
await call("PATCH", `/api/admin/banners/${webBanner}`, { active: true }, admin);

r = await call("POST", `/api/public/banners/${webBanner}/click`);
check(r.status === 204, "banner taps are counted");
r = await call("GET", "/api/admin/banners", undefined, admin);
check(r.data.items.find((b: any) => b.id === webBanner).clicks === 1, "admin sees the tap count");

r = await call("DELETE", `/api/admin/banners/${webBanner}`, undefined, admin);
await call("DELETE", `/api/admin/banners/${scheduledAd}`, undefined, admin);
check(r.status === 204, "admin deletes a banner");

// ─── Branding ──────────────────────────────────────────────────────────────
r = await call("GET", "/api/admin/branding", undefined, admin);
const original = r.data.branding;
r = await call("PUT", "/api/admin/branding", { ...original, colors: { ...original.colors, primary: "purple" } }, admin);
check(r.status === 400 && r.data.fields["colors.primary"], "colours must be real colour codes", r.data);
const { updatedAt: _u, ...editable } = original;
r = await call("PUT", "/api/admin/branding", { ...editable, appName: "YanaBuy Test", logoUrl: iconUrl, colors: { ...original.colors, primary: "#1f4c84" } }, admin);
check(r.status === 200 && r.data.branding.colors.primary === "#1F4C84", "admin changes the name, logo and colours");
r = await call("GET", "/api/public/branding");
check(r.data.branding.appName === "YanaBuy Test" && r.data.branding.logoUrl === iconUrl, "the change is live for everyone");
r = await call("PUT", "/api/admin/branding", editable, admin);
check(r.status === 200 && r.data.branding.appName === original.appName, "admin puts the branding back");
r = await call("PUT", "/api/admin/branding", editable, seller.token);
check(r.status === 403, "sellers can't change branding");

r = await call("GET", "/api/admin/audit-log", undefined, admin);
const actions = new Set(r.data.items.map((e: any) => e.action));
check(["shop.approve", "shop.reject", "shop.suspend", "category.create", "banner.create", "branding.update"].every((a) => actions.has(a)), "every admin change is in the audit log");

console.log(`\n${passed} checks passed`);
