import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { bookingNumber, DEFAULT_BOOKING_SETTINGS, type Booking, type BookingSettings, type BookingSlot } from "@yanabuy/shared";
import { db } from "../db/client";
import { bookings, shops, type ShopRow } from "../db/schema";

type BookingRow = typeof bookings.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const settingsOf = (s: ShopRow): BookingSettings => ({ ...DEFAULT_BOOKING_SETTINGS, ...(s.bookingSettings ?? {}) });

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Bookings that still hold their place. */
const HOLDING = ["requested", "confirmed"] as const;

/**
 * Start times for one day ("YYYY-MM-DD"), with how many places are left.
 * Liberia is on UTC all year, so local time = UTC.
 */
export async function slotsFor(shop: ShopRow, date: string, durationMinutes?: number | null, q: Pick<typeof db, "select"> = db): Promise<BookingSlot[]> {
  const s = settingsOf(shop);
  if (!s.enabled) return [];
  const day = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || !s.days.includes(day.getUTCDay())) return [];
  const now = Date.now();
  if (day.getTime() > now + s.daysAhead * 86400_000) return [];
  const length = durationMinutes && durationMinutes > 0 ? durationMinutes : s.slotMinutes;
  const open = toMinutes(s.opens);
  const close = toMinutes(s.closes);
  const starts: number[] = [];
  for (let m = open; m + length <= close; m += s.slotMinutes) starts.push(m);
  if (!starts.length) return [];

  const dayEnd = new Date(day.getTime() + 86400_000);
  const taken = await q
    .select({ startsAt: bookings.startsAt, durationMinutes: bookings.durationMinutes })
    .from(bookings)
    .where(and(eq(bookings.shopId, shop.id), inArray(bookings.status, [...HOLDING]), lt(bookings.startsAt, dayEnd), gt(sql`${bookings.startsAt} + make_interval(mins => ${bookings.durationMinutes})`, day)));

  return starts
    .map((m) => {
      const start = day.getTime() + m * 60_000;
      const end = start + length * 60_000;
      const overlapping = taken.filter((b) => b.startsAt.getTime() < end && b.startsAt.getTime() + b.durationMinutes * 60_000 > start).length;
      return { time: hhmm(m), startsAt: new Date(start).toISOString(), left: Math.max(0, s.perSlot - overlapping), start };
    })
    .filter((x) => x.start >= now + s.leadHours * 3600_000)
    .map(({ start: _s, ...x }) => x);
}

/** Only one booking request for a shop is worked out at a time, so the last place can't be taken twice. */
export async function lockShop(tx: Tx, shopId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${shopId}))`);
}

export function bookingOut(b: BookingRow, shop: ShopRow, buyer: { id: string; fullName: string; phone: string | null; avatarUrl: string | null }): Booking {
  return {
    id: b.id,
    number: bookingNumber(b.number ?? 0),
    kind: b.kind,
    status: b.status,
    startsAt: b.startsAt.toISOString(),
    durationMinutes: b.durationMinutes,
    partySize: b.partySize,
    contactName: b.contactName,
    contactPhone: b.contactPhone,
    note: b.note,
    statusNote: b.statusNote,
    product: b.productId ? { id: b.productId, name: b.productName ?? "" } : null,
    shop: { id: shop.id, name: shop.name, slug: shop.slug, kind: shop.kind, city: shop.city, logoUrl: shop.logoUrl, country: shop.country, phone: shop.phone, address: shop.address },
    buyer,
    createdAt: b.createdAt.toISOString(),
    respondedAt: b.respondedAt?.toISOString() ?? null,
  };
}

/** "Sat 18 Oct, 14:30" */
export const when = (d: Date) =>
  `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}, ${d.toISOString().slice(11, 16)}`;

export const shopById = async (id: string) => (await db.select().from(shops).where(eq(shops.id, id)).limit(1))[0];
