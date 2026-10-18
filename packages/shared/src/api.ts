import type {
  Booking,
  BookingInput,
  BookingSettings,
  BookingSlot,
  BookingStatus,
  AppNotification,
  WishlistEntry,
  DiscountCode,
  DiscountCodeInput,
  ShopCategory,
  ShopifyContact,
  ShopifyOrder,
  ShopifySummary,
  AdminRiderApplication,
  MyRiderApplication,
  RiderApplicationInput,
  RiderApplicationStatus,
  AdminConversation,
  AdminDispute,
  AdminReview,
  ChatMessage,
  ConversationSummary,
  DisputeDecision,
  DisputeInput,
  MessageInput,
  RatingSummary,
  Review,
  ReviewInput,
  SourcingInput,
  SourcingRequest,
  SourcingStatus,
  AdminBanner,
  FinanceSettings,
  MoneyOverview,
  Payment,
  Payout,
  PayoutDetails,
  RiderCash,
  ShopBalance,
  Wallet,
  WalletEntry,
  CartItem,
  DeliveryDetails,
  DeliverySettings,
  Order,
  OrderSummary,
  PaymentMethod,
  Quote,
  RiderSummary,
  AdminProduct,
  AdminShop,
  AdminStats,
  AdminUser,
  AuditEntry,
  AuthResponse,
  Banner,
  BannerInput,
  Branding,
  CatalogKind,
  Category,
  MyProduct,
  MyShop,
  Page,
  Product,
  ProductCard,
  ProductInput,
  ProductQuery,
  ProductStatus,
  PublicShop,
  PrivateUpload,
  Shop,
  ShopApplication,
  ShopKind,
  ShopStatus,
  User,
  UserRole,
  Broadcast,
  BroadcastInput,
  BroadcastPreview,
  PortfolioInput,
  PortfolioItem,
  WorkProfile,
} from "./types";
import type { Country } from "./country";

/** Where each app keeps its login tokens (localStorage on web, SecureStore on the phone). */
export interface TokenStore {
  get(): Promise<{ accessToken: string; refreshToken: string } | null>;
  set(tokens: { accessToken: string; refreshToken: string }): Promise<void>;
  clear(): Promise<void>;
}

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

/** A file to upload: a browser File/Blob, or on the phone `{ uri, name, type }`. */
export type UploadFile = Blob | { uri: string; name: string; type: string };

export interface ApiOptions {
  baseUrl: string;
  tokens: TokenStore;
  /** Called when the session can't be renewed (logged out elsewhere, blocked, expired). */
  onSessionEnded?: () => void;
  /** The country picked with the country switch; sent with every request so lists only show that country. */
  country?: () => string | null | undefined;
}

export function createApi({ baseUrl, tokens, onSessionEnded, country }: ApiOptions) {
  const root = baseUrl.replace(/\/$/, "");
  let refreshing: Promise<string | null> | null = null;

  async function renew(): Promise<string | null> {
    const current = await tokens.get();
    if (!current) return null;
    try {
      const res = await fetch(`${root}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!res.ok) throw new Error("refresh failed");
      const next = (await res.json()) as { accessToken: string; refreshToken: string };
      await tokens.set(next);
      return next.accessToken;
    } catch {
      await tokens.clear();
      onSessionEnded?.();
      return null;
    }
  }

  async function request<T>(method: string, path: string, body?: unknown, auth = true, as: "json" | "text" = "json"): Promise<T> {
    const send = async (accessToken: string | null) => {
      const headers: Record<string, string> = {};
      const isForm = typeof FormData !== "undefined" && body instanceof FormData;
      if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const c = country?.();
      if (c) headers["X-Country"] = c;
      return fetch(`${root}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      });
    };

    let res: Response;
    try {
      const stored = auth ? await tokens.get() : null;
      res = await send(stored?.accessToken ?? null);
      if (res.status === 401 && auth && stored) {
        // One shared refresh for every request that hit an expired token at once.
        refreshing ??= renew().finally(() => {
          refreshing = null;
        });
        const fresh = await refreshing;
        if (fresh) res = await send(fresh);
      }
    } catch {
      throw new ApiError(0, "Can't reach YanaBuy. Check your internet connection and try again.");
    }

    if (res.status === 204) return undefined as T;
    if (as === "text" && res.ok) return (await res.text()) as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(res.status, (data as { error?: string }).error ?? "Something went wrong", (data as { fields?: Record<string, string> }).fields);
    }
    return data as T;
  }

  const qs = (params: Record<string, string | number | boolean | undefined>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
    const out = s.toString();
    return out ? `?${out}` : "";
  };

  const saveSession = async (res: AuthResponse) => {
    await tokens.set({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    return res;
  };

  return {
    auth: {
      register: (input: { fullName: string; phone: string; password: string; email: string; city?: string }) =>
        request<AuthResponse>("POST", "/api/auth/register", input, false).then(saveSession),
      login: (input: { phone: string; password: string }) =>
        request<AuthResponse>("POST", "/api/auth/login", input, false).then(saveSession),
      /** Forgot password: sends a 6-digit code to the account's email and/or phone. */
      forgotPassword: (phone: string) => request<{ ok: true }>("POST", "/api/auth/forgot-password", { phone }, false),
      /** Sets a new password with the code, and logs in (other devices are logged out). */
      resetPassword: (input: { phone: string; code: string; password: string }) =>
        request<AuthResponse>("POST", "/api/auth/reset-password", input, false).then(saveSession),
      logout: async () => {
        const current = await tokens.get();
        if (current) {
          await request<void>("POST", "/api/auth/logout", { refreshToken: current.refreshToken }, false).catch(() => {});
        }
        await tokens.clear();
      },
    },

    me: {
      get: () => request<{ user: User }>("GET", "/api/me"),
      update: (input: { fullName?: string; city?: string | null; avatarUrl?: string | null }) =>
        request<{ user: User }>("PATCH", "/api/me", input),
      /** Emails a 6-digit code to a new address (or the current one again, if no address is given). */
      sendEmailCode: (email?: string) => request<{ sent: boolean; email: string }>("POST", "/api/me/email", email ? { email } : {}),
      verifyEmail: (code: string) => request<{ user: User }>("POST", "/api/me/email/verify", { code }),
      changePassword: (input: { currentPassword: string; newPassword: string }) =>
        request<void>("POST", "/api/me/password", input),
      /** Orders from the old Shopify store, matched by phone number. */
      shopifyOrders: () => request<{ items: ShopifyOrder[] }>("GET", "/api/me/shopify-orders"),
      wishlist: () => request<{ items: WishlistEntry[] }>("GET", "/api/me/wishlist"),
      wishlistIds: () => request<{ ids: string[] }>("GET", "/api/me/wishlist/ids"),
      save: (productId: string) => request<{ ok: true }>("POST", `/api/me/wishlist/${productId}`),
      unsave: (productId: string) => request<void>("DELETE", `/api/me/wishlist/${productId}`),
      notifications: (before?: string) => request<{ items: AppNotification[]; unread: number }>("GET", `/api/me/notifications${qs({ before })}`),
      unread: () => request<{ unread: number }>("GET", "/api/me/notifications/unread"),
      markRead: (ids?: string[]) => request<{ ok: true }>("POST", "/api/me/notifications/read", { ids }),
      registerPush: (token: string, platform: "ios" | "android" | "web") => request<{ ok: true }>("POST", "/api/me/push-token", { token, platform }),
      unregisterPush: (token: string) => request<void>("DELETE", "/api/me/push-token", { token }),
    },

    uploads: {
      /** Uploads up to 5 images; returns their public URLs in the same order. */
      images: (files: UploadFile[]) => {
        const form = new FormData();
        for (const file of files) form.append("images", file as Blob);
        return request<{ urls: string[] }>("POST", "/api/uploads", form);
      },
      /** ID documents and selfies: kept private, returns keys and short-lived preview links. */
      privateImages: (files: UploadFile[]) => {
        const form = new FormData();
        for (const file of files) form.append("images", file as Blob);
        return request<{ files: PrivateUpload[] }>("POST", "/api/uploads/private", form);
      },
    },

    /** Open to everyone — what the storefronts need. */
    public: {
      portfolio: (slug: string) => request<{ items: PortfolioItem[] }>("GET", `/api/public/shops/${encodeURIComponent(slug)}/portfolio`, undefined, false),
      branding: () => request<{ branding: Branding }>("GET", "/api/public/branding", undefined, false),
      categories: (kind?: CatalogKind) => request<{ items: Category[] }>("GET", `/api/public/categories${qs({ kind })}`, undefined, false),
      banners: (params: { platform: "web" | "app"; mode?: CatalogKind; placement?: "hero" | "strip" }) =>
        request<{ items: Banner[] }>("GET", `/api/public/banners${qs(params)}`, undefined, false),
      products: (query: ProductQuery = {}) => request<Page<ProductCard>>("GET", `/api/public/products${qs({ ...query })}`, undefined, false),
      product: (id: string) => request<{ product: Product; more: ProductCard[] }>("GET", `/api/public/products/${id}`, undefined, false),
      /** The shop directory. */
      shops: (params: { q?: string; mode?: CatalogKind; category?: string; sort?: "popular" | "top_rated" | "newest" | "name"; page?: number; limit?: number } = {}) =>
        request<Page<PublicShop>>("GET", `/api/public/shops${qs(params)}`, undefined, false),
      availability: (slug: string, date: string, productId?: string) =>
        request<{ slots: BookingSlot[] }>("GET", `/api/public/shops/${slug}/availability${qs({ date, productId })}`, undefined, false),
      shopCategories: (mode: CatalogKind) => request<{ items: ShopCategory[] }>("GET", `/api/public/shop-categories${qs({ mode })}`, undefined, false),
      shop: (slug: string) => request<{ shop: PublicShop }>("GET", `/api/public/shops/${encodeURIComponent(slug)}`, undefined, false),
      productReviews: (id: string, page = 1) =>
        request<{ summary: RatingSummary; items: Review[]; total: number }>("GET", `/api/public/products/${id}/reviews${qs({ page })}`, undefined, false),
      shopReviews: (slug: string, page = 1) =>
        request<{ summary: RatingSummary; items: Review[]; total: number }>("GET", `/api/public/shops/${encodeURIComponent(slug)}/reviews${qs({ page })}`, undefined, false),
      bannerClick: (id: string) => request<void>("POST", `/api/public/banners/${id}/click`, undefined, false).catch(() => {}),
    },

    /** Buying: prices for the cart, checkout and the buyer's orders. */
    orders: {
      /** Prices for the cart. Give the delivery area and a discount code to see them in the total. */
      quote: (items: CartItem[], opts: { areaId?: string | null; code?: string | null } = {}) => request<{ quote: Quote }>("POST", "/api/cart/quote", { items, ...opts }),
      place: (input: { items: CartItem[]; delivery: DeliveryDetails; code?: string | null; paymentMethod: PaymentMethod; paymentPhone?: string }) =>
        request<{ orders: Order[]; payment: Payment | null }>("POST", "/api/orders", input),
      payment: (id: string) => request<{ payment: Payment }>("GET", `/api/orders/payments/${id}`),
      lastDelivery: () => request<{ delivery: DeliveryDetails | null }>("GET", "/api/orders/last-delivery"),
      list: (page = 1) => request<{ items: OrderSummary[] }>("GET", `/api/orders${qs({ page })}`),
      get: (id: string) => request<{ order: Order }>("GET", `/api/orders/${id}`),
      cancel: (id: string, reason?: string) => request<{ order: Order }>("POST", `/api/orders/${id}/cancel`, { reason }),
      review: (input: ReviewInput) => request<{ review: Review }>("POST", "/api/reviews", input),
      myReviews: (orderId: string) => request<{ items: (Review & { productId: string })[] }>("GET", `/api/reviews/order/${orderId}`),
      reportProblem: (orderId: string, input: DisputeInput) => request<{ order: Order }>("POST", `/api/orders/${orderId}/dispute`, input),
    },

    /** Messages between buyers and shops. */
    chats: {
      list: () => request<{ items: ConversationSummary[] }>("GET", "/api/chats"),
      unread: () => request<{ count: number }>("GET", "/api/chats/unread"),
      /** Opens (or finds) the chat with a shop, optionally sending a first message. */
      start: (input: { shopId: string } & MessageInput) => request<{ conversation: ConversationSummary }>("POST", "/api/chats", input),
      get: (id: string, after?: string) =>
        request<{ conversation: ConversationSummary; messages: ChatMessage[] }>("GET", `/api/chats/${id}${qs({ after })}`),
      send: (id: string, input: MessageInput) => request<{ message: ChatMessage }>("POST", `/api/chats/${id}/messages`, input),
    },

    /** "Buy it from China for me" requests. */
    sourcing: {
      list: () => request<{ items: SourcingRequest[] }>("GET", "/api/sourcing"),
      get: (id: string) => request<{ request: SourcingRequest; payMethods: PaymentMethod[] }>("GET", `/api/sourcing/${id}`),
      create: (input: SourcingInput) => request<{ request: SourcingRequest }>("POST", "/api/sourcing", input),
      cancel: (id: string) => request<{ request: SourcingRequest }>("POST", `/api/sourcing/${id}/cancel`),
      accept: (id: string, input: { delivery: DeliveryDetails; paymentMethod: PaymentMethod; paymentPhone?: string }) =>
        request<{ request: SourcingRequest; payment: Payment | null }>("POST", `/api/sourcing/${id}/accept`, input),
    },

    /** Riders: their deliveries (and applying to become one). */
    rider: {
      myApplication: () => request<{ application: MyRiderApplication | null }>("GET", "/api/rider-application"),
      apply: (input: RiderApplicationInput) => request<{ application: MyRiderApplication }>("POST", "/api/rider-application", input),
      orders: () => request<{ items: OrderSummary[] }>("GET", "/api/rider/orders"),
      order: (id: string) => request<{ order: Order }>("GET", `/api/rider/orders/${id}`),
      pickedUp: (id: string) => request<{ order: Order }>("POST", `/api/rider/orders/${id}/picked-up`),
      cash: () => request<{ amount: number; orders: number }>("GET", "/api/rider/cash"),
      delivered: (id: string, cashCollected: boolean) => request<{ order: Order }>("POST", `/api/rider/orders/${id}/delivered`, { cashCollected }),
    },

    /** The logged-in person's own shop or restaurant. */
    shop: {
      workProfile: () => request<{ profile: WorkProfile; items: PortfolioItem[] }>("GET", "/api/shop/work-profile"),
      saveWorkProfile: (profile: WorkProfile) => request<{ profile: WorkProfile }>("PUT", "/api/shop/work-profile", profile),
      addPortfolio: (input: PortfolioInput) => request<{ item: PortfolioItem }>("POST", "/api/shop/portfolio", input),
      updatePortfolio: (id: string, input: Partial<PortfolioInput>) => request<{ item: PortfolioItem }>("PATCH", `/api/shop/portfolio/${id}`, input),
      deletePortfolio: (id: string) => request<void>("DELETE", `/api/shop/portfolio/${id}`),
      movePortfolio: (id: string, direction: "up" | "down") => request<{ items: PortfolioItem[] }>("POST", `/api/shop/portfolio/${id}/move`, { direction }),
      mine: () => request<{ shop: MyShop | null }>("GET", "/api/shop/mine"),
      apply: (input: ShopApplication) => request<{ shop: MyShop }>("POST", "/api/shop/apply", input),
      update: (input: Partial<Pick<Shop, "name" | "description" | "phone" | "city" | "address" | "logoUrl" | "coverUrl" | "categoryId" | "hours">>) =>
        request<{ shop: MyShop }>("PATCH", "/api/shop/mine", input),
      products: () => request<{ items: MyProduct[] }>("GET", "/api/shop/products"),
      product: (id: string) => request<{ product: MyProduct }>("GET", `/api/shop/products/${id}`),
      createProduct: (input: ProductInput) => request<{ product: MyProduct }>("POST", "/api/shop/products", input),
      updateProduct: (id: string, input: Partial<ProductInput> & { hidden?: boolean }) =>
        request<{ product: MyProduct; needsReview: boolean }>("PATCH", `/api/shop/products/${id}`, input),
      deleteProduct: (id: string) => request<void>("DELETE", `/api/shop/products/${id}`),
      orders: (view: "active" | "done" = "active") => request<{ items: OrderSummary[] }>("GET", `/api/shop/orders${qs({ view })}`),
      order: (id: string) => request<{ order: Order }>("GET", `/api/shop/orders/${id}`),
      acceptOrder: (id: string) => request<{ order: Order }>("POST", `/api/shop/orders/${id}/accept`),
      orderReady: (id: string) => request<{ order: Order }>("POST", `/api/shop/orders/${id}/ready`),
      rejectOrder: (id: string, reason: string) => request<{ order: Order }>("POST", `/api/shop/orders/${id}/reject`, { reason }),
      wallet: () => request<{ wallet: Wallet }>("GET", "/api/shop/wallet"),
      savePayoutDetails: (input: PayoutDetails) => request<{ payoutDetails: PayoutDetails }>("PUT", "/api/shop/wallet/payout-details", input),
      requestPayout: (amount: number) => request<{ payout: Payout }>("POST", "/api/shop/wallet/payouts", { amount }),
      reviews: () => request<{ summary: RatingSummary; items: Review[] }>("GET", "/api/shop/reviews"),
      replyToReview: (id: string, reply: string) => request<{ review: Review }>("POST", `/api/shop/reviews/${id}/reply`, { reply }),
      respondToDispute: (orderId: string, response: string) => request<{ order: Order }>("POST", `/api/shop/orders/${orderId}/dispute-response`, { response }),
    },

    /** Booking a table or an appointment. */
    bookings: {
      create: (input: BookingInput) => request<{ booking: Booking }>("POST", "/api/bookings", input),
      mine: () => request<{ items: Booking[] }>("GET", "/api/bookings"),
      get: (id: string) => request<{ booking: Booking }>("GET", `/api/bookings/${id}`),
      cancel: (id: string, reason?: string) => request<{ booking: Booking }>("POST", `/api/bookings/${id}/cancel`, { reason }),
      /** For the shop: */
      forShop: (view: "upcoming" | "requests" | "past" | "all" = "upcoming") => request<{ items: Booking[] }>("GET", `/api/shop/bookings${qs({ view })}`),
      step: (id: string, step: "confirm" | "decline" | "complete" | "no-show" | "cancel", reason?: string) =>
        request<{ booking: Booking }>("POST", `/api/shop/bookings/${id}/${step}`, { reason }),
      settings: () => request<{ settings: BookingSettings }>("GET", "/api/shop/bookings/settings"),
      saveSettings: (settings: BookingSettings) => request<{ settings: BookingSettings }>("PUT", "/api/shop/bookings/settings", settings),
    },

    admin: {
      stats: () => request<AdminStats>("GET", "/api/admin/stats"),
      users: (params: { role?: UserRole; status?: "active" | "blocked"; q?: string; page?: number } = {}) =>
        request<Page<AdminUser>>("GET", `/api/admin/users${qs(params)}`),
      user: (id: string) => request<{ user: AdminUser; shop: Shop | null; stats: { orders: number } }>("GET", `/api/admin/users/${id}`),
      setRole: (id: string, role: UserRole) => request<{ user: AdminUser }>("PATCH", `/api/admin/users/${id}/role`, { role }),
      block: (id: string, reason: string) => request<{ user: AdminUser }>("POST", `/api/admin/users/${id}/block`, { reason }),
      unblock: (id: string) => request<{ user: AdminUser }>("POST", `/api/admin/users/${id}/unblock`),
      auditLog: (page = 1) => request<Page<AuditEntry>>("GET", `/api/admin/audit-log${qs({ page })}`),

      shops: (params: { status?: ShopStatus; kind?: ShopKind; q?: string; page?: number; country?: Country } = {}) =>
        request<Page<AdminShop>>("GET", `/api/admin/shops${qs(params)}`),
      shop: (id: string) => request<{ shop: AdminShop }>("GET", `/api/admin/shops/${id}`),
      approveShop: (id: string) => request<{ shop: AdminShop }>("POST", `/api/admin/shops/${id}/approve`),
      rejectShop: (id: string, reason: string) => request<{ shop: AdminShop }>("POST", `/api/admin/shops/${id}/reject`, { reason }),
      suspendShop: (id: string, reason: string) => request<{ shop: AdminShop }>("POST", `/api/admin/shops/${id}/suspend`, { reason }),
      reinstateShop: (id: string) => request<{ shop: AdminShop }>("POST", `/api/admin/shops/${id}/reinstate`),
      setShopCountry: (id: string, country: Country) => request<{ shop: AdminShop }>("POST", `/api/admin/shops/${id}/country`, { country }),
      /** Give a shop brought over from Shopify to its real owner (who has signed up with this phone). */
      handOverShop: (id: string, phone: string) =>
        request<{ ok: true; owner: { id: string; fullName: string; phone: string } }>("POST", `/api/admin/shops/${id}/handover`, { phone }),

      broadcasts: () => request<{ items: Broadcast[] }>("GET", "/api/admin/broadcasts"),
      previewBroadcast: (input: Pick<BroadcastInput, "audience" | "userId" | "country">) => request<{ preview: BroadcastPreview }>("POST", "/api/admin/broadcasts/preview", input),
      sendBroadcast: (input: BroadcastInput) => request<{ broadcast: Broadcast }>("POST", "/api/admin/broadcasts", input),
      bookings: (status?: BookingStatus) => request<{ items: Booking[] }>("GET", `/api/admin/bookings${qs({ status })}`),
      discounts: () => request<{ items: DiscountCode[] }>("GET", "/api/admin/discounts"),
      createDiscount: (input: DiscountCodeInput) => request<{ discount: DiscountCode }>("POST", "/api/admin/discounts", input),
      updateDiscount: (id: string, input: Partial<DiscountCodeInput>) => request<{ discount: DiscountCode }>("PATCH", `/api/admin/discounts/${id}`, input),
      deleteDiscount: (id: string) => request<void>("DELETE", `/api/admin/discounts/${id}`),

      shopifySummary: () => request<{ summary: ShopifySummary }>("GET", "/api/admin/shopify/summary"),
      shopifyOrders: (params: { q?: string; page?: number } = {}) => request<Page<ShopifyOrder>>("GET", `/api/admin/shopify/orders${qs(params)}`),
      shopifyContacts: (params: { q?: string; page?: number } = {}) => request<Page<ShopifyContact>>("GET", `/api/admin/shopify/contacts${qs(params)}`),
      /** The full contact list as CSV text (for a spreadsheet). */
      shopifyContactsCsv: () => request<string>("GET", "/api/admin/shopify/contacts.csv", undefined, true, "text"),

      products: (params: { status?: ProductStatus; q?: string; shop?: string; page?: number } = {}) =>
        request<Page<AdminProduct>>("GET", `/api/admin/products${qs(params)}`),
      product: (id: string) => request<{ product: AdminProduct }>("GET", `/api/admin/products/${id}`),
      approveProduct: (id: string) => request<{ product: AdminProduct }>("POST", `/api/admin/products/${id}/approve`),
      rejectProduct: (id: string, reason: string) => request<{ product: AdminProduct }>("POST", `/api/admin/products/${id}/reject`, { reason }),
      removeProduct: (id: string, reason: string) => request<{ product: AdminProduct }>("POST", `/api/admin/products/${id}/remove`, { reason }),
      restoreProduct: (id: string) => request<{ product: AdminProduct }>("POST", `/api/admin/products/${id}/restore`),
      featureProduct: (id: string, featured: boolean) => request<{ product: AdminProduct }>("POST", `/api/admin/products/${id}/feature`, { featured }),

      orders: (params: { view?: string; q?: string; page?: number } = {}) => request<Page<OrderSummary>>("GET", `/api/admin/orders${qs(params)}`),
      order: (id: string) => request<{ order: Order }>("GET", `/api/admin/orders/${id}`),
      assignRider: (id: string, riderId: string | null) => request<{ order: Order }>("POST", `/api/admin/orders/${id}/assign`, { riderId }),
      cancelOrder: (id: string, reason: string) => request<{ order: Order }>("POST", `/api/admin/orders/${id}/cancel`, { reason }),
      riders: () => request<{ items: RiderSummary[] }>("GET", "/api/admin/riders"),
      delivery: () => request<{ delivery: DeliverySettings; ready: PaymentMethod[] }>("GET", "/api/admin/settings/delivery"),
      money: () => request<{ overview: MoneyOverview }>("GET", "/api/admin/money"),
      finance: () => request<{ finance: FinanceSettings }>("GET", "/api/admin/settings/finance"),
      saveFinance: (input: FinanceSettings) => request<{ finance: FinanceSettings }>("PUT", "/api/admin/settings/finance", input),
      payouts: (status: "requested" | "paid" | "rejected" | "all" = "requested") => request<{ items: Payout[] }>("GET", `/api/admin/payouts${qs({ status })}`),
      markPayoutPaid: (id: string, reference: string) => request<{ payout: Payout }>("POST", `/api/admin/payouts/${id}/paid`, { reference }),
      rejectPayout: (id: string, reason: string) => request<{ payout: Payout }>("POST", `/api/admin/payouts/${id}/reject`, { reason }),
      balances: () => request<{ items: ShopBalance[] }>("GET", "/api/admin/balances"),
      shopWallet: (id: string) => request<{ balance: number; entries: WalletEntry[] }>("GET", `/api/admin/shops/${id}/wallet`),
      adjustWallet: (id: string, amount: number, note: string) =>
        request<{ balance: number; entries: WalletEntry[] }>("POST", `/api/admin/shops/${id}/adjust`, { amount, note }),
      riderCash: () => request<{ items: RiderCash[] }>("GET", "/api/admin/rider-cash"),
      cashReceived: (riderId: string, orderIds: string[]) =>
        request<{ received: number; orders: number }>("POST", `/api/admin/rider-cash/${riderId}/received`, { orderIds }),
      saveDelivery: (input: DeliverySettings) => request<{ delivery: DeliverySettings }>("PUT", "/api/admin/settings/delivery", input),

      categories: () => request<{ items: Category[] }>("GET", "/api/admin/categories"),
      createCategory: (input: { kind: CatalogKind; name: string; iconUrl?: string | null; visible?: boolean }) =>
        request<{ category: Category }>("POST", "/api/admin/categories", input),
      updateCategory: (id: string, input: { name?: string; iconUrl?: string | null; visible?: boolean }) =>
        request<{ category: Category }>("PATCH", `/api/admin/categories/${id}`, input),
      deleteCategory: (id: string) => request<void>("DELETE", `/api/admin/categories/${id}`),
      reorderCategories: (ids: string[]) => request<{ items: Category[] }>("POST", "/api/admin/categories/reorder", { ids }),

      banners: () => request<{ items: AdminBanner[] }>("GET", "/api/admin/banners"),
      createBanner: (input: BannerInput) => request<{ banner: AdminBanner }>("POST", "/api/admin/banners", input),
      updateBanner: (id: string, input: Partial<BannerInput>) => request<{ banner: AdminBanner }>("PATCH", `/api/admin/banners/${id}`, input),
      deleteBanner: (id: string) => request<void>("DELETE", `/api/admin/banners/${id}`),
      reorderBanners: (ids: string[]) => request<{ items: AdminBanner[] }>("POST", "/api/admin/banners/reorder", { ids }),

      reviews: (params: { q?: string; hidden?: boolean; page?: number } = {}) => request<Page<AdminReview>>("GET", `/api/admin/reviews${qs(params)}`),
      hideReview: (id: string, reason: string) => request<{ review: AdminReview }>("POST", `/api/admin/reviews/${id}/hide`, { reason }),
      unhideReview: (id: string) => request<{ review: AdminReview }>("POST", `/api/admin/reviews/${id}/unhide`),

      chats: (params: { q?: string; page?: number } = {}) => request<Page<AdminConversation>>("GET", `/api/admin/chats${qs(params)}`),
      chat: (id: string) => request<{ conversation: AdminConversation; messages: ChatMessage[] }>("GET", `/api/admin/chats/${id}`),
      chatNote: (id: string, body: string) => request<{ message: ChatMessage }>("POST", `/api/admin/chats/${id}/messages`, { body }),

      disputes: (status: "open" | "resolved" | "all" = "open") => request<{ items: AdminDispute[] }>("GET", `/api/admin/disputes${qs({ status })}`),
      dispute: (id: string) => request<{ dispute: AdminDispute; order: Order }>("GET", `/api/admin/disputes/${id}`),
      resolveDispute: (id: string, input: DisputeDecision) => request<{ dispute: AdminDispute }>("POST", `/api/admin/disputes/${id}/resolve`, input),

      sourcing: (status: "open" | "done" | "all" = "open") => request<{ items: SourcingRequest[] }>("GET", `/api/admin/sourcing${qs({ status })}`),
      sourcingRequest: (id: string) => request<{ request: SourcingRequest }>("GET", `/api/admin/sourcing/${id}`),
      quoteSourcing: (id: string, input: { price: number; days: number; note?: string | null }) =>
        request<{ request: SourcingRequest }>("POST", `/api/admin/sourcing/${id}/quote`, input),
      rejectSourcing: (id: string, reason: string) => request<{ request: SourcingRequest }>("POST", `/api/admin/sourcing/${id}/reject`, { reason }),
      moveSourcing: (id: string, status: SourcingStatus, note?: string | null) =>
        request<{ request: SourcingRequest }>("POST", `/api/admin/sourcing/${id}/status`, { status, note }),

      riderApplications: (status: RiderApplicationStatus | "all" = "pending") =>
        request<{ items: AdminRiderApplication[] }>("GET", `/api/admin/rider-applications${qs({ status })}`),
      riderApplication: (id: string) => request<{ application: AdminRiderApplication }>("GET", `/api/admin/rider-applications/${id}`),
      approveRider: (id: string) => request<{ application: AdminRiderApplication }>("POST", `/api/admin/rider-applications/${id}/approve`),
      rejectRider: (id: string, reason: string) => request<{ application: AdminRiderApplication }>("POST", `/api/admin/rider-applications/${id}/reject`, { reason }),
      suspendRider: (id: string, reason: string) => request<{ application: AdminRiderApplication }>("POST", `/api/admin/rider-applications/${id}/suspend`, { reason }),
      reinstateRider: (id: string) => request<{ application: AdminRiderApplication }>("POST", `/api/admin/rider-applications/${id}/reinstate`),

      branding: () => request<{ branding: Branding }>("GET", "/api/admin/branding"),
      saveBranding: (input: Omit<Branding, "updatedAt">) => request<{ branding: Branding }>("PUT", "/api/admin/branding", input),
    },
  };
}

export type Api = ReturnType<typeof createApi>;
