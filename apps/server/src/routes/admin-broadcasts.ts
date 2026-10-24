import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, gt, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { COUNTRY_CODES, LIVE_MINUTES, SMS_PRICE_USD, distanceKm, type Broadcast, type BroadcastInput, type BroadcastPreview, type GeoPoint } from "@yanabuy/shared";
import { db } from "../db/client";
import { broadcasts, shops, users } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { deliver, smsFor } from "../lib/notify";
import { getBranding } from "../lib/branding";
import { shopPoint } from "../lib/locations";
import { emailReady, smsReady, webLink } from "../lib/outbound";
import { requiredText } from "../lib/validation";

/**
 * Admins sending a message — everyday news or something urgent — to buyers,
 * vendors, riders (or just riders online now), everyone, people picked by hand,
 * or only people near a shop. Mounted under /api/admin.
 */
export const adminBroadcastsRouter = Router();

const target = z.object({
  audience: z.enum(["everyone", "buyers", "vendors", "riders", "online_riders", "people", "user"], { errorMap: () => ({ message: "Choose who gets it" }) }),
  userId: z.string().uuid("Choose the person").nullish(),
  userIds: z.array(z.string().uuid()).max(500, "Pick 500 people or fewer").nullish(),
  country: z.enum(COUNTRY_CODES).nullish(),
  near: z
    .object({ shopId: z.string().uuid("Choose the shop"), radiusKm: z.number().positive("Enter a distance").max(200, "200 km at most") })
    .nullish(),
  urgent: z.boolean().optional().default(false),
});

const link = z
  .string()
  .trim()
  .max(300)
  .nullish()
  .transform((v) => v || null)
  .refine((v) => v === null || /^\/[^\s]*$/.test(v), "Use a page on YanaBuy, starting with / (e.g. /shops)");

const sendSchema = target.extend({
  title: requiredText(2, 120, "Title"),
  body: requiredText(2, 1000, "Message"),
  link,
  channels: z.object({ app: z.boolean(), email: z.boolean(), sms: z.boolean() }),
});

const previewSchema = target.extend({
  title: z.string().trim().max(120).nullish(),
  body: z.string().trim().max(1000).nullish(),
  link: z.string().trim().max(300).nullish(),
});

type Target = z.infer<typeof target>;

/** Shops decide a seller's country; everyone else's comes from their phone number. */
const country = sql<string>`coalesce(${shops.country}, case when ${users.phone} like '+1%' then 'US' else 'LR' end)`;

/** The shop a "near" message measures from. */
async function nearShop(t: Target) {
  if (!t.near || t.audience === "people" || t.audience === "user") return null;
  const [shop] = await db.select().from(shops).where(eq(shops.id, t.near.shopId)).limit(1);
  if (!shop) throw new HttpError(400, "That shop wasn't found", { near: "Choose the shop" });
  return { shop, point: await shopPoint(shop), radiusKm: t.near.radiusKm };
}

/** Who a message goes to: active, signed-up accounts (admins only when picked by hand). */
async function recipients(t: Target) {
  if (t.audience === "user" && !t.userId) throw new HttpError(400, "Choose the person", { userId: "Choose the person" });
  if (t.audience === "people" && !t.userIds?.length) throw new HttpError(400, "Pick at least one person", { userIds: "Pick at least one person" });
  const filters: SQL[] = [eq(users.status, "active"), eq(users.unclaimed, false), isNull(users.deletedAt)];
  if (t.audience === "user") filters.push(eq(users.id, t.userId!));
  else if (t.audience === "people") filters.push(inArray(users.id, [...new Set(t.userIds!)]));
  else {
    filters.push(ne(users.role, "admin"));
    if (t.audience === "online_riders") {
      filters.push(eq(users.role, "rider"), eq(users.riderOnline, true), gt(users.locatedAt, new Date(Date.now() - LIVE_MINUTES * 60_000)));
    } else if (t.audience !== "everyone") {
      filters.push(eq(users.role, t.audience === "buyers" ? "buyer" : t.audience === "vendors" ? "vendor" : "rider"));
    }
    if (t.country) filters.push(sql`${country} = ${t.country}`);
  }
  const near = await nearShop(t);
  let people = await db
    .select({ id: users.id, email: users.email, verified: users.emailVerifiedAt, phone: users.phone, lat: users.lat, lng: users.lng, country })
    .from(users)
    .leftJoin(shops, eq(shops.ownerId, users.id))
    .where(and(...filters));
  // One row per person, even if they own more than one shop.
  people = [...new Map(people.map((p) => [p.id, p])).values()];
  if (near) {
    if (!near.point) throw new HttpError(400, "That shop has no spot on the map yet — pick another shop or ask them to set their location", { near: "No map spot" });
    const from: GeoPoint = near.point;
    people = people.filter((p) => p.lat != null && p.lng != null && distanceKm(from, { lat: p.lat, lng: p.lng }) <= near.radiusKm);
  }
  return { people, near };
}

const smsCost = (people: { phone: string | null; country: string }[]) =>
  Math.round(people.reduce((sum, p) => sum + (p.phone ? SMS_PRICE_USD[p.country === "US" ? "US" : "LR"] : 0), 0) * 100) / 100;

const smsTitle = (title: string, urgent: boolean) => (urgent ? `URGENT: ${title}` : title);

adminBroadcastsRouter.post("/broadcasts/preview", async (req, res) => {
  const input = parse(previewSchema, req.body);
  const { people, near } = await recipients(input);
  const { appName } = await getBranding();
  const preview: BroadcastPreview = {
    recipients: people.length,
    withEmail: people.filter((p) => p.email && p.verified).length,
    withPhone: people.filter((p) => p.phone).length,
    emailOn: emailReady(),
    smsOn: smsReady(),
    smsSample: input.title ? smsFor(appName, { title: smsTitle(input.title, input.urgent), body: input.body || null }, webLink(input.link || null)) : null,
    smsCostUsd: smsCost(people),
    nearShop: near ? { id: near.shop.id, name: near.shop.name, located: !!near.point } : null,
  };
  res.json({ preview });
});

const sender = alias(users, "broadcast_sender");
const person = alias(users, "broadcast_person");

async function list(where?: SQL) {
  const rows = await db
    .select({ b: broadcasts, by: { id: sender.id, fullName: sender.fullName }, to: { id: person.id, fullName: person.fullName } })
    .from(broadcasts)
    .leftJoin(sender, eq(sender.id, broadcasts.sentById))
    .leftJoin(person, eq(person.id, broadcasts.userId))
    .where(where)
    .orderBy(desc(broadcasts.createdAt))
    .limit(50);
  return rows.map(
    (r): Broadcast => ({
      id: r.b.id,
      title: r.b.title,
      body: r.b.body,
      link: r.b.link,
      audience: r.b.audience as Broadcast["audience"],
      country: r.b.country,
      user: r.to?.id ? { id: r.to.id, fullName: r.to.fullName } : null,
      near: r.b.near ?? null,
      urgent: r.b.urgent,
      channels: r.b.channels,
      recipients: r.b.recipients,
      emailsSent: r.b.emailsSent,
      smsSent: r.b.smsSent,
      smsFailed: r.b.smsFailed,
      status: r.b.status as Broadcast["status"],
      sentBy: r.by?.id ? { id: r.by.id, fullName: r.by.fullName } : null,
      createdAt: r.b.createdAt.toISOString(),
      finishedAt: r.b.finishedAt?.toISOString() ?? null,
    })
  );
}

adminBroadcastsRouter.get("/broadcasts", async (_req, res) => {
  res.json({ items: await list() });
});

adminBroadcastsRouter.post("/broadcasts", async (req, res) => {
  const input = parse(sendSchema, req.body) as BroadcastInput & z.infer<typeof sendSchema>;
  const { channels } = input;
  if (!channels.app && !channels.email && !channels.sms) throw new HttpError(400, "Pick at least one way to send it", { channels: "Pick at least one" });
  if (channels.email && !emailReady()) throw new HttpError(400, "Email isn't set up on the server yet", { channels: "Email is off" });
  if (channels.sms && !smsReady()) throw new HttpError(400, "SMS isn't set up on the server yet (add the Twilio keys)", { channels: "SMS is off" });

  const { people, near } = await recipients(input);
  if (!people.length) throw new HttpError(400, "Nobody matches — change who gets it", { audience: "Nobody matches" });

  const byHand = input.audience === "user" || input.audience === "people";
  const [row] = await db
    .insert(broadcasts)
    .values({
      title: input.title,
      body: input.body,
      link: input.link,
      audience: input.audience,
      country: byHand ? null : (input.country ?? null),
      userId: input.audience === "user" ? input.userId! : null,
      userIds: input.audience === "people" ? people.map((p) => p.id) : null,
      near: near ? { shopId: near.shop.id, shopName: near.shop.name, radiusKm: near.radiusKm } : null,
      urgent: input.urgent,
      channels,
      recipients: people.length,
      sentById: req.user!.id,
    })
    .returning();
  await audit(
    req.user!.id,
    "broadcast.send",
    { type: "broadcast", id: row.id },
    { title: row.title, audience: row.audience, country: row.country, near: row.near, urgent: row.urgent, recipients: people.length, ...channels }
  );

  // Sending can take a while for big groups — it carries on after this reply.
  void (async () => {
    let totals = { emails: 0, sms: 0, smsFailed: 0 };
    try {
      totals = await deliver(
        people.map((p) => p.id),
        { type: "system", title: smsTitle(input.title, input.urgent), body: input.body, link: input.link, urgent: input.urgent },
        channels
      );
    } catch (err) {
      console.error("broadcast failed", err);
    }
    await db
      .update(broadcasts)
      .set({ status: "sent", emailsSent: totals.emails, smsSent: totals.sms, smsFailed: totals.smsFailed, finishedAt: new Date() })
      .where(eq(broadcasts.id, row.id));
  })();

  const [out] = await list(eq(broadcasts.id, row.id));
  res.status(201).json({ broadcast: out });
});
