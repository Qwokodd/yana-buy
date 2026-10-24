import crypto, { createHash, randomInt } from "node:crypto";
import { and, eq, gt, gte, isNull, sql } from "drizzle-orm";
import type { LoginChallenge, LoginChannel, UserRole } from "@yanabuy/shared";
import { env } from "../env";
import { db } from "../db/client";
import { loginChallenges, trustedDevices, users, type UserRow } from "../db/schema";
import { HttpError } from "./http";
import { emailHtml, emailReady, sendEmail, sendSms, smsReady } from "./outbound";
import { getBranding } from "./branding";
import { maskEmail } from "./password-reset";
import { maskPhone } from "./phone-codes";

/**
 * Two-step login: after the right password, a 6-digit code goes to the phone
 * (by text) or the email the person logged in with. "Trust this device" skips
 * the code for 30 days — except for admins, who always get one.
 *
 * Codes only apply once a way to send them is switched on (SMTP for email,
 * Twilio for SMS). With neither, people log in with just the password, like before.
 */

const MINUTES = 10;
const TRUST_DAYS = 30;
const codeHash = (code: string) => createHash("sha256").update(code).digest("hex");
const tokenHash = (raw: string) => crypto.createHmac("sha256", env.JWT_REFRESH_SECRET).update(raw).digest("hex");
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export const loginCodesOn = () => env.LOGIN_CODES !== "off";
const ready = (c: LoginChannel) => (c === "sms" ? smsReady() : emailReady());
const targetOf = (u: Pick<UserRow, "phone" | "email">, c: LoginChannel) => (c === "sms" ? u.phone : u.email);
const confirmed = (u: Pick<UserRow, "phoneVerifiedAt" | "emailVerifiedAt">, c: LoginChannel) => !!(c === "sms" ? u.phoneVerifiedAt : u.emailVerifiedAt);
const masked = (c: LoginChannel, target: string) => (c === "sms" ? maskPhone(target) : maskEmail(target));

/** Admins always need a code; everyone else can trust a device. */
export const canTrustDevice = (role: UserRole) => role !== "admin";

/**
 * Where a code can go, best first. The one they typed to log in comes first and
 * may be unconfirmed (the code confirms it); the other only if it's confirmed.
 * `anyOf` (claiming an old account) allows unconfirmed addresses for both.
 */
export function codeChannels(u: UserRow, preferred: LoginChannel, anyOf = false): LoginChannel[] {
  const order: LoginChannel[] = preferred === "sms" ? ["sms", "email"] : ["email", "sms"];
  return order.filter((c) => targetOf(u, c) && ready(c) && (c === preferred || anyOf || confirmed(u, c)));
}

async function deliver(user: UserRow, channel: LoginChannel, target: string, code: string, purpose: string) {
  const { appName } = await getBranding();
  const what = purpose === "claim" ? "confirm it's you and finish signing up" : "finish logging in";
  if (channel === "sms") {
    return sendSms(target, `${appName}: your login code is ${code}. It works for ${MINUTES} minutes. Never share it - ${appName} will never ask for it.`);
  }
  const html = await emailHtml({
    heading: `Your ${appName} login code`,
    big: code,
    lines: [
      `Hi ${user.fullName.split(" ")[0]}, enter this code to ${what}.`,
      `It works for ${MINUTES} minutes. If you didn't just try to log in, change your password — someone may know it.`,
    ],
  });
  return sendEmail(target, `${code} is your ${appName} login code`, html, `Your ${appName} login code is ${code}. It works for ${MINUTES} minutes.`);
}

/** No more than 10 login codes an hour per account (texts cost money, and it stops floods). */
async function checkHourlyLimit(userId: string) {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${loginChallenges.sends}), 0)::int` })
    .from(loginChallenges)
    .where(and(eq(loginChallenges.userId, userId), gte(loginChallenges.createdAt, new Date(Date.now() - 3600_000))));
  if ((row?.n ?? 0) >= 10) throw new HttpError(429, "Too many login codes asked for. Try again in an hour.");
}

const challengeOut = (id: string, channel: LoginChannel, target: string, channels: LoginChannel[], purpose: string): LoginChallenge => ({
  needsCode: true,
  challengeId: id,
  channel,
  sentTo: masked(channel, target),
  channels,
  purpose: purpose === "claim" ? "claim" : "login",
});

/**
 * Sends the first code and returns what the app needs to show the code screen.
 * Returns null when there is no way to send one (the caller then logs them in directly).
 */
export async function startChallenge(user: UserRow, channels: LoginChannel[], purpose: "login" | "claim" = "login", pending?: Record<string, unknown>) {
  if (!channels.length) return null;
  await checkHourlyLimit(user.id);
  const channel = channels[0];
  const target = targetOf(user, channel)!;
  const code = newCode();
  const raw = crypto.randomBytes(32).toString("base64url");
  await db.insert(loginChallenges).values({
    tokenHash: tokenHash(raw),
    userId: user.id,
    purpose,
    channel,
    target,
    codeHash: codeHash(code),
    pending: pending ?? null,
    expiresAt: new Date(Date.now() + MINUTES * 60_000),
  });
  if (!(await deliver(user, channel, target, code, purpose))) {
    throw new HttpError(502, channel === "sms" ? "We couldn't send the text right now. Try again in a minute." : "We couldn't send the email right now. Try again in a minute.");
  }
  return challengeOut(raw, channel, target, channels, purpose);
}

async function liveChallenge(raw: string) {
  const [row] = await db
    .select()
    .from(loginChallenges)
    .where(and(eq(loginChallenges.tokenHash, tokenHash(raw)), isNull(loginChallenges.usedAt)))
    .limit(1);
  if (!row || row.expiresAt < new Date() || row.attempts >= 5) {
    throw new HttpError(400, row && row.attempts >= 5 ? "Too many wrong tries. Go back and log in again." : "This code has expired. Go back and log in again.", { code: "Log in again" });
  }
  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user || user.status !== "active") throw new HttpError(400, "This code has expired. Go back and log in again.", { code: "Log in again" });
  return { row, user };
}

/** A new code — to the same place, or the other one ("text me instead" / "email me instead"). */
export async function resendChallenge(raw: string, wanted?: LoginChannel) {
  const { row, user } = await liveChallenge(raw);
  const channels = codeChannels(user, row.channel as LoginChannel, row.purpose === "claim");
  const channel = wanted ?? (row.channel as LoginChannel);
  if (!channels.includes(channel)) throw new HttpError(400, channel === "sms" ? "We can't text a code to this account." : "We can't email a code to this account.", { channel: "Not available" });
  if (channel === row.channel && Date.now() - row.lastSentAt.getTime() < 60_000) throw new HttpError(429, "We just sent a code — wait a minute before asking for another.");
  if (row.sends >= 5) throw new HttpError(429, "Too many codes asked for. Go back and log in again later.");
  await checkHourlyLimit(user.id);
  const target = targetOf(user, channel)!;
  const code = newCode();
  await db
    .update(loginChallenges)
    .set({ channel, target, codeHash: codeHash(code), attempts: 0, sends: row.sends + 1, lastSentAt: new Date(), expiresAt: new Date(Date.now() + MINUTES * 60_000) })
    .where(eq(loginChallenges.id, row.id));
  if (!(await deliver(user, channel, target, code, row.purpose))) throw new HttpError(502, "We couldn't send the code right now. Try again in a minute.");
  return challengeOut(raw, channel, target, channels, row.purpose);
}

/**
 * Checks the code. On success the phone or email it went to counts as confirmed,
 * and the challenge can't be used again. Returns the user and the challenge row.
 */
export async function verifyChallenge(raw: string, code: string) {
  const { row, user } = await liveChallenge(raw);
  if (row.codeHash !== codeHash(code.trim())) {
    await db.update(loginChallenges).set({ attempts: row.attempts + 1 }).where(eq(loginChallenges.id, row.id));
    throw new HttpError(400, row.attempts + 1 >= 5 ? "Too many wrong tries. Go back and log in again." : "That code isn't right. Check it and try again.", { code: "Wrong code" });
  }
  // Only one use, even if two requests race.
  const [used] = await db
    .update(loginChallenges)
    .set({ usedAt: new Date() })
    .where(and(eq(loginChallenges.id, row.id), isNull(loginChallenges.usedAt)))
    .returning({ id: loginChallenges.id });
  if (!used) throw new HttpError(400, "This code was already used. Log in again.", { code: "Log in again" });

  const set: Partial<typeof users.$inferInsert> = { lastLoginAt: new Date(), updatedAt: new Date() };
  if (row.channel === "sms" && row.target === user.phone && !user.phoneVerifiedAt) set.phoneVerifiedAt = new Date();
  if (row.channel === "email" && row.target === user.email && !user.emailVerifiedAt) {
    // Someone else confirmed this address in the meantime: don't take it from them.
    const [other] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, row.target), sql`${users.id} <> ${user.id}`, sql`${users.emailVerifiedAt} is not null`)).limit(1);
    if (!other) set.emailVerifiedAt = new Date();
  }
  const [fresh] = await db.update(users).set(set).where(eq(users.id, user.id)).returning();
  return { user: fresh, purpose: row.purpose, pending: row.pending, channel: row.channel as LoginChannel };
}

/** "Trust this device": a random token the app keeps; only its hash is stored. */
export async function trustDevice(userId: string) {
  const raw = crypto.randomBytes(32).toString("base64url");
  await db.insert(trustedDevices).values({ userId, tokenHash: tokenHash(raw), expiresAt: new Date(Date.now() + TRUST_DAYS * 86_400_000) });
  return raw;
}

export async function isTrustedDevice(userId: string, raw: string | undefined | null) {
  if (!raw || raw.length < 20 || raw.length > 200) return false;
  const [row] = await db
    .update(trustedDevices)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(trustedDevices.tokenHash, tokenHash(raw)), eq(trustedDevices.userId, userId), gt(trustedDevices.expiresAt, new Date())))
    .returning({ id: trustedDevices.id });
  return !!row;
}

/** Forget every trusted device (new password, blocked, "log out everywhere"). */
export async function forgetDevices(userId: string) {
  await db.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
}
