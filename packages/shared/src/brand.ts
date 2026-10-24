import type { BrandColors, Branding, DisputeOutcome, DisputeReason, Fulfilment, IdDocumentType, OrderStatus, PaymentMethod, PayoutSchedule, RiderVehicle, ShopKind, ShopStatus, SourcingStatus } from "./types";
import { colors } from "./theme";

export const DEFAULT_COLORS: BrandColors = {
  primary: colors.purple,
  ink: colors.ink,
  goods: colors.amber,
  food: colors.orange,
};

export const DEFAULT_BRANDING: Branding = {
  appName: "YanaBuy",
  tagline: "Shop, sell and order food in Liberia",
  logoUrl: null,
  faviconUrl: null,
  colors: DEFAULT_COLORS,
  updatedAt: null,
};

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]) {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Blends `hex` toward `toward` by `amount` (0 = unchanged, 1 = fully `toward`). */
export function mix(hex: string, toward: string, amount: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  return rgbToHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as [number, number, number]);
}

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1–21). 4.5+ is comfortable for text. */
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every shade the apps use, worked out from the four brand colours. */
export function brandPalette(c: BrandColors) {
  const same = (x: string, y: string) => x.toUpperCase() === y.toUpperCase();
  return {
    ink: c.ink,
    purple: c.primary,
    purpleLight: same(c.primary, colors.purple) ? colors.purpleLight : mix(c.primary, "#FFFFFF", 0.22),
    purpleTint: same(c.primary, colors.purple) ? colors.purpleTint : mix(c.primary, "#FFFFFF", 0.88),
    amber: c.goods,
    amberTint: same(c.goods, colors.amber) ? colors.warnTint : mix(c.goods, "#FFFFFF", 0.84),
    orange: c.food,
    orangeTint: same(c.food, colors.orange) ? "#FFE7D6" : mix(c.food, "#FFFFFF", 0.84),
  };
}

/** CSS variables (space-separated RGB) for the Tailwind colours on web and admin. */
export function brandCssVars(c: BrandColors) {
  const p = brandPalette(c);
  const v = (hex: string) => hexToRgb(hex).join(" ");
  return [
    `--c-ink:${v(p.ink)}`,
    `--c-purple:${v(p.purple)}`,
    `--c-purple-light:${v(p.purpleLight)}`,
    `--c-purple-tint:${v(p.purpleTint)}`,
    `--c-amber:${v(p.amber)}`,
    `--c-amber-tint:${v(p.amberTint)}`,
    `--c-orange:${v(p.orange)}`,
    `--c-orange-tint:${v(p.orangeTint)}`,
  ].join(";");
}

export const ID_TYPE_LABEL: Record<IdDocumentType, string> = {
  national_id: "National ID card",
  passport: "Passport",
  drivers_license: "Driver's licence",
  voter_card: "Voter's card",
};

export const SHOP_KIND_LABEL: Record<ShopKind, string> = { store: "Shop", restaurant: "Restaurant" };

/** "Flash sale ends in…" choices on the product form (hours). */
export const FLASH_SALE_HOURS = [6, 12, 24, 48, 72, 168] as const;
export const flashSaleLabel = (h: number) => (h < 24 ? `${h} hours` : h === 168 ? "1 week" : `${h / 24} ${h === 24 ? "day" : "days"}`);

/** What to send for the sale end, from the form's choice ("keep" = leave as it is, "none" = no end, or a number of hours). */
export function saleEndsFromChoice(choice: string, hasOldPrice: boolean): string | null | undefined {
  if (!hasOldPrice || choice === "none") return null;
  if (choice === "keep") return undefined;
  return new Date(Date.now() + Number(choice) * 3600_000).toISOString();
}

/** Goods & services shop with a cart; food is ordered from restaurants. One set of words for each. */
export const BUY_WORDS = {
  goods: { add: "Add to cart", added: "Added to your cart", go: "Go to cart", now: "Buy now", basket: "Cart", yourBasket: "Your cart", seller: "Shop", sellers: "Shops" },
  food: { add: "Add to order", added: "Added to your order", go: "Go to my order", now: "Order now", basket: "Order", yourBasket: "Your order", seller: "Restaurant", sellers: "Restaurants" },
} as const;

export const SHOP_STATUS_LABEL: Record<ShopStatus, string> = {
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Needs changes",
  suspended: "Suspended",
};



/** `<style>` contents that set the brand colour variables for web and admin. */
export function brandingCss(b: Branding) {
  return `:root{${brandCssVars(b.colors)}}`;
}

/**
 * Fetches branding for the first paint (web/admin server side, phone at start).
 * Gives up after `timeoutMs` and falls back to YanaBuy's defaults.
 */
export async function fetchBranding(apiUrl: string, timeoutMs = 1500): Promise<Branding> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/public/branding`, {
      signal: controller.signal,
      cache: "no-store",
    } as RequestInit);
    if (!res.ok) return DEFAULT_BRANDING;
    const data = (await res.json()) as { branding: Branding };
    return data.branding;
  } catch {
    return DEFAULT_BRANDING;
  } finally {
    clearTimeout(timer);
  }
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: "Waiting for payment",
  placed: "Waiting for the shop",
  accepted: "Being prepared",
  ready: "Ready for pickup",
  picked_up: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** The status words for eat-in and pickup orders (no rider, the buyer comes to the restaurant). */
export function orderStatusLabel(status: OrderStatus, fulfilment: Fulfilment = "delivery"): string {
  if (fulfilment === "eat_in") return status === "ready" ? "Ready to serve" : status === "delivered" ? "Served" : ORDER_STATUS_LABEL[status];
  if (fulfilment === "pickup") return status === "ready" ? "Ready to collect" : status === "delivered" ? "Collected" : ORDER_STATUS_LABEL[status];
  return ORDER_STATUS_LABEL[status];
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cod: "Cash on delivery",
  mtn_momo: "MTN Mobile Money",
  orange_money: "Orange Money",
  card: "Card payment",
};

/** "YB-10001" */
export const orderNumber = (n: number | string) => `YB-${n}`;

export const PAYOUT_METHOD_LABEL = { mtn_momo: "MTN Mobile Money", orange_money: "Orange Money" } as const;
export const payoutNumber = (n: number | string) => `PO-${n}`;
export const PAYOUT_SCHEDULE_LABEL: Record<PayoutSchedule, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", on_request: "When they ask" };

/** What buyers pay for an item: the seller's price with YanaBuy's commission added on top (whole cents). */
export const withCommission = (sellerCents: number, ratePercent: number) => Math.round((sellerCents * (100 + ratePercent)) / 100);
export const RIDER_VEHICLE_LABEL: Record<RiderVehicle, string> = {
  motorbike: "Motorbike",
  keke: "Keke (tricycle)",
  car: "Car",
  bicycle: "Bicycle",
  on_foot: "On foot",
};

/** Vehicles that need a driver's licence photo. */
export const RIDER_NEEDS_LICENSE: RiderVehicle[] = ["motorbike", "keke", "car"];

/** Vehicles that can take a heavy order (over the admin's "needs a keke or car" weight). */
export const HEAVY_VEHICLES: RiderVehicle[] = ["keke", "car"];
/** Can a rider on this vehicle take the order? Light orders: anyone. Heavy: keke or car only. */
export const vehicleCanCarry = (vehicle: string | null | undefined, heavy: boolean) => !heavy || (HEAVY_VEHICLES as string[]).includes(vehicle ?? "");

export const disputeNumber = (n: number | string) => `DP-${n}`;
export const sourcingNumber = (n: number | string) => `CS-${n}`;

export const DISPUTE_REASON_LABEL: Record<DisputeReason, string> = {
  not_received: "I didn't get it",
  wrong_item: "Wrong item",
  damaged: "Damaged or broken",
  not_as_described: "Not as described",
  missing_items: "Items missing",
  other: "Something else",
};

export const DISPUTE_OUTCOME_LABEL: Record<DisputeOutcome, string> = {
  refund_full: "Full refund",
  refund_partial: "Part refund",
  no_refund: "No refund",
};

/** How many days after delivery a buyer can report a problem. */
export const DISPUTE_DAYS = 7;

export const SOURCING_STATUS_LABEL: Record<SourcingStatus, string> = {
  pending: "Waiting for a quote",
  quoted: "Quote ready",
  accepted: "Accepted",
  ordered: "Ordered from China",
  shipped: "Shipped to Liberia",
  arrived: "Arrived in Liberia",
  delivered: "Delivered",
  rejected: "Couldn't source",
  cancelled: "Cancelled",
};

/** The steps a China request goes through once accepted. */
export const SOURCING_STEPS: SourcingStatus[] = ["accepted", "ordered", "shipped", "arrived", "delivered"];

/** Short name for reviews: "Grace Wleh" → "Grace W." */
export function shortName(full: string) {
  const [first, ...rest] = full.trim().split(/\s+/);
  const last = rest.pop();
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}
