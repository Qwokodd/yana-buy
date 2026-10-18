import type { Country } from "./country";
export type UserRole = "buyer" | "vendor" | "rider" | "admin";
export type UserStatus = "active" | "blocked";

export interface User {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  /** The email was confirmed with a code. */
  emailVerified: boolean;
  /** true = the app must ask for (or confirm) an email before carrying on. */
  needsEmail: boolean;
  role: UserRole;
  status: UserStatus;
  avatarUrl: string | null;
  city: string | null;
  createdAt: string;
}

export interface AdminUser extends User {
  blockedReason: string | null;
  blockedAt: string | null;
  lastLoginAt: string | null;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  /** Signed up with a number that bought on the old Shopify store — their account and orders were waiting. */
  welcomeBack?: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  admin: { id: string; fullName: string };
}

export interface AdminStats {
  users: Record<UserRole, number>;
  blocked: number;
  newThisWeek: number;
  shops: Record<ShopStatus, number>;
  products: Record<ProductStatus, number>;
  orders: { today: number; active: number; needRider: number; deliveredToday: number; salesToday: number };
  categories: number;
  liveBanners: number;
  payoutsWaiting: number;
  disputesOpen: number;
  /** Rider applications waiting for review. */
  ridersPending: number;
  /** China requests waiting for YanaBuy: new ones to quote plus accepted ones to order. */
  sourcingWaiting: number;
}

// ─── Phase 2 ────────────────────────────────────────────────────────────────

export type ShopKind = "store" | "restaurant";
export type ShopStatus = "pending" | "approved" | "rejected" | "suspended";
export type IdDocumentType = "national_id" | "passport" | "drivers_license" | "voter_card";
export type CatalogKind = "goods" | "food";

export interface Shop {
  id: string;
  kind: ShopKind;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  phone: string;
  city: string;
  address: string;
  status: ShopStatus;
  /** Why it was rejected or suspended. */
  statusReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  /** "shopify" for shops brought over from the old store (no ID photos on file). */
  importedFrom: string | null;
  /** What kind of shop it is, for the shop directory. */
  categoryId: string | null;
  /** Opening hours in the owner's words. */
  hours: string | null;
  /** Which country the shop sells in. Shoppers only see shops from the country they picked. */
  country: Country;
}

/** ID photos, as short-lived private links. Only the owner and admins get these. */
export interface ShopDocuments {
  idType: IdDocumentType;
  idFrontUrl: string;
  idBackUrl: string | null;
  selfieUrl: string;
}

export interface MyShop extends Shop {
  /** The owner also gets the keys, so a sent-back application can be re-sent without new photos. */
  documents: ShopDocuments & { idFrontKey: string; idBackKey: string | null; selfieKey: string };
}

export interface AdminShop extends Shop {
  owner: { id: string; fullName: string; phone: string; avatarUrl: string | null; status: UserStatus; createdAt: string; unclaimed: boolean };
  documents?: ShopDocuments;
  reviewedBy?: { id: string; fullName: string } | null;
}

/** A category in the shop directory, with how many open shops are in it. */
export interface ShopCategory {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  shopCount: number;
}

export interface ShopApplication {
  kind: ShopKind;
  country?: Country;
  categoryId?: string | null;
  hours?: string | null;
  name: string;
  description?: string | null;
  phone: string;
  city: string;
  address: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  idType: IdDocumentType;
  idFrontKey: string;
  idBackKey?: string | null;
  selfieKey: string;
}

export interface Category {
  id: string;
  kind: CatalogKind;
  name: string;
  slug: string;
  iconUrl: string | null;
  sortOrder: number;
  visible: boolean;
}

export type BannerKind = "banner" | "ad";
export type BannerPlacement = "hero" | "strip";
export type BannerPlatform = "all" | "web" | "app";
export type BannerMode = "all" | "goods" | "food";

export interface Banner {
  id: string;
  kind: BannerKind;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  buttonLabel: string | null;
  advertiser: string | null;
  placement: BannerPlacement;
  platform: BannerPlatform;
  mode: BannerMode;
  /** Only show to shoppers in this country. null = everywhere. */
  country: Country | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  sortOrder: number;
}

export interface AdminBanner extends Banner {
  clicks: number;
  /** live = showing now; scheduled = starts later; ended; off = switched off */
  state: "live" | "scheduled" | "ended" | "off";
  createdAt: string;
}

export type BannerInput = Omit<Banner, "id" | "sortOrder" | "country"> & { country?: Country | null };

export interface BrandColors {
  /** Headers and main buttons (YanaBuy purple). */
  primary: string;
  /** Headings, dark panels, admin sidebar. */
  ink: string;
  /** Goods & Services accent (amber). */
  goods: string;
  /** Food accent (orange). */
  food: string;
}

export interface Branding {
  appName: string;
  tagline: string;
  /** Replaces the bag logo when set. */
  logoUrl: string | null;
  /** Browser tab icon. */
  faviconUrl: string | null;
  colors: BrandColors;
  updatedAt: string | null;
}

export interface PrivateUpload {
  /** Store this in the form. */
  key: string;
  /** Short-lived link for showing a preview. */
  url: string;
}

// ─── Phase 3 ────────────────────────────────────────────────────────────────

export type ProductStatus = "pending" | "approved" | "rejected" | "removed";

export interface ShopSummary {
  id: string;
  name: string;
  slug: string;
  kind: ShopKind;
  city: string;
  logoUrl: string | null;
  country: Country;
}

/** What a product looks like in a grid. */
/** A choice shoppers make, e.g. Colour: Red, Blue. Up to 3 per product. */
export interface ProductOption {
  name: string;
  values: string[];
}

/** One combination of options with its own price and stock, e.g. Red / M. */
export interface ProductVariant {
  id: string;
  /** One value per option, in the same order as the product's options. */
  values: string[];
  /** Whole cents. */
  price: number;
  compareAtPrice: number | null;
  /** null = the seller doesn't count stock. */
  stock: number | null;
  image: string | null;
}

/** "Red / M" */
export const variantLabel = (values: string[]) => values.join(" / ");

export interface ProductCard {
  id: string;
  kind: CatalogKind;
  name: string;
  /** Whole cents. */
  price: number;
  compareAtPrice: number | null;
  image: string | null;
  inStock: boolean;
  featured: boolean;
  shop: ShopSummary;
  category: { id: string; name: string; slug: string } | null;
  /** Average stars (1 decimal), null until someone reviews it. */
  rating: number | null;
  ratingCount: number;
  shipsFromChina: boolean;
  /** Rough delivery time in days, if the seller gave one. */
  deliveryDays: number | null;
  /** Has colour/size choices — price is the lowest one ("from $x"). */
  hasOptions: boolean;
}

/** A product's own page. */
export interface Product extends ProductCard {
  description: string | null;
  images: string[];
  stock: number | null;
  options: ProductOption[];
  variants: ProductVariant[];
  /** A service people book a time for. */
  bookable: boolean;
  durationMinutes: number | null;
  createdAt: string;
  shop: ShopSummary & { phone: string };
}

/** The seller's view of their own product. */
export interface MyProduct extends Product {
  status: ProductStatus;
  statusReason: string | null;
  hidden: boolean;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface AdminProduct extends MyProduct {
  shop: ShopSummary & { phone: string; status: ShopStatus; ownerName: string };
  reviewedBy: { id: string; fullName: string } | null;
}

export interface ProductInput {
  name: string;
  description?: string | null;
  categoryId: string;
  /** Whole cents. Required unless the product has options (then each variant has its own). */
  price?: number;
  compareAtPrice?: number | null;
  stock?: number | null;
  images: string[];
  shipsFromChina?: boolean;
  deliveryDays?: number | null;
  /** Leave empty for a product without choices. With options, price/stock come from the variants. */
  options?: ProductOption[];
  bookable?: boolean;
  durationMinutes?: number | null;
  /** Variant ids are made by the server; send an existing id to keep it (carts keep working). */
  variants?: (Omit<ProductVariant, "id"> & { id?: string })[];
}

export interface PublicShop extends ShopSummary {
  description: string | null;
  coverUrl: string | null;
  phone: string;
  address: string;
  category: { id: string; name: string; slug: string } | null;
  hours: string | null;
  /** Set when the shop takes bookings: tables (restaurants) or appointments (services). */
  booking: { kind: BookingKind; maxPartySize: number; daysAhead: number; note: string | null } | null;
  /** The work profile (null = not filled in). */
  workProfile: WorkProfile | null;
  /** How many portfolio items it has (load them with public.portfolio). */
  portfolioCount: number;
  productCount: number;
  rating: number | null;
  ratingCount: number;
  createdAt: string;
}

export type ProductSort = "best" | "newest" | "price_asc" | "price_desc" | "top_rated";

export interface ProductQuery {
  q?: string;
  mode?: CatalogKind;
  category?: string;
  shop?: string;
  sort?: ProductSort;
  /** Only items shipped from China. */
  china?: boolean;
  /** Only services people can book a time for. */
  bookable?: boolean;
  page?: number;
}

// ─── Phase 4 ────────────────────────────────────────────────────────────────

export type OrderStatus = "awaiting_payment" | "placed" | "accepted" | "ready" | "picked_up" | "delivered" | "cancelled";
export type PaymentMethod = "cod" | "mtn_momo" | "orange_money" | "card";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export interface CartItem {
  productId: string;
  /** Required when the product has options. */
  variantId?: string | null;
  quantity: number;
}

export interface QuoteLine {
  productId: string;
  variantId: string | null;
  /** "Red / M", or null for a product without options. */
  variantLabel: string | null;
  /** Price of one, for this option. */
  unitPrice: number;
  quantity: number;
  /** null when the product is gone or no longer on sale. */
  product: ProductCard | null;
  /** How many can be bought right now (null = no limit). */
  available: number | null;
  lineTotal: number;
  /** Why this line can't be ordered as it is, in plain words. */
  problem: string | null;
}

export interface QuoteShop {
  shop: ShopSummary;
  subtotal: number;
  deliveryFee: number;
  /** This shop's share of the discount-code money off. */
  discount: number;
}

export interface Quote {
  lines: QuoteLine[];
  shops: QuoteShop[];
  subtotal: number;
  deliveryFees: number;
  /** Money off from a discount code (paid by YanaBuy). */
  discount: number;
  /** The code that applied, in capitals, or null. */
  discountCode: string | null;
  /** Why the code didn't apply, in plain words. */
  discountProblem: string | null;
  total: number;
  /** Delivery areas buyers pick from (empty = one flat fee). */
  areas: DeliveryArea[];
  /** The area the fees were worked out for, if one was picked. */
  areaId: string | null;
  /** The country being shopped in (from the country switch). Items from other countries can't be bought in this cart. */
  country: Country;
  paymentMethods: { method: PaymentMethod; enabled: boolean }[];
  ok: boolean;
}

/** A part of town with its own delivery fee, set by admins. */
export interface DeliveryArea {
  id: string;
  name: string;
  /** Whole cents. */
  fee: number;
  active: boolean;
  /** Which country the area is in (shoppers only see areas for their country). */
  country: Country;
}

export type DiscountType = "percent" | "fixed";

/** A discount code, as admins see it. */
export interface DiscountCode {
  id: string;
  code: string;
  description: string | null;
  type: DiscountType;
  /** Percent (1–100), or whole cents for a fixed amount. */
  value: number;
  maxDiscount: number | null;
  minSubtotal: number | null;
  mode: "all" | CatalogKind;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perBuyerLimit: number | null;
  active: boolean;
  timesUsed: number;
  /** Total money taken off so far, whole cents. */
  totalDiscount: number;
  createdAt: string;
}

export type DiscountCodeInput = Omit<DiscountCode, "id" | "timesUsed" | "totalDiscount" | "createdAt">;

export interface DeliveryDetails {
  name: string;
  phone: string;
  city: string;
  address: string;
  note?: string | null;
  /** Delivery area id (required when admins have set up areas). */
  areaId?: string | null;
  /** The area's name, as saved on the order. */
  area?: string | null;
}

export interface DeliverySettings {
  /** Fee per order (per shop), whole cents. */
  fee: number;
  /** Orders at or above this subtotal deliver free. null = never free. */
  freeOver: number | null;
  /** Which payment methods shoppers can pick. Only cash works until mobile money is connected. */
  methods: Record<PaymentMethod, boolean>;
  /** Parts of town with their own fee. When any are switched on, buyers must pick one and the fee above is not used. */
  /** Base fee and free-over for countries other than Liberia (Liberia uses fee/freeOver above). */
  countryFees: Partial<Record<Country, { fee: number; freeOver: number | null }>>;
  areas: DeliveryArea[];
}

export interface OrderItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  variantLabel: string | null;
  name: string;
  image: string | null;
  price: number;
  quantity: number;
}

export interface OrderEvent {
  status: string;
  note: string | null;
  createdAt: string;
  by: string | null;
}

export interface PersonContact {
  id: string;
  fullName: string;
  phone: string;
  avatarUrl: string | null;
}

export interface OrderSummary {
  id: string;
  number: string;
  kind: CatalogKind;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  total: number;
  itemCount: number;
  firstImage: string | null;
  shop: ShopSummary;
  createdAt: string;
  rider: PersonContact | null;
  /** A problem the buyer reported, if any. */
  disputeStatus: DisputeStatus | null;
}

export interface Order extends OrderSummary {
  subtotal: number;
  deliveryFee: number;
  /** Discount-code money off (paid by YanaBuy). */
  discount: number;
  discountCode: string | null;
  items: OrderItem[];
  delivery: DeliveryDetails;
  shop: ShopSummary & { phone: string; address: string };
  buyer: PersonContact;
  cancelReason: string | null;
  cancelledBy: string | null;
  events: OrderEvent[];
  acceptedAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  dispute: OrderDispute | null;
  /** Products in this order the buyer has already reviewed. */
  reviewedProductIds: string[];
  /** Until when the buyer can still report a problem (delivered orders only). */
  disputeUntil: string | null;
}

export interface RiderSummary extends PersonContact {
  status: UserStatus;
  activeDeliveries: number;
  deliveredToday: number;
}

// ─── Phase 5 ────────────────────────────────────────────────────────────────

export type PayoutMethod = "mtn_momo" | "orange_money";

export interface FinanceSettings {
  /** YanaBuy's cut of the item price (not delivery), in percent. */
  goodsCommission: number;
  foodCommission: number;
  /** Smallest payout a seller can ask for, in cents. */
  minPayout: number;
}

export interface WalletEntry {
  id: string;
  type: "sale" | "payout" | "payout_returned" | "adjustment" | "refund";
  amount: number;
  note: string | null;
  orderNumber: string | null;
  payoutNumber: string | null;
  createdAt: string;
}

export interface PayoutDetails {
  method: PayoutMethod;
  name: string;
  phone: string;
}

export interface Payout {
  id: string;
  number: string;
  amount: number;
  method: PayoutMethod;
  accountName: string;
  accountPhone: string;
  status: "requested" | "paid" | "rejected";
  reference: string | null;
  reason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  shop: ShopSummary;
}

export interface Wallet {
  balance: number;
  /** Sold and delivered this month, before YanaBuy's cut. */
  salesThisMonth: number;
  earnedThisMonth: number;
  pendingPayouts: number;
  payoutDetails: PayoutDetails | null;
  minPayout: number;
  commission: number;
  entries: WalletEntry[];
  payouts: Payout[];
}

export interface ShopBalance {
  shop: ShopSummary;
  balance: number;
  owner: string;
}

export interface RiderCash {
  rider: PersonContact;
  amount: number;
  orders: { id: string; number: string; total: number; deliveredAt: string }[];
}

export interface MoneyOverview {
  salesThisMonth: number;
  commissionThisMonth: number;
  deliveryFeesThisMonth: number;
  /** Discount-code money YanaBuy paid on orders delivered this month. */
  discountsThisMonth: number;
  owedToSellers: number;
  cashWithRiders: number;
  payoutsWaiting: { count: number; amount: number };
  paidOutThisMonth: number;
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  amount: number;
  payerPhone: string;
  status: "pending" | "successful" | "failed" | "expired";
  failureReason: string | null;
  orderIds: string[];
  /** Set when it pays for a China sourcing request. */
  sourcingId: string | null;
}

// ─── Phase 6 ────────────────────────────────────────────────────────────────

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  /** First name and initial, e.g. "Grace W." */
  buyerName: string;
  buyerAvatar: string | null;
  product: { id: string; name: string; image: string | null };
  sellerReply: string | null;
  sellerRepliedAt: string | null;
  createdAt: string;
}

export interface RatingSummary {
  average: number | null;
  count: number;
  /** How many reviews gave 1, 2, 3, 4 and 5 stars (index 0 = 1 star). */
  stars: number[];
}

export interface AdminReview extends Review {
  hidden: boolean;
  hiddenReason: string | null;
  shop: ShopSummary;
  orderNumber: string;
  buyer: { id: string; fullName: string };
}

export interface ReviewInput {
  orderId: string;
  productId: string;
  rating: number;
  comment?: string | null;
}

export type MessageSender = "buyer" | "shop" | "admin";

export interface ConversationSummary {
  id: string;
  /** Which side of the chat the logged-in person is on. */
  side: "buyer" | "shop";
  shop: ShopSummary;
  buyer: { id: string; fullName: string; avatarUrl: string | null };
  lastMessage: string | null;
  lastMessageAt: string;
  unread: number;
}

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  mine: boolean;
  senderName: string;
  body: string | null;
  imageUrl: string | null;
  product: { id: string; name: string; image: string | null; price: number } | null;
  order: { id: string; number: string } | null;
  createdAt: string;
}

export interface MessageInput {
  body?: string | null;
  imageUrl?: string | null;
  productId?: string | null;
  orderId?: string | null;
}

export interface AdminConversation extends Omit<ConversationSummary, "side" | "unread"> {
  messageCount: number;
}

export type DisputeStatus = "open" | "resolved";
export type DisputeReason = "not_received" | "wrong_item" | "damaged" | "not_as_described" | "missing_items" | "other";
export type DisputeOutcome = "refund_full" | "refund_partial" | "no_refund";

/** A problem with an order, as the buyer, seller and admin see it on the order. */
export interface OrderDispute {
  id: string;
  number: string;
  status: DisputeStatus;
  reason: DisputeReason;
  description: string;
  photos: string[];
  sellerResponse: string | null;
  sellerRespondedAt: string | null;
  outcome: DisputeOutcome | null;
  refundAmount: number | null;
  /** Taken from the seller's balance (seller and admin only). */
  sellerCharge: number | null;
  refundReference: string | null;
  decisionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AdminDispute extends OrderDispute {
  order: OrderSummary;
  buyer: PersonContact;
}

export interface DisputeInput {
  reason: DisputeReason;
  description: string;
  photos: string[];
}

export interface DisputeDecision {
  outcome: DisputeOutcome;
  /** Cents sent back to the buyer. */
  refundAmount: number;
  /** Cents taken from the seller's balance. */
  sellerCharge: number;
  refundReference?: string | null;
  note: string;
}

export type SourcingStatus = "pending" | "quoted" | "accepted" | "ordered" | "shipped" | "arrived" | "delivered" | "rejected" | "cancelled";

export interface SourcingRequest {
  id: string;
  number: string;
  status: SourcingStatus;
  link: string | null;
  description: string;
  quantity: number;
  budget: string | null;
  images: string[];
  /** Landed price for everything, cents. */
  quotePrice: number | null;
  quoteDays: number | null;
  quoteNote: string | null;
  quotedAt: string | null;
  rejectReason: string | null;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  delivery: DeliveryDetails | null;
  events: { status: string; note: string | null; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
  /** Admin only. */
  buyer?: PersonContact;
}

export interface SourcingInput {
  link?: string | null;
  description: string;
  quantity: number;
  budget?: string | null;
  images: string[];
}

// ─── Rider sign-up ──────────────────────────────────────────────────────────

export type RiderVehicle = "motorbike" | "keke" | "car" | "bicycle" | "on_foot";
export type RiderApplicationStatus = "pending" | "approved" | "rejected" | "suspended";

export interface RiderApplicationInput {
  vehicle: RiderVehicle;
  plateNumber?: string | null;
  city: string;
  areas: string;
  idType: IdDocumentType;
  idFrontKey: string;
  idBackKey?: string | null;
  selfieKey: string;
  licenseKey?: string | null;
  emergencyName: string;
  emergencyPhone: string;
}

export interface RiderDocuments {
  idType: IdDocumentType;
  idFrontUrl: string;
  idBackUrl: string | null;
  selfieUrl: string;
  licenseUrl: string | null;
}

export interface RiderApplication {
  id: string;
  vehicle: RiderVehicle;
  plateNumber: string | null;
  city: string;
  areas: string;
  emergencyName: string;
  emergencyPhone: string;
  status: RiderApplicationStatus;
  statusReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  documents: RiderDocuments;
}

/** The applicant's own view: includes the photo keys so a sent-back form can be sent again unchanged. */
export interface MyRiderApplication extends RiderApplication {
  keys: { idFrontKey: string; idBackKey: string | null; selfieKey: string; licenseKey: string | null };
}

export interface AdminRiderApplication extends RiderApplication {
  user: { id: string; fullName: string; phone: string; avatarUrl: string | null; role: UserRole; status: UserStatus; createdAt: string };
  reviewedBy: { id: string; fullName: string } | null;
}

// ─── Shopify archive ────────────────────────────────────────────────────────

export interface ShopifyOrderItem {
  name: string;
  quantity: number;
  /** Whole cents. */
  price: number;
  vendor: string | null;
  sku: string | null;
}

/** An order from the old Shopify store — read only, never part of balances or payouts. */
export interface ShopifyOrder {
  id: string;
  /** "#YN1853" */
  name: string;
  buyerName: string | null;
  email: string | null;
  phone: string | null;
  userId: string | null;
  vendors: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  paymentMethod: string | null;
  shippingMethod: string | null;
  currency: string;
  subtotal: number;
  shipping: number;
  discount: number;
  discountCode: string | null;
  total: number;
  refunded: number;
  address: string | null;
  city: string | null;
  notes: string | null;
  items: ShopifyOrderItem[];
  placedAt: string;
  cancelledAt: string | null;
}

export interface ShopifyContact {
  id: string;
  shopifyId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  totalSpent: number;
  totalOrders: number;
  acceptsEmail: boolean;
  acceptsSms: boolean;
  tags: string | null;
  /** They have (or were given) a YanaBuy v3 account. */
  hasAccount: boolean;
}

export interface ShopifySummary {
  orders: number;
  contacts: number;
  contactsWithAccount: number;
  /** Customers brought over who haven't signed up on v3 yet. */
  unclaimedAccounts: number;
  importedShops: number;
  /** Imported shops still owned by a placeholder account (not handed over yet). */
  shopsToHandOver: number;
  importedProducts: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

// ─── Wishlist & notifications ───────────────────────────────────────────────

export type NotificationType = "order" | "chat" | "price_drop" | "booking" | "payout" | "dispute" | "shop" | "product" | "system";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** Where tapping it goes, e.g. /orders/<id>. The same path works on web and phone. */
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface WishlistEntry {
  product: ProductCard;
  /** The price when it was saved — so the app can say "now cheaper". */
  priceAtSave: number;
  savedAt: string;
}

// ─── Bookings ───────────────────────────────────────────────────────────────

/** How a shop takes bookings. Times are "HH:MM" in Liberia time (UTC). */
export interface BookingSettings {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  opens: string;
  closes: string;
  /** Minutes between start times, e.g. 30. */
  slotMinutes: number;
  /** How many bookings can start at the same time (tables, or staff for services). */
  perSlot: number;
  /** Restaurants: the biggest group that can book online. */
  maxPartySize: number;
  /** How long before the time people must book, in hours. */
  leadHours: number;
  /** How far ahead people can book, in days. */
  daysAhead: number;
  /** Shown on the booking form, e.g. "We hold tables for 15 minutes." */
  note: string | null;
}

export type BookingKind = "table" | "service";
export type BookingStatus = "requested" | "confirmed" | "declined" | "cancelled" | "completed" | "no_show";

export interface BookingSlot {
  /** "14:30" */
  time: string;
  /** ISO start time. */
  startsAt: string;
  /** How many more bookings this time can take. */
  left: number;
}

export interface Booking {
  id: string;
  /** "BK-5001" */
  number: string;
  kind: BookingKind;
  status: BookingStatus;
  startsAt: string;
  durationMinutes: number;
  partySize: number | null;
  contactName: string;
  contactPhone: string;
  note: string | null;
  statusNote: string | null;
  product: { id: string; name: string } | null;
  shop: ShopSummary & { phone: string; address: string };
  buyer: { id: string; fullName: string; phone: string; avatarUrl: string | null };
  createdAt: string;
  respondedAt: string | null;
}

export interface BookingInput {
  shopId: string;
  productId?: string | null;
  /** ISO start time — one of the slots from the availability list. */
  startsAt: string;
  partySize?: number | null;
  contactName: string;
  contactPhone: string;
  note?: string | null;
}

export const bookingNumber = (n: number) => `BK-${n}`;

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "Waiting for the shop",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
  completed: "Done",
  no_show: "Didn't come",
};

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  enabled: false,
  days: [1, 2, 3, 4, 5, 6],
  opens: "09:00",
  closes: "18:00",
  slotMinutes: 60,
  perSlot: 1,
  maxPartySize: 8,
  leadHours: 2,
  daysAhead: 30,
  note: null,
};

// ─── Work profile (service providers) ─────────────────────────────────────

export interface VideoLink {
  url: string;
  title: string | null;
}

/** What a shop says about itself on its work profile. Every field is optional. */
export interface WorkProfile {
  /** One line under the name, e.g. "Bridal make-up & gele artist". */
  tagline: string | null;
  /** A few paragraphs about them and how they work. */
  about: string | null;
  yearsExperience: number | null;
  skills: string[];
  certifications: string[];
  languages: string[];
  /** Towns or neighbourhoods they work in. */
  serviceAreas: string[];
  /** "Comes to you", "At our shop" or both. */
  servesAt: ("home" | "shop")[];
  videos: VideoLink[];
}

export const EMPTY_WORK_PROFILE: WorkProfile = {
  tagline: null,
  about: null,
  yearsExperience: null,
  skills: [],
  certifications: [],
  languages: [],
  serviceAreas: [],
  servesAt: [],
  videos: [],
};

/** A piece of past work: photos and/or a video, with a title. */
export interface PortfolioItem {
  id: string;
  title: string;
  description: string | null;
  images: string[];
  videoUrl: string | null;
  sortOrder: number;
  createdAt: string;
}

export type PortfolioInput = Pick<PortfolioItem, "title"> & Partial<Pick<PortfolioItem, "description" | "images" | "videoUrl">>;

// ─── Admin messages ───────────────────────────────────────────────────────

export type BroadcastAudience = "everyone" | "buyers" | "vendors" | "riders" | "user";

export interface BroadcastChannels {
  /** The bell in the apps, plus a phone notification. */
  app: boolean;
  email: boolean;
  sms: boolean;
}

export interface BroadcastInput {
  title: string;
  body: string;
  /** A page on the site, e.g. /shops or /p/<id> (optional). */
  link?: string | null;
  audience: BroadcastAudience;
  /** For audience "user". */
  userId?: string | null;
  /** Only people in this country (null = both). */
  country?: Country | null;
  channels: BroadcastChannels;
}

export interface Broadcast {
  id: string;
  title: string;
  body: string;
  link: string | null;
  audience: BroadcastAudience;
  country: Country | null;
  user: { id: string; fullName: string } | null;
  channels: BroadcastChannels;
  recipients: number;
  emailsSent: number;
  smsSent: number;
  status: "sending" | "sent";
  sentBy: { id: string; fullName: string } | null;
  createdAt: string;
  finishedAt: string | null;
}

/** How many people a message would reach on each channel. */
export interface BroadcastPreview {
  recipients: number;
  withEmail: number;
  /** Everyone has a phone; SMS goes to all of them when SMS is switched on. */
  withPhone: number;
  emailOn: boolean;
  smsOn: boolean;
}
