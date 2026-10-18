import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { COUNTRY_CODES, type Broadcast, type BroadcastInput, type BroadcastPreview } from "@yanabuy/shared";
import { db } from "../db/client";
import { broadcasts, shops, users } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { deliver } from "../lib/notify";
import { emailReady, smsReady } from "../lib/outbound";
import { requiredText } from "../lib/validation";

/** Admins sending a message to buyers, vendors, riders, everyone, or one person. Mounted under /api/admin. */
export const adminBroadcastsRouter = Router();

const target = z.object({
  audience: z.enum(["everyone", "buyers", "vendors", "riders", "user"], { errorMap: () => ({ message: "Choose who gets it" }) }),
  userId: z.string().uuid("Choose the person").nullish(),
  country: z.enum(COUNTRY_CODES).nullish(),
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

/** Shops decide a seller's country; everyone else's comes from their phone number. */
const country = sql<string>`coalesce(${shops.country}, case when ${users.phone} like '+1%' then 'US' else 'LR' end)`;

/** Who a message goes to: active, signed-up accounts (admins only when picked one by one). */
async function recipients(t: z.infer<typeof target>) {
  if (t.audience === "user" && !t.userId) throw new HttpError(400, "Choose the person", { userId: "Choose the person" });
  const filters: SQL[] = [eq(users.status, "active"), eq(users.unclaimed, false)];
  if (t.audience === "user") filters.push(eq(users.id, t.userId!));
  else {
    filters.push(ne(users.role, "admin"));
    if (t.audience !== "everyone") filters.push(eq(users.role, t.audience === "buyers" ? "buyer" : t.audience === "vendors" ? "vendor" : "rider"));
    if (t.country) filters.push(sql`${country} = ${t.country}`);
  }
  return db
    .select({ id: users.id, email: users.email, verified: users.emailVerifiedAt })
    .from(users)
    .leftJoin(shops, eq(shops.ownerId, users.id))
    .where(and(...filters));
}

adminBroadcastsRouter.post("/broadcasts/preview", async (req, res) => {
  const people = await recipients(parse(target, req.body));
  const preview: BroadcastPreview = {
    recipients: people.length,
    withEmail: people.filter((p) => p.email && p.verified).length,
    withPhone: people.length,
    emailOn: emailReady(),
    smsOn: smsReady(),
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
      channels: r.b.channels,
      recipients: r.b.recipients,
      emailsSent: r.b.emailsSent,
      smsSent: r.b.smsSent,
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
  const input = parse(sendSchema, req.body) as BroadcastInput & { link: string | null };
  const { channels } = input;
  if (!channels.app && !channels.email && !channels.sms) throw new HttpError(400, "Pick at least one way to send it", { channels: "Pick at least one" });
  if (channels.email && !emailReady()) throw new HttpError(400, "Email isn't set up on the server yet", { channels: "Email is off" });
  if (channels.sms && !smsReady()) throw new HttpError(400, "SMS isn't set up on the server yet (add the Twilio keys)", { channels: "SMS is off" });

  const people = await recipients(input);
  if (!people.length) throw new HttpError(400, "Nobody matches — change who gets it", { audience: "Nobody matches" });

  const [row] = await db
    .insert(broadcasts)
    .values({
      title: input.title,
      body: input.body,
      link: input.link,
      audience: input.audience,
      country: input.audience === "user" ? null : (input.country ?? null),
      userId: input.audience === "user" ? input.userId! : null,
      channels,
      recipients: people.length,
      sentById: req.user!.id,
    })
    .returning();
  await audit(req.user!.id, "broadcast.send", { type: "broadcast", id: row.id }, { title: row.title, audience: row.audience, country: row.country, recipients: people.length, ...channels });

  // Sending can take a while for big groups — it carries on after this reply.
  void (async () => {
    let totals = { emails: 0, sms: 0 };
    try {
      totals = await deliver(
        people.map((p) => p.id),
        { type: "system", title: input.title, body: input.body, link: input.link },
        channels
      );
    } catch (err) {
      console.error("broadcast failed", err);
    }
    await db.update(broadcasts).set({ status: "sent", emailsSent: totals.emails, smsSent: totals.sms, finishedAt: new Date() }).where(eq(broadcasts.id, row.id));
  })();

  const [out] = await list(eq(broadcasts.id, row.id));
  res.status(201).json({ broadcast: out });
});

