import { asc, eq } from "drizzle-orm";
import { sourcingNumber, type PersonContact, type SourcingRequest } from "@yanabuy/shared";
import { db } from "../db/client";
import { sourcingEvents, sourcingRequests, users, type SourcingRow } from "../db/schema";
import { HttpError } from "./http";

export async function sourcingOut(r: SourcingRow, opts: { withBuyer?: boolean } = {}): Promise<SourcingRequest> {
  const [events, buyer] = await Promise.all([
    db
      .select({ status: sourcingEvents.status, note: sourcingEvents.note, createdAt: sourcingEvents.createdAt })
      .from(sourcingEvents)
      .where(eq(sourcingEvents.requestId, r.id))
      .orderBy(asc(sourcingEvents.createdAt)),
    opts.withBuyer
      ? db
          .select({ id: users.id, fullName: users.fullName, phone: users.phone, avatarUrl: users.avatarUrl })
          .from(users)
          .where(eq(users.id, r.buyerId))
          .then((x) => x[0] as PersonContact | undefined)
      : Promise.resolve(undefined),
  ]);
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return {
    id: r.id,
    number: sourcingNumber(r.number ?? 0),
    status: r.status,
    link: r.link,
    description: r.description,
    quantity: r.quantity,
    budget: r.budget,
    images: r.images,
    quotePrice: r.quotePrice,
    quoteDays: r.quoteDays,
    quoteNote: r.quoteNote,
    quotedAt: iso(r.quotedAt),
    rejectReason: r.rejectReason,
    paymentMethod: r.paymentMethod,
    paymentStatus: r.paymentStatus,
    paidAt: iso(r.paidAt),
    delivery:
      r.deliveryName && r.deliveryPhone && r.deliveryCity && r.deliveryAddress
        ? { name: r.deliveryName, phone: r.deliveryPhone, city: r.deliveryCity, address: r.deliveryAddress, note: null }
        : null,
    events: events.map((e) => ({ status: e.status, note: e.note, createdAt: e.createdAt.toISOString() })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    ...(buyer ? { buyer } : {}),
  };
}

export async function loadSourcing(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Request not found");
  const [r] = await db.select().from(sourcingRequests).where(eq(sourcingRequests.id, id)).limit(1);
  if (!r) throw new HttpError(404, "Request not found");
  return r;
}

export async function sourcingEvent(requestId: string, status: string, byUserId: string, note?: string | null) {
  await db.insert(sourcingEvents).values({ requestId, status, byUserId, note: note ?? null });
}
