import express from "express";
import cors from "cors";
import multer from "multer";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { CATEGORIES, USERS, STORES, PRODUCTS, ORDERS } from "./seed.js";
import { RESTAURANTS, MENU_ITEMS, FOOD_ORDERS, SOURCING_REQUESTS } from "./seed-food.js";
import { HERO_SLIDES } from "./seed-hero.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, "db.json");
const UPLOADS_DIR = process.env.UPLOADS_DIR || join(__dirname, "uploads");
const PORT = process.env.PORT || 4000;

if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

// ---- Vendor commission ----------------------------------------------------
// Yana Buy takes a cut of every sale (marketplace orders + food orders).
// MTN MoMo / Orange Money don't support splitting a single payment, so the
// full amount lands in Yana Buy's own merchant account first, and vendors
// are credited their share (sale minus commission) into an in-app wallet
// here on the server. Vendors cash that out via payout requests, which an
// admin marks paid after actually sending the money. Delivery fees are
// never commissioned -- only the value of goods/food sold.
const COMMISSION_RATE = 0.10;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function getWallet(vendorId) {
  if (!db.vendorWallets[vendorId]) {
    db.vendorWallets[vendorId] = {
      vendorId,
      balance: 0,
      totalSales: 0,
      totalCommission: 0,
      totalEarned: 0,
      updatedAt: new Date().toISOString(),
    };
  }
  return db.vendorWallets[vendorId];
}

// Credits a vendor's wallet for one sale and records a ledger entry.
// Returns the commission/earnings split so callers can stamp it onto the order.
function creditVendor(vendorId, saleAmount, orderId, orderType) {
  if (!vendorId || !saleAmount) return { commission: 0, earnings: 0 };
  const commission = round2(saleAmount * COMMISSION_RATE);
  const earnings = round2(saleAmount - commission);

  const wallet = getWallet(vendorId);
  wallet.balance = round2(wallet.balance + earnings);
  wallet.totalSales = round2(wallet.totalSales + saleAmount);
  wallet.totalCommission = round2(wallet.totalCommission + commission);
  wallet.totalEarned = round2(wallet.totalEarned + earnings);
  wallet.updatedAt = new Date().toISOString();

  db.walletLedger.unshift({
    id: randomUUID(),
    vendorId,
    orderId,
    orderType, // "marketplace" | "food"
    saleAmount,
    commissionRate: COMMISSION_RATE,
    commission,
    earnings,
    createdAt: new Date().toISOString(),
  });

  return { commission, earnings };
}

// Marketplace orders can contain items from several stores/vendors at once,
// so split the order's items by storeId, commission each vendor's slice of
// the subtotal (never the delivery fee), and stamp the breakdown onto the
// order for display in both apps.
function applyOrderCommission(order) {
  const byStore = {};
  for (const item of order.items || []) {
    const key = item.storeId;
    if (!key) continue;
    byStore[key] = (byStore[key] || 0) + item.price * item.qty;
  }

  const breakdown = [];
  for (const [storeId, saleAmount] of Object.entries(byStore)) {
    const store = db.stores.find((s) => s.id === storeId);
    if (!store) continue;
    const { commission, earnings } = creditVendor(store.ownerId, round2(saleAmount), order.id, "marketplace");
    breakdown.push({ storeId, vendorId: store.ownerId, saleAmount: round2(saleAmount), commission, earnings });
  }
  order.commissionBreakdown = breakdown;
  return order;
}

// Food orders always belong to a single restaurant, so this is a single split.
function applyFoodOrderCommission(order) {
  const restaurant = db.restaurants.find((r) => r.id === order.restaurantId);
  if (!restaurant) return order;
  const { commission, earnings } = creditVendor(restaurant.ownerId, order.subtotal, order.id, "food");
  order.commission = commission;
  order.vendorEarnings = earnings;
  return order;
}

// ---- Simple JSON-file "database" ----------------------------------------
// Single source of truth both apps read from / write to. Whenever it
// changes, every connected client (both apps, every open tab) gets a live
// push over the socket below.

function loadDb() {
  if (existsSync(DB_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(DB_PATH, "utf-8"));
      // backfill any collections added after this db.json was first created
      parsed.restaurants ??= RESTAURANTS;
      parsed.menuItems ??= MENU_ITEMS;
      parsed.foodOrders ??= FOOD_ORDERS;
      parsed.sourcingRequests ??= SOURCING_REQUESTS;
      parsed.vendorWallets ??= {};
      parsed.walletLedger ??= [];
      parsed.payoutRequests ??= [];
      parsed.heroSlides ??= HERO_SLIDES;

      // Self-heal: add any seed user that isn't present yet by id. This
      // only ever ADDS accounts that are missing (e.g. the dedicated
      // restaurant_vendor "chef" demo accounts added after this db.json
      // was first created) — it never touches or overwrites an existing
      // account, so real signups and password changes are untouched.
      const existingUserIds = new Set(parsed.users.map((u) => u.id));
      for (const seedUser of USERS) {
        if (!existingUserIds.has(seedUser.id)) {
          parsed.users.push(seedUser);
        }
      }

      // Self-heal: if menu items exist but reference restaurants that
      // aren't in the restaurants list (e.g. the list was cleared while
      // menu items were kept), the food section shows "no restaurants
      // available" even though there's a full menu ready to serve. Restore
      // any seed restaurant that's still referenced by a menu item.
      const knownIds = new Set(parsed.restaurants.map((r) => r.id));
      const referencedIds = new Set((parsed.menuItems || []).map((m) => m.restaurantId));
      for (const seedRestaurant of RESTAURANTS) {
        if (referencedIds.has(seedRestaurant.id) && !knownIds.has(seedRestaurant.id)) {
          parsed.restaurants.push(seedRestaurant);
        }
      }
      // Migration: the two demo restaurants used to be (incorrectly) owned
      // by the same accounts as the demo shop vendors. Repoint them to the
      // dedicated restaurant_vendor "chef" accounts so the shop vendor
      // dashboard and the Restaurant Portal are cleanly separate logins.
      const legacyOwnerMap = { "user-vendor-1": "user-chef-1", "user-vendor-2": "user-chef-2" };
      for (const restaurant of parsed.restaurants) {
        if (legacyOwnerMap[restaurant.ownerId]) {
          restaurant.ownerId = legacyOwnerMap[restaurant.ownerId];
        }
      }
      // If there are simply no restaurants at all yet, seed the defaults
      // so the food side of the app has something to show out of the box.
      if (parsed.restaurants.length === 0) {
        parsed.restaurants = RESTAURANTS;
      }
      return parsed;
    } catch {
      // fall through to reseed if the file is corrupt
    }
  }
  const seeded = {
    categories: CATEGORIES,
    users: USERS,
    stores: STORES,
    products: PRODUCTS,
    orders: ORDERS,
    restaurants: RESTAURANTS,
    menuItems: MENU_ITEMS,
    foodOrders: FOOD_ORDERS,
    sourcingRequests: SOURCING_REQUESTS,
    vendorWallets: {},
    walletLedger: [],
    payoutRequests: [],
    heroSlides: HERO_SLIDES,
  };
  writeFileSync(DB_PATH, JSON.stringify(seeded, null, 2));
  return seeded;
}

let db = loadDb();

function persist() {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function upsert(list, item) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) list.unshift(item);
  else list[i] = item;
}

function update(list, id, patch) {
  const i = list.findIndex((x) => x.id === id);
  if (i !== -1) list[i] = { ...list[i], ...patch };
  return list[i];
}

function remove(list, id) {
  const i = list.findIndex((x) => x.id === id);
  if (i !== -1) list.splice(i, 1);
}

// ---- HTTP + Socket.io setup ----------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/state", (_req, res) => res.json(db));

// ---- Image uploads --------------------------------------------------------
// Real files saved to disk under /uploads, served back as plain URLs —
// used for product photos, menu item photos, and China-sourcing reference
// photos (up to 5 per listing/request, enforced here and in the UI).
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image files are allowed"));
    cb(null, true);
  },
});

app.post("/api/upload", upload.array("images", 5), (req, res) => {
  const files = req.files || [];
  const urls = files.map((f) => `${process.env.PUBLIC_URL || ""}/uploads/${f.filename}`);
  res.json({ urls });
});

// multer/file errors -> clean JSON instead of an HTML stack trace
app.use((err, _req, res, next) => {
  if (err) return res.status(400).json({ error: err.message });
  next();
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

// event name -> how to apply { list, payload } to db, mutating in place
const handlers = {
  "category:add": (p) => upsert(db.categories, p),
  "category:update": (p) => update(db.categories, p.id, p.patch),
  "category:delete": (p) => remove(db.categories, p.id),

  "store:create": (p) => upsert(db.stores, p),
  "store:update": (p) => update(db.stores, p.id, p.patch),
  "store:delete": (p) => remove(db.stores, p.id),

  "product:add": (p) => upsert(db.products, p),
  "product:update": (p) => update(db.products, p.id, p.patch),
  "product:delete": (p) => remove(db.products, p.id),
  "product:decrementStock": (p) => {
    for (const line of p.items) {
      const prod = db.products.find((x) => x.id === line.productId);
      if (prod) prod.stock = Math.max(0, prod.stock - line.qty);
    }
  },

  "order:create": (p) => upsert(db.orders, applyOrderCommission(p)),
  "order:updateStatus": (p) => update(db.orders, p.id, { status: p.status }),

  "user:add": (p) => upsert(db.users, p),
  "user:update": (p) => update(db.users, p.id, p.patch),

  // ---- China sourcing requests ----
  "sourcing:create": (p) => upsert(db.sourcingRequests, p),
  "sourcing:update": (p) => update(db.sourcingRequests, p.id, p.patch),
  "sourcing:delete": (p) => remove(db.sourcingRequests, p.id),

  // ---- Food ordering ----
  "restaurant:create": (p) => upsert(db.restaurants, p),
  "restaurant:update": (p) => update(db.restaurants, p.id, p.patch),
  "restaurant:delete": (p) => remove(db.restaurants, p.id),

  "menuItem:add": (p) => upsert(db.menuItems, p),
  "menuItem:update": (p) => update(db.menuItems, p.id, p.patch),
  "menuItem:delete": (p) => remove(db.menuItems, p.id),

  "foodOrder:create": (p) => upsert(db.foodOrders, applyFoodOrderCommission(p)),
  "foodOrder:updateStatus": (p) => update(db.foodOrders, p.id, { status: p.status }),

  // ---- Homepage hero slider ----
  "heroSlide:add": (p) => upsert(db.heroSlides, p),
  "heroSlide:update": (p) => update(db.heroSlides, p.id, p.patch),
  "heroSlide:delete": (p) => remove(db.heroSlides, p.id),
  // Replaces the whole ordered list at once, used after drag/up-down
  // reordering in the admin app so every slide's `order` stays in sync.
  "heroSlide:reorder": (p) => {
    db.heroSlides = p.slides;
  },

  // ---- Vendor payouts ----
  // A vendor cashes out their wallet balance. The requested amount is
  // reserved (deducted) immediately so they can't request more than they
  // have; if admin rejects the request, it's refunded back to the wallet.
  "payout:request": (p) => {
    const wallet = getWallet(p.vendorId);
    if (p.amount <= 0 || p.amount > wallet.balance) return;
    wallet.balance = round2(wallet.balance - p.amount);
    wallet.updatedAt = new Date().toISOString();
    db.payoutRequests.unshift({
      id: p.id,
      vendorId: p.vendorId,
      amount: p.amount,
      method: p.method,
      destination: p.destination,
      status: "pending",
      createdAt: p.createdAt,
      processedAt: null,
    });
  },
  "payout:updateStatus": (p) => {
    const req = db.payoutRequests.find((r) => r.id === p.id);
    if (!req || req.status === "paid" || req.status === "rejected") return;
    if (p.status === "rejected") {
      const wallet = getWallet(req.vendorId);
      wallet.balance = round2(wallet.balance + req.amount);
      wallet.updatedAt = new Date().toISOString();
    }
    req.status = p.status;
    req.processedAt = new Date().toISOString();
  },
};

io.on("connection", (socket) => {
  // brand new client (either app, any tab) gets caught up immediately
  socket.emit("state:init", db);

  for (const [event, apply] of Object.entries(handlers)) {
    socket.on(event, (payload) => {
      apply(payload);
      persist();
      if (event === "order:create" || event === "foodOrder:create") {
        // The server just stamped commissionBreakdown/vendorEarnings onto
        // this payload -- send it to EVERYONE including the sender (whose
        // optimistic copy doesn't have those fields yet). upsert-by-id
        // makes re-receiving your own order safe, it just replaces it.
        io.emit(event, payload);
      } else {
        // Broadcast to every OTHER connected client — buy app, admin app,
        // any extra tabs — so they update live. The sender already applied
        // this optimistically, so it's excluded to avoid double-applying.
        socket.broadcast.emit(event, payload);
      }
      // Wallet balances and payout requests are mutated as a side effect
      // inside several handlers above (not part of the payload itself),
      // so push the full current picture to everyone after every event.
      io.emit("wallet:sync", db.vendorWallets);
      io.emit("payout:sync", db.payoutRequests);
    });
  }

  socket.on("disconnect", () => {});
});

httpServer.listen(PORT, () => {
  console.log(`Yana Buy realtime server listening on http://localhost:${PORT}`);
});
