import type { BookingSettings, Country, FeeBreakdown, Fulfilment, PayoutSchedule, ProductOption, ProductVariant, WorkProfile } from "@yanabuy/shared";
import { pgTable, pgEnum, uuid, text, timestamp, jsonb, index, uniqueIndex, integer, boolean, doublePrecision, type AnyPgColumn } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["buyer", "vendor", "rider", "admin"]);
export const userStatus = pgEnum("user_status", ["active", "blocked"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    // Always stored as +231XXXXXXXXX or +1XXXXXXXXXX (see @yanabuy/shared normalizePhone).
    // null = signed up with an email only (a phone can be added later).
    phone: text("phone"),
    /** When the phone was confirmed with a text-message code. null = not confirmed yet. */
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    email: text("email"),
    /** When the email was confirmed with a code. null = not confirmed yet. */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("buyer"),
    status: userStatus("status").notNull().default("active"),
    blockedReason: text("blocked_reason"),
    blockedAt: timestamp("blocked_at", { withTimezone: true }),
    avatarUrl: text("avatar_url"),
    city: text("city"),
    /**
     * Brought over from Shopify and not signed up yet: no usable password.
     * Signing up with the same phone claims the account.
     */
    unclaimed: boolean("unclaimed").notNull().default(false),
    /** "shopify" for imported accounts (customers and placeholder shop owners). */
    importedFrom: text("imported_from"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** Deleted by an admin. Personal details are wiped; the row stays only so past orders still add up. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** Last known spot from the phone or browser (GPS). Riders send it about every 30 s while online. */
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    locatedAt: timestamp("located_at", { withTimezone: true }),
    /** Riders: switched "Online" in the app, so vendors near them can offer deliveries. */
    riderOnline: boolean("rider_online").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_phone_key").on(t.phone),
    uniqueIndex("users_email_key").on(t.email),
    index("users_role_idx").on(t.role),
  ]
);

/** One row per logged-in device. The refresh token itself is never stored, only its hash. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_hash_key").on(t.tokenHash), index("sessions_user_idx").on(t.userId)]
);

/** Every change an admin makes, for accountability. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)]
);



// ─── Phase 2: shops, categories, banners, settings ─────────────────────────

export const shopKind = pgEnum("shop_kind", ["store", "restaurant"]);
export const shopStatus = pgEnum("shop_status", ["pending", "approved", "rejected", "suspended"]);
export const idDocumentType = pgEnum("id_document_type", ["national_id", "passport", "drivers_license", "voter_card"]);

/**
 * A shop (goods & services) or restaurant (food). One per owner.
 * ID photos are private files: only their storage keys are kept here, and
 * they are shown through short-lived signed links (see lib/private-files.ts).
 */
export const shops = pgTable(
  "shops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: shopKind("kind").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    logoUrl: text("logo_url"),
    coverUrl: text("cover_url"),
    phone: text("phone").notNull(),
    city: text("city").notNull(),
    address: text("address").notNull(),
    /** The shop's pin on the map. null = not set yet (the owner's last location is used instead). */
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    /** Where the seller wants their earnings sent (phase 5). */
    payoutMethod: text("payout_method"),
    payoutName: text("payout_name"),
    payoutPhone: text("payout_phone"),
    /** How often the admin pays this shop: daily, weekly, monthly or on_request. */
    payoutSchedule: text("payout_schedule").$type<PayoutSchedule>().notNull().default("weekly"),
    /** Visible reviews across all the shop's products. */
    ratingCount: integer("rating_count").notNull().default(0),
    ratingTotal: integer("rating_total").notNull().default(0),
    status: shopStatus("status").notNull().default("pending"),
    /** Why it was rejected or suspended — shown to the owner. */
    statusReason: text("status_reason"),
    idType: idDocumentType("id_type").notNull(),
    idFrontKey: text("id_front_key").notNull(),
    idBackKey: text("id_back_key"),
    selfieKey: text("selfie_key").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    /** What kind of shop it is (a Goods category for shops, a Food one for restaurants) — for the shop directory. */
    categoryId: uuid("category_id").references((): AnyPgColumn => categories.id, { onDelete: "set null" }),
    /** Opening hours in the owner's words, e.g. "Mon–Sat 8am–8pm". */
    hours: text("hours"),
    /** Table bookings (restaurants) or appointments (services). null = not taking bookings. */
    bookingSettings: jsonb("booking_settings").$type<BookingSettings>(),
    /** Restaurants: buyers can order to eat in at the restaurant (menu price only, paid at the restaurant). */
    eatIn: boolean("eat_in").notNull().default(false),
    /** Restaurants: buyers can order and collect it themselves (menu price only, no delivery fee). */
    pickup: boolean("pickup").notNull().default(false),
    /** Which country the shop sells in ("LR" or "US"). Shoppers only see shops from the country they picked. */
    country: text("country").$type<Country>().notNull().default("LR"),
    /** The work profile: tagline, about, experience, skills, videos… null = not filled in. */
    workProfile: jsonb("work_profile").$type<WorkProfile>(),
    /** "shopify" for shops brought over from the old store (they have no ID photos). */
    importedFrom: text("imported_from"),
    /** The vendor name on Shopify, so a second import finds the same shop. */
    importedKey: text("imported_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("shops_owner_key").on(t.ownerId),
    uniqueIndex("shops_imported_key").on(t.importedKey),
    uniqueIndex("shops_slug_key").on(t.slug),
    index("shops_status_idx").on(t.status),
  ]
);

/** Which side of the app a category belongs to. */
export const catalogKind = pgEnum("catalog_kind", ["goods", "food"]);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: catalogKind("kind").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    iconUrl: text("icon_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    visible: boolean("visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("categories_kind_slug_key").on(t.kind, t.slug)]
);

export const bannerKind = pgEnum("banner_kind", ["banner", "ad"]);
export const bannerPlacement = pgEnum("banner_placement", ["hero", "strip", "promo"]);
export const bannerPlatform = pgEnum("banner_platform", ["all", "web", "app"]);
export const bannerMode = pgEnum("banner_mode", ["all", "goods", "food"]);

/** Banners and paid ads on the website and phone app, made by admins. */
export const banners = pgTable(
  "banners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: bannerKind("kind").notNull().default("banner"),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    imageUrl: text("image_url").notNull(),
    /** A 5–10 second video ad / promo (imageUrl is its cover). */
    videoUrl: text("video_url"),
    linkUrl: text("link_url"),
    buttonLabel: text("button_label"),
    /** For ads: who paid for it. */
    advertiser: text("advertiser"),
    placement: bannerPlacement("placement").notNull().default("hero"),
    platform: bannerPlatform("platform").notNull().default("all"),
    mode: bannerMode("mode").notNull().default("all"),
    /** Only shown to shoppers in this country; null = everywhere. */
    country: text("country").$type<Country>(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("banners_placement_idx").on(t.placement, t.sortOrder)]
);

/** Site-wide settings (branding and so on), one JSON value per key. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
});

// ─── Phase 3: products ─────────────────────────────────────────────────────

/**
 * pending = waiting for an admin; approved = live; rejected = sent back with a
 * reason; removed = taken down by an admin. Sellers can also hide a live product.
 */
export const productStatus = pgEnum("product_status", ["pending", "approved", "rejected", "removed"]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    /** goods for shops, food for restaurants — follows the shop. */
    kind: catalogKind("kind").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Whole cents (USD). */
    price: integer("price").notNull(),
    /** The old price, shown crossed out for a deal. */
    compareAtPrice: integer("compare_at_price"),
    /** Flash sale: when the old price (compareAtPrice) comes back. Null = no end. */
    saleEndsAt: timestamp("sale_ends_at", { withTimezone: true }),
    /** null = the seller doesn't count stock. */
    stock: integer("stock"),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    /** Colour/size choices. Empty = a simple product. When set, price/stock above are worked out from the variants. */
    options: jsonb("options").$type<ProductOption[]>().notNull().default([]),
    variants: jsonb("variants").$type<ProductVariant[]>().notNull().default([]),
    status: productStatus("status").notNull().default("pending"),
    statusReason: text("status_reason"),
    /** Paused by the seller (e.g. sold out today). */
    hidden: boolean("hidden").notNull().default(false),
    /** Picked by an admin for the home page. */
    featured: boolean("featured").notNull().default(false),
    /** Ordered from China for the buyer — takes longer to arrive. */
    shipsFromChina: boolean("ships_from_china").notNull().default(false),
    /** Rough delivery time in days, shown to buyers (mainly for China items). */
    deliveryDays: integer("delivery_days"),
    /** Weight of one, in grams, for weight-based delivery fees. null = use the admin's default item weight. */
    weightGrams: integer("weight_grams"),
    /** A service people book a time for (e.g. a photo shoot), instead of having it delivered. */
    bookable: boolean("bookable").notNull().default(false),
    /** How long one appointment takes, in minutes. */
    durationMinutes: integer("duration_minutes"),
    /** Visible reviews: count and sum of stars (average = total / count). */
    ratingCount: integer("rating_count").notNull().default(0),
    ratingTotal: integer("rating_total").notNull().default(0),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Shopify handle for imported products, so a second import updates instead of duplicating. */
    importedKey: text("imported_key"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_shop_idx").on(t.shopId),
    index("products_status_idx").on(t.status),
    index("products_category_idx").on(t.categoryId),
    uniqueIndex("products_imported_key").on(t.importedKey),
  ]
);

// ─── Phase 4: orders ───────────────────────────────────────────────────────

/**
 * placed → accepted (seller) → ready (packed) → picked_up (rider) → delivered.
 * Any step before delivery can end in cancelled.
 */
export const orderStatus = pgEnum("order_status", ["awaiting_payment", "placed", "accepted", "ready", "picked_up", "delivered", "cancelled"]);
export const paymentMethod = pgEnum("payment_method", ["cod", "mtn_momo", "orange_money", "card"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "failed", "refunded"]);

/** One order per shop. A checkout with items from two shops makes two orders. */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human number shown as YB-10001. */
    number: integer("number").generatedAlwaysAsIdentity({ startWith: 10001 }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id),
    riderId: uuid("rider_id").references(() => users.id, { onDelete: "set null" }),
    kind: catalogKind("kind").notNull(),
    status: orderStatus("status").notNull().default("placed"),
    paymentMethod: paymentMethod("payment_method").notNull().default("cod"),
    paymentStatus: paymentStatus("payment_status").notNull().default("pending"),
    /** All money in whole cents. */
    subtotal: integer("subtotal").notNull(),
    deliveryFee: integer("delivery_fee").notNull(),
    total: integer("total").notNull(),
    deliveryName: text("delivery_name").notNull(),
    deliveryPhone: text("delivery_phone").notNull(),
    deliveryCity: text("delivery_city").notNull(),
    deliveryAddress: text("delivery_address").notNull(),
    /** The delivery area picked at checkout (e.g. "Sinkor – City Hall"), if areas are set up. */
    deliveryArea: text("delivery_area"),
    /** The delivery pin (the buyer's phone/browser location, or a spot they picked on the map). */
    deliveryLat: doublePrecision("delivery_lat"),
    deliveryLng: doublePrecision("delivery_lng"),
    /** Distance pricing: estimated road distance (metres) and order weight (grams) the fee was worked out from. */
    deliveryDistanceM: integer("delivery_distance_m"),
    deliveryWeightG: integer("delivery_weight_g"),
    /** How the delivery fee was worked out (distance pricing only). */
    deliveryFeeBreakdown: jsonb("delivery_fee_breakdown").$type<FeeBreakdown>(),
    /** How the buyer gets it: delivered by a rider, eaten in at the restaurant, or collected by the buyer. */
    fulfilment: text("fulfilment").$type<Fulfilment>().notNull().default("delivery"),
    /** Eat in / pickup: when the buyer says they'll arrive (null = as soon as it's ready). */
    arriveAt: timestamp("arrive_at", { withTimezone: true }),
    /** Eat in: how many people. */
    partySize: integer("party_size"),
    /** Eat in: the table booking this order goes with, if the buyer picked one. */
    bookingId: uuid("booking_id").references((): AnyPgColumn => bookings.id, { onDelete: "set null" }),
    /** A rider the shop asked to deliver, waiting for them to accept or decline. */
    offeredRiderId: uuid("offered_rider_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    offeredAt: timestamp("offered_at", { withTimezone: true }),
    /** Riders who said no to this order (so the shop sees it). */
    declinedRiderIds: jsonb("declined_rider_ids").$type<string[]>().notNull().default([]),
    /** The shop's country when the order was placed. */
    country: text("country").$type<Country>().notNull().default("LR"),
    /** Discount-code money off this order, whole cents. Paid by YanaBuy — the seller still earns on the full subtotal. */
    discount: integer("discount").notNull().default(0),
    discountCode: text("discount_code"),
    note: text("note"),
    cancelReason: text("cancel_reason"),
    cancelledBy: text("cancelled_by"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** Set when delivered: YanaBuy's cut and what the seller earns (cents). */
    commission: integer("commission"),
    sellerEarning: integer("seller_earning"),
    /** Mobile money / card payment this order belongs to. */
    paymentId: uuid("payment_id"),
    /** Cash on delivery: when the rider handed the cash to YanaBuy. */
    cashHandedInAt: timestamp("cash_handed_in_at", { withTimezone: true }),
    cashReceivedById: uuid("cash_received_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_number_key").on(t.number),
    index("orders_buyer_idx").on(t.buyerId),
    index("orders_shop_idx").on(t.shopId),
    index("orders_rider_idx").on(t.riderId),
    index("orders_status_idx").on(t.status),
  ]
);

/** What was bought, copied at the time of the order (so later edits don't change old orders). */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: text("variant_id"),
    variantLabel: text("variant_label"),
    name: text("name").notNull(),
    image: text("image"),
    /** What the buyer paid for one (seller's price + YanaBuy's commission). */
    price: integer("price").notNull(),
    /** The seller's own price for one, at the time (null on orders from before commission was added on top). */
    sellerPrice: integer("seller_price"),
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)]
);

/** Every step of an order, for the tracking timeline. */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    byUserId: uuid("by_user_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId)]
);

// ─── Phase 5: money ────────────────────────────────────────────────────────

export const walletEntryType = pgEnum("wallet_entry_type", ["sale", "payout", "payout_returned", "adjustment", "refund"]);

/**
 * A shop's money, as a list of movements. The balance is the sum.
 * sale = earnings from a delivered order; payout = money requested out
 * (taken off straight away); payout_returned = a refused payout coming back.
 */
export const walletEntries = pgTable(
  "wallet_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    type: walletEntryType("type").notNull(),
    /** Cents; money in is positive, money out negative. */
    amount: integer("amount").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    payoutId: uuid("payout_id"),
    note: text("note"),
    byUserId: uuid("by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wallet_entries_shop_idx").on(t.shopId), uniqueIndex("wallet_entries_sale_key").on(t.orderId, t.type)]
);

export const payoutStatus = pgEnum("payout_status", ["requested", "paid", "rejected"]);

export const riderEntryType = pgEnum("rider_entry_type", ["trip", "payout", "adjustment"]);

/**
 * What YanaBuy owes each rider, as a list of movements. The balance is the sum.
 * trip = the full delivery fee of a delivered order; payout = money the admin sent (negative).
 */
export const riderEntries = pgTable(
  "rider_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    riderId: uuid("rider_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: riderEntryType("type").notNull(),
    /** Cents; money owed to the rider is positive, money paid out negative. */
    amount: integer("amount").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    /** The mobile money transaction ID of a payout. */
    reference: text("reference"),
    note: text("note"),
    byUserId: uuid("by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rider_entries_rider_idx").on(t.riderId), uniqueIndex("rider_entries_trip_key").on(t.orderId, t.type)]
);
export type RiderEntryRow = typeof riderEntries.$inferSelect;

export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").generatedAlwaysAsIdentity({ startWith: 5001 }),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    method: text("method").notNull(),
    accountName: text("account_name").notNull(),
    accountPhone: text("account_phone").notNull(),
    status: payoutStatus("status").notNull().default("requested"),
    /** The mobile money transaction ID the admin paid with. */
    reference: text("reference"),
    reason: text("reason"),
    requestedById: uuid("requested_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payouts_shop_idx").on(t.shopId), index("payouts_status_idx").on(t.status)]
);

export const paymentStatusEnum = pgEnum("payment_attempt_status", ["pending", "successful", "failed", "expired"]);

/** One mobile money (or card) payment for a checkout — it can cover several orders. */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    method: paymentMethod("method").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    payerPhone: text("payer_phone").notNull(),
    /** The provider's ID for this payment (MTN: X-Reference-Id). */
    providerRef: text("provider_ref").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    failureReason: text("failure_reason"),
    providerTxnId: text("provider_txn_id"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    /** Set when this pays for a China sourcing request instead of orders. */
    sourcingId: uuid("sourcing_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("payments_provider_ref_key").on(t.providerRef), index("payments_buyer_idx").on(t.buyerId)]
);

/**
 * Money YanaBuy sent out through MTN Disbursements (the "Send by MoMo" button).
 * The payout / rider entry is written first so the money can't be sent twice;
 * if MTN says it failed, the money is put back on what's owed.
 */
export const momoTransfers = pgTable(
  "momo_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "shop" or "rider". */
    kind: text("kind").notNull(),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "set null" }),
    riderId: uuid("rider_id").references(() => users.id, { onDelete: "set null" }),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    phone: text("phone").notNull(),
    name: text("name").notNull(),
    /** MTN's X-Reference-Id for this transfer. */
    providerRef: text("provider_ref").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    providerTxnId: text("provider_txn_id"),
    failureReason: text("failure_reason"),
    payoutId: uuid("payout_id").references(() => payouts.id, { onDelete: "set null" }),
    riderEntryId: uuid("rider_entry_id").references(() => riderEntries.id, { onDelete: "set null" }),
    byUserId: uuid("by_user_id").references(() => users.id, { onDelete: "set null" }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("momo_transfers_provider_ref_key").on(t.providerRef), index("momo_transfers_status_idx").on(t.status)]
);
export type MomoTransferRow = typeof momoTransfers.$inferSelect;

// ─── Phase 6: reviews, chat, disputes, China sourcing ──────────────────────

/** A buyer's stars and words about one product from a delivered order. */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    sellerReply: text("seller_reply"),
    sellerRepliedAt: timestamp("seller_replied_at", { withTimezone: true }),
    /** Hidden by an admin (rude, fake, off-topic). Hidden reviews don't count. */
    hidden: boolean("hidden").notNull().default(false),
    hiddenReason: text("hidden_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reviews_order_product_key").on(t.orderId, t.productId),
    index("reviews_product_idx").on(t.productId),
    index("reviews_shop_idx").on(t.shopId),
  ]
);

/** One chat thread between a buyer and a shop. */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    lastMessage: text("last_message"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    buyerReadAt: timestamp("buyer_read_at", { withTimezone: true }),
    shopReadAt: timestamp("shop_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("conversations_pair_key").on(t.buyerId, t.shopId), index("conversations_shop_idx").on(t.shopId), index("conversations_last_idx").on(t.lastMessageAt)]
);

export const messageSender = pgEnum("message_sender", ["buyer", "shop", "admin"]);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
    sender: messageSender("sender").notNull(),
    body: text("body"),
    imageUrl: text("image_url"),
    /** What the message is about — a product or an order. */
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)]
);

export const disputeReason = pgEnum("dispute_reason", ["not_received", "wrong_item", "damaged", "not_as_described", "missing_items", "other"]);
export const disputeStatus = pgEnum("dispute_status", ["open", "resolved"]);
export const disputeOutcome = pgEnum("dispute_outcome", ["refund_full", "refund_partial", "no_refund"]);

/** A buyer's problem with a delivered order, decided by an admin. */
export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").generatedAlwaysAsIdentity({ startWith: 7001 }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id),
    reason: disputeReason("reason").notNull(),
    description: text("description").notNull(),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    status: disputeStatus("status").notNull().default("open"),
    sellerResponse: text("seller_response"),
    sellerRespondedAt: timestamp("seller_responded_at", { withTimezone: true }),
    outcome: disputeOutcome("outcome"),
    /** Cents sent back to the buyer, and cents taken from the seller's balance. */
    refundAmount: integer("refund_amount"),
    sellerCharge: integer("seller_charge"),
    refundReference: text("refund_reference"),
    decisionNote: text("decision_note"),
    resolvedById: uuid("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("disputes_order_key").on(t.orderId), uniqueIndex("disputes_number_key").on(t.number), index("disputes_status_idx").on(t.status)]
);

/**
 * "Buy it from China for me": the buyer describes it, YanaBuy quotes a landed
 * price, the buyer accepts and pays, then YanaBuy orders, ships and delivers.
 */
export const sourcingStatus = pgEnum("sourcing_status", [
  "pending",
  "quoted",
  "accepted",
  "ordered",
  "shipped",
  "arrived",
  "delivered",
  "rejected",
  "cancelled",
]);

export const sourcingRequests = pgTable(
  "sourcing_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").generatedAlwaysAsIdentity({ startWith: 3001 }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    link: text("link"),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    budget: text("budget"),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    status: sourcingStatus("status").notNull().default("pending"),
    /** The landed price for everything (item + shipping to Liberia), cents. */
    quotePrice: integer("quote_price"),
    quoteDays: integer("quote_days"),
    quoteNote: text("quote_note"),
    quotedAt: timestamp("quoted_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    paymentMethod: paymentMethod("payment_method"),
    paymentStatus: paymentStatus("payment_status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    deliveryName: text("delivery_name"),
    deliveryPhone: text("delivery_phone"),
    deliveryCity: text("delivery_city"),
    deliveryAddress: text("delivery_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sourcing_number_key").on(t.number), index("sourcing_buyer_idx").on(t.buyerId), index("sourcing_status_idx").on(t.status)]
);

export const sourcingEvents = pgTable(
  "sourcing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => sourcingRequests.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    note: text("note"),
    byUserId: uuid("by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sourcing_events_request_idx").on(t.requestId)]
);

// ─── Rider sign-up ─────────────────────────────────────────────────────────

export const riderVehicle = pgEnum("rider_vehicle", ["motorbike", "keke", "car", "bicycle", "on_foot"]);
export const riderAppStatus = pgEnum("rider_app_status", ["pending", "approved", "rejected", "suspended"]);

/** Someone asking to deliver for YanaBuy. Approving it makes the account a rider. One per person. */
export const riderApplications = pgTable(
  "rider_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vehicle: riderVehicle("vehicle").notNull(),
    plateNumber: text("plate_number"),
    city: text("city").notNull(),
    /** The parts of town they can cover, in their words. */
    areas: text("areas").notNull(),
    // ID photos: only on older applications (riders now just confirm their email).
    idType: idDocumentType("id_type"),
    idFrontKey: text("id_front_key"),
    idBackKey: text("id_back_key"),
    selfieKey: text("selfie_key"),
    /** Driver's licence — needed for motorbike, keke and car. */
    licenseKey: text("license_key"),
    emergencyName: text("emergency_name").notNull(),
    emergencyPhone: text("emergency_phone").notNull(),
    status: riderAppStatus("status").notNull().default("pending"),
    statusReason: text("status_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rider_applications_user_key").on(t.userId), index("rider_applications_status_idx").on(t.status)]
);

export type UserRow = typeof users.$inferSelect;
export type ShopRow = typeof shops.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type BannerRow = typeof banners.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type PayoutRow = typeof payouts.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type DisputeRow = typeof disputes.$inferSelect;
export type SourcingRow = typeof sourcingRequests.$inferSelect;
export type RiderApplicationRow = typeof riderApplications.$inferSelect;

// ─── Shopify import ──────────────────────────────────────────────────────────

/** Everyone from the Shopify customer list, kept for marketing and history. Downloadable by admins. */
export const shopifyContacts = pgTable(
  "shopify_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopifyId: text("shopify_id").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    /** +231… when it could be read as a Liberian number, otherwise as written. */
    phone: text("phone"),
    city: text("city"),
    address: text("address"),
    /** Whole cents (USD). */
    totalSpent: integer("total_spent").notNull().default(0),
    totalOrders: integer("total_orders").notNull().default(0),
    acceptsEmail: boolean("accepts_email").notNull().default(false),
    acceptsSms: boolean("accepts_sms").notNull().default(false),
    tags: text("tags"),
    note: text("note"),
    /** The v3 account made for them (when they had a phone number). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shopify_contacts_shopify_id_key").on(t.shopifyId), index("shopify_contacts_phone_idx").on(t.phone)]
);

export interface ShopifyOrderItem {
  name: string;
  quantity: number;
  /** Whole cents. */
  price: number;
  vendor: string | null;
  sku: string | null;
}

/** Past Shopify orders, read-only. They never count towards seller balances or payouts. */
export const shopifyOrders = pgTable(
  "shopify_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "#YN1853" */
    name: text("name").notNull(),
    shopifyId: text("shopify_id"),
    buyerName: text("buyer_name"),
    email: text("email"),
    phone: text("phone"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    vendors: text("vendors"),
    financialStatus: text("financial_status"),
    fulfillmentStatus: text("fulfillment_status"),
    paymentMethod: text("payment_method"),
    shippingMethod: text("shipping_method"),
    currency: text("currency").notNull().default("USD"),
    subtotal: integer("subtotal").notNull().default(0),
    shipping: integer("shipping").notNull().default(0),
    discount: integer("discount").notNull().default(0),
    discountCode: text("discount_code"),
    total: integer("total").notNull().default(0),
    refunded: integer("refunded").notNull().default(0),
    address: text("address"),
    city: text("city"),
    notes: text("notes"),
    items: jsonb("items").$type<ShopifyOrderItem[]>().notNull().default([]),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("shopify_orders_name_key").on(t.name),
    index("shopify_orders_user_idx").on(t.userId),
    index("shopify_orders_phone_idx").on(t.phone),
    index("shopify_orders_placed_idx").on(t.placedAt),
  ]
);

// ─── Discount codes ─────────────────────────────────────────────────────────

export const discountType = pgEnum("discount_type", ["percent", "fixed"]);

/** Codes made by admins. YanaBuy pays the discount; sellers still earn on the full price. */
export const discountCodes = pgTable(
  "discount_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Always stored in capitals. */
    code: text("code").notNull(),
    description: text("description"),
    type: discountType("type").notNull(),
    /** Percent (1–100) for "percent"; whole cents for "fixed". */
    value: integer("value").notNull(),
    /** For percent codes: the most it can take off, whole cents. */
    maxDiscount: integer("max_discount"),
    /** Items must add up to at least this (whole cents). */
    minSubtotal: integer("min_subtotal"),
    /** goods / food / all */
    mode: text("mode").notNull().default("all"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** How many checkouts in total can use it (null = no limit). */
    usageLimit: integer("usage_limit"),
    /** How many times one buyer can use it (null = no limit). */
    perBuyerLimit: integer("per_buyer_limit").default(1),
    active: boolean("active").notNull().default(true),
    timesUsed: integer("times_used").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("discount_codes_code_key").on(t.code)]
);

/** One row per checkout that used a code. */
export const discountRedemptions = pgTable(
  "discount_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codeId: uuid("code_id")
      .notNull()
      .references(() => discountCodes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Total taken off across the checkout's orders, whole cents. */
    amount: integer("amount").notNull(),
    orderIds: jsonb("order_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("discount_redemptions_code_user_idx").on(t.codeId, t.userId)]
);

// ─── Wishlist and notifications ─────────────────────────────────────────────

/** Products a buyer saved. priceAtSave lets us tell them when it gets cheaper. */
export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    priceAtSave: integer("price_at_save").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("wishlist_user_product_key").on(t.userId, t.productId), index("wishlist_product_idx").on(t.productId)]
);

/** The bell: things that happened that a person should know about. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** order, chat, price_drop, booking, payout, dispute, shop, product, system */
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** Where tapping it goes, as an app path, e.g. /orders/<id>. */
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)]
);

/** Phones that get push notifications (Expo push tokens). */
export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: text("platform"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_tokens_token_key").on(t.token), index("push_tokens_user_idx").on(t.userId)]
);

// ─── Bookings: restaurant tables and service appointments ──────────────────

export const bookingKind = pgEnum("booking_kind", ["table", "service"]);
export const bookingStatus = pgEnum("booking_status", ["requested", "confirmed", "declined", "cancelled", "completed", "no_show"]);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Shown as BK-5001. */
    number: integer("number").generatedAlwaysAsIdentity({ startWith: 5001 }),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The service booked (for appointments). */
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    productName: text("product_name"),
    kind: bookingKind("kind").notNull(),
    /** Liberia is on UTC all year, so this is also the local time. */
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    partySize: integer("party_size"),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    note: text("note"),
    status: bookingStatus("status").notNull().default("requested"),
    /** The shop's reason when declining, or the buyer's when cancelling. */
    statusNote: text("status_note"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bookings_number_key").on(t.number),
    index("bookings_shop_starts_idx").on(t.shopId, t.startsAt),
    index("bookings_buyer_idx").on(t.buyerId),
  ]
);

/** 6-digit codes emailed to confirm an address. Only the hash is kept. */
export const emailCodes = pgTable(
  "email_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The address being confirmed (may differ from users.email when changing it). */
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_codes_user_idx").on(t.userId, t.createdAt)]
);

/** Remembers recent chat emails/texts so a busy chat doesn't send one per message. */
export const outboundLog = pgTable(
  "outbound_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outbound_log_user_key_idx").on(t.userId, t.key, t.createdAt)]
);

/** 6-digit codes for "forgot password". Only the hash is kept. */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    /** Where the code went: "email" or "sms" (a correct code also confirms that address/number). */
    channel: text("channel"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_resets_user_idx").on(t.userId, t.createdAt)]
);

/** 6-digit text-message codes that confirm a phone number. Only the hash is kept. */
export const phoneCodes = pgTable(
  "phone_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The number being confirmed (may differ from users.phone when changing it). */
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("phone_codes_user_idx").on(t.userId, t.createdAt)]
);

/**
 * The second step of logging in: the password was right, now a 6-digit code
 * (by text or email) finishes it. Also used when someone claims an account
 * from the old Shopify store (purpose "claim", with the sign-up details in `pending`).
 */
export const loginChallenges = pgTable(
  "login_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The app holds the random challenge id; only its hash is stored. */
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull().default("login"),
    /** "sms" or "email" — where the latest code went. */
    channel: text("channel").notNull(),
    target: text("target").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    sends: integer("sends").notNull().default(1),
    pending: jsonb("pending").$type<Record<string, unknown>>(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("login_challenges_token_key").on(t.tokenHash), index("login_challenges_user_idx").on(t.userId, t.createdAt)]
);

/** "Trust this device for 30 days": skips the login code. Never used for admins. Only the hash is kept. */
export const trustedDevices = pgTable(
  "trusted_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("trusted_devices_token_key").on(t.tokenHash), index("trusted_devices_user_idx").on(t.userId)]
);

/** Messages admins sent to groups of people (or one person). */
export const broadcasts = pgTable(
  "broadcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    /** everyone | buyers | vendors | riders | online_riders | people | user */
    audience: text("audience").notNull(),
    /** For "people": everyone picked. */
    userIds: jsonb("user_ids").$type<string[]>(),
    /** Only people near a shop. */
    near: jsonb("near").$type<{ shopId: string; shopName: string; radiusKm: number }>(),
    urgent: boolean("urgent").notNull().default(false),
    country: text("country").$type<Country>(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    channels: jsonb("channels").$type<{ app: boolean; email: boolean; sms: boolean }>().notNull(),
    recipients: integer("recipients").notNull().default(0),
    emailsSent: integer("emails_sent").notNull().default(0),
    smsSent: integer("sms_sent").notNull().default(0),
    smsFailed: integer("sms_failed").notNull().default(0),
    /** sending | sent */
    status: text("status").notNull().default("sending"),
    sentById: uuid("sent_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("broadcasts_created_idx").on(t.createdAt)]
);

/** A piece of past work on a shop's work profile: photos and/or a video link. */
export const portfolioItems = pgTable(
  "portfolio_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    videoUrl: text("video_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("portfolio_items_shop_idx").on(t.shopId, t.sortOrder)]
);
