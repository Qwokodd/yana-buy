import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { AppNotification, NotificationType } from "@yanabuy/shared";
import { db } from "../db/client";
import { notifications, outboundLog, pushTokens, users } from "../db/schema";
import { env } from "../env";
import { getBranding } from "./branding";
import { emailHtml, emailReady, sendEmail, sendSms, smsReady, webLink, SMS_MAX, smsText } from "./outbound";

type Row = typeof notifications.$inferSelect;

export const notificationOut = (n: Row): AppNotification => ({
  id: n.id,
  type: n.type as NotificationType,
  title: n.title,
  body: n.body,
  link: n.link,
  read: !!n.readAt,
  createdAt: n.createdAt.toISOString(),
});

const PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Sends to Expo's push service. Never throws — the bell entry is what matters. */
async function push(userIds: string[], n: { title: string; body?: string | null; link?: string | null; urgent?: boolean }) {
  if (process.env.NODE_ENV === "test" || process.env.PUSH_DISABLED === "1") return;
  const tokens = await db.select().from(pushTokens).where(inArray(pushTokens.userId, userIds));
  if (!tokens.length) return;
  // Expo takes up to 100 messages per request.
  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100);
    try {
      const res = await fetch(PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch.map((t) => ({ to: t.token, title: n.title, body: n.body ?? undefined, sound: "default", priority: n.urgent ? "high" : "default", data: { link: n.link ?? null } }))),
        signal: AbortSignal.timeout(10_000),
      });
      const out = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
      // Forget phones that uninstalled the app.
      const dead = (out?.data ?? []).map((d, k) => (d.details?.error === "DeviceNotRegistered" ? batch[k]?.token : null)).filter((t): t is string => !!t);
      if (dead.length) await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
    } catch {
      /* offline or Expo down — the bell still has it */
    }
  }
}

type Note = { type: NotificationType; title: string; body?: string | null; link?: string | null; urgent?: boolean };

/** The one text message (160 characters) for a notification: the words are shortened, never the link. */
export function smsFor(appName: string, n: Pick<Note, "title" | "body">, url: string) {
  const room = SMS_MAX - url.length - 1;
  const words = smsText(`${appName}: ${n.title}${n.body ? ` - ${n.body}` : ""}`);
  return `${words.length > room ? `${words.slice(0, Math.max(room - 3, 0))}...` : words} ${url}`;
}

/** A busy chat sends one email/text per conversation every 10 minutes, not one per message. */
const QUIET_MINUTES: Partial<Record<NotificationType, number>> = { chat: 10 };

/** Email (confirmed addresses only) and SMS to everyone told. Never throws. Returns how many went out. */
async function outbound(userIds: string[], n: Note, url: string, want: { email: boolean; sms: boolean } = { email: true, sms: true }) {
  const none = { emails: 0, sms: 0, smsFailed: 0 };
  const doEmail = want.email && emailReady();
  const doSms = want.sms && smsReady();
  if (!doEmail && !doSms) return none;
  let people = await db
    .select({ id: users.id, fullName: users.fullName, phone: users.phone, email: users.email, verified: users.emailVerifiedAt })
    .from(users)
    .where(and(inArray(users.id, userIds), eq(users.status, "active"), eq(users.unclaimed, false)));
  const quiet = QUIET_MINUTES[n.type];
  if (quiet && n.link) {
    const key = `${n.type}:${n.link}`;
    const recent = await db
      .select({ userId: outboundLog.userId })
      .from(outboundLog)
      .where(and(inArray(outboundLog.userId, userIds), eq(outboundLog.key, key), gte(outboundLog.createdAt, new Date(Date.now() - quiet * 60_000))));
    const skip = new Set(recent.map((r) => r.userId));
    people = people.filter((p) => !skip.has(p.id));
    if (people.length) await db.insert(outboundLog).values(people.map((p) => ({ userId: p.id, key })));
  }
  if (!people.length) return none;
  const { appName } = await getBranding();
  const html = doEmail ? await emailHtml({ heading: n.title, lines: n.body ? [n.body] : [], button: { label: `Open ${appName}`, url } }) : "";
  const text = `${n.title}${n.body ? `\n${n.body}` : ""}\n${url}`;
  const sms = smsFor(appName, n, url);
  const out = { emails: 0, sms: 0, smsFailed: 0 };
  // A few at a time, so a big message doesn't open hundreds of connections at once.
  for (let i = 0; i < people.length; i += 20) {
    await Promise.all(
      people.slice(i, i + 20).flatMap((p) => [
        doEmail && p.email && p.verified ? sendEmail(p.email, n.title, html, text).then((ok) => ok && out.emails++) : null,
        doSms && p.phone ? sendSms(p.phone, sms).then((ok) => (ok ? out.sms++ : out.smsFailed++)) : null,
      ])
    );
  }
  return out;
}

/**
 * For admin messages: the chosen channels only, in batches. Awaitable (the caller
 * runs it in the background) and returns how many emails and texts went out.
 */
export async function deliver(userIds: string[], n: Note, channels: { app: boolean; email: boolean; sms: boolean }) {
  const totals = { emails: 0, sms: 0, smsFailed: 0 };
  for (let i = 0; i < userIds.length; i += 500) {
    const ids = userIds.slice(i, i + 500);
    if (channels.app) {
      await db.insert(notifications).values(ids.map((userId) => ({ userId, type: n.type, title: n.title.slice(0, 120), body: n.body?.slice(0, 300) ?? null, link: n.link ?? null })));
      await push(ids, n);
    }
    const sent = await outbound(ids, n, webLink(n.link), { email: channels.email, sms: channels.sms });
    totals.emails += sent.emails;
    totals.sms += sent.sms;
    totals.smsFailed += sent.smsFailed;
  }
  return totals;
}

/**
 * Tells people something happened: a bell entry on web and phone, a push
 * notification on phones that allowed them, an email and a text message.
 * Fire-and-forget: never blocks or fails the caller.
 */
export function notify(userIds: (string | null | undefined)[], n: Note) {
  const ids = [...new Set(userIds.filter((u): u is string => !!u))];
  if (!ids.length) return;
  void (async () => {
    try {
      await db.insert(notifications).values(ids.map((userId) => ({ userId, type: n.type, title: n.title.slice(0, 120), body: n.body?.slice(0, 300) ?? null, link: n.link ?? null })));
      await push(ids, n);
      await outbound(ids, n, webLink(n.link));
    } catch (err) {
      console.error("notify failed", err);
    }
  })();
}

/**
 * Tells every admin about something that needs them (a shop to approve, a payout
 * to send…) by email and SMS, with a link into the admin dashboard. Fire-and-forget.
 */
export function notifyAdmins(n: { title: string; body?: string | null; path: string }) {
  void (async () => {
    try {
      const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
      if (!admins.length) return;
      await outbound(
        admins.map((a) => a.id),
        { type: "system", title: n.title, body: n.body },
        `${env.ADMIN_URL.replace(/\/$/, "")}${n.path}`
      );
    } catch (err) {
      console.error("notifyAdmins failed", err);
    }
  })();
}

export async function listNotifications(userId: string, limit: number, before?: Date) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .then((rows) => (before ? rows.filter((r) => r.createdAt < before) : rows));
}

export async function markRead(userId: string, ids?: string[]) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), ids?.length ? inArray(notifications.id, ids) : undefined));
}
