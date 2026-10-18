import { createHash, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { passwordResets, users, type UserRow } from "../db/schema";
import { HttpError } from "./http";
import { emailHtml, emailReady, sendEmail, sendSms, smsReady } from "./outbound";
import { getBranding } from "./branding";
import { endAllSessions } from "./tokens";

const MINUTES = 15;
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/** "da•••@gmail.com" — enough for people to recognise their own address. */
export const maskEmail = (e: string) => e.replace(/^(.{1,2})[^@]*(@.*)$/, "$1•••$2");

/**
 * Sends a reset code to the account's confirmed email and (when SMS is on) its phone.
 * Says nothing about whether the number has an account — the app always shows the same message.
 */
export async function startReset(user: UserRow | undefined): Promise<("email" | "sms")[]> {
  if (!user || user.status !== "active" || user.unclaimed) return [];
  const recent = await db
    .select({ createdAt: passwordResets.createdAt })
    .from(passwordResets)
    .where(and(eq(passwordResets.userId, user.id), gte(passwordResets.createdAt, new Date(Date.now() - 3600_000))))
    .orderBy(desc(passwordResets.createdAt));
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < 60_000) throw new HttpError(429, "We just sent a code — wait a minute before asking for another.");
  if (recent.length >= 5) throw new HttpError(429, "Too many codes asked for. Try again in an hour.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(passwordResets).values({ userId: user.id, codeHash: hash(code), expiresAt: new Date(Date.now() + MINUTES * 60_000) });

  const { appName } = await getBranding();
  const sent: ("email" | "sms")[] = [];
  if (user.email && user.emailVerifiedAt && emailReady()) {
    const html = await emailHtml({
      heading: "Reset your password",
      big: code,
      lines: [`Hi ${user.fullName.split(" ")[0]}, enter this code in ${appName} to choose a new password.`, `It works for ${MINUTES} minutes. If you didn't ask for this, ignore this email — your password stays the same.`],
    });
    if (await sendEmail(user.email, `${code} is your ${appName} password reset code`, html, `Your ${appName} password reset code is ${code}. It works for ${MINUTES} minutes.`)) sent.push("email");
  }
  if (smsReady() && (await sendSms(user.phone, `${appName}: your password reset code is ${code}. It works for ${MINUTES} minutes. Don't share it with anyone.`))) sent.push("sms");
  if (!sent.length) console.log(`🔑 (no email/SMS for ${user.phone}) password reset code: ${code}`);
  return sent;
}

/** Checks the code and sets the new password. Every other logged-in device is logged out. */
export async function finishReset(user: UserRow | undefined, code: string, password: string) {
  const bad = () => new HttpError(400, "That code isn't right or has expired. Ask for a new one.", { code: "Wrong or expired code" });
  if (!user || user.status !== "active" || user.unclaimed) throw bad();
  const [row] = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)))
    .orderBy(desc(passwordResets.createdAt))
    .limit(1);
  if (!row || row.expiresAt < new Date()) throw bad();
  if (row.attempts >= 5) throw new HttpError(400, "Too many wrong tries — ask for a new code.", { code: "Ask for a new code" });
  if (row.codeHash !== hash(code.trim())) {
    await db.update(passwordResets).set({ attempts: row.attempts + 1 }).where(eq(passwordResets.id, row.id));
    throw bad();
  }
  await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
  await endAllSessions(user.id);
  const [fresh] = await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(password, 12), lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();
  return fresh;
}
