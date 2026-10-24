import { createHash, randomInt } from "node:crypto";
import { and, desc, eq, gte, isNull, ne } from "drizzle-orm";
import { db } from "../db/client";
import { emailCodes, users, type UserRow } from "../db/schema";
import { HttpError } from "./http";
import { emailHtml, emailReady, sendEmail } from "./outbound";
import { getBranding } from "./branding";

const MINUTES = 15;
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/**
 * Buyers never have to confirm anything. Sellers and riders need a confirmed email
 * (once email sending is set up) — the app asks them for it.
 */
export const needsVerification = (u: Pick<UserRow, "role" | "emailVerifiedAt" | "unclaimed">) =>
  emailReady() && !u.unclaimed && (u.role === "vendor" || u.role === "rider") && !u.emailVerifiedAt;
/** @deprecated use needsVerification. */
export const needsEmail = needsVerification;

/**
 * Makes sure no other account holds this address. An address someone typed but
 * never confirmed doesn't count — the person who confirms it first gets it.
 */
export async function claimEmail(email: string, userId: string | null, proven = false) {
  const [other] = await db
    .select({ id: users.id, verified: users.emailVerifiedAt, phone: users.phone })
    .from(users)
    .where(and(eq(users.email, email), userId ? ne(users.id, userId) : undefined))
    .limit(1);
  if (!other) return;
  if (other.verified) throw new HttpError(409, "That email is already used by another account", { email: "Already used" });
  // The email is how that account logs in (no phone): it keeps it. They can use "Forgot password" if it's theirs.
  if (!other.phone && !proven) throw new HttpError(409, "An account with this email already exists. Try logging in, or use Forgot password.", { email: "Already registered" });
  await db.update(users).set({ email: null, updatedAt: new Date() }).where(eq(users.id, other.id));
}

/** Emails a fresh 6-digit code. At most one a minute and five an hour per account. */
export async function sendCode(user: Pick<UserRow, "id" | "fullName">, email: string) {
  const recent = await db
    .select({ createdAt: emailCodes.createdAt, email: emailCodes.email })
    .from(emailCodes)
    .where(and(eq(emailCodes.userId, user.id), gte(emailCodes.createdAt, new Date(Date.now() - 3600_000))))
    .orderBy(desc(emailCodes.createdAt));
  // Same address again within a minute: wait. (A different address — fixing a typo — is fine.)
  if (recent[0] && recent[0].email === email && Date.now() - recent[0].createdAt.getTime() < 60_000) throw new HttpError(429, "We just sent a code — wait a minute before asking for another.");
  if (recent.length >= 5) throw new HttpError(429, "Too many codes asked for. Try again in an hour.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(emailCodes).values({ userId: user.id, email, codeHash: hash(code), expiresAt: new Date(Date.now() + MINUTES * 60_000) });

  if (!emailReady()) {
    console.log(`✉️  (email is off) code for ${email}: ${code}`);
    return { sent: false };
  }
  const { appName } = await getBranding();
  const html = await emailHtml({
    heading: `Your ${appName} code`,
    big: code,
    lines: [`Hi ${user.fullName.split(" ")[0]}, enter this code to confirm your email address.`, `It works for ${MINUTES} minutes. If you didn't ask for it, you can ignore this email.`],
  });
  const ok = await sendEmail(email, `${code} is your ${appName} code`, html, `Your ${appName} code is ${code}. It works for ${MINUTES} minutes.`);
  if (!ok) throw new HttpError(502, "We couldn't send the email right now. Check the address and try again.");
  return { sent: true };
}

/** Checks a code; on success the address becomes the account's confirmed email. */
export async function verifyCode(userId: string, code: string) {
  const [row] = await db
    .select()
    .from(emailCodes)
    .where(and(eq(emailCodes.userId, userId), isNull(emailCodes.usedAt)))
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);
  if (!row || row.expiresAt < new Date()) throw new HttpError(400, "That code has expired — ask for a new one.", { code: "Expired" });
  if (row.attempts >= 5) throw new HttpError(400, "Too many wrong tries — ask for a new code.", { code: "Ask for a new code" });
  if (row.codeHash !== hash(code.trim())) {
    await db.update(emailCodes).set({ attempts: row.attempts + 1 }).where(eq(emailCodes.id, row.id));
    throw new HttpError(400, "That code isn't right. Check the email and try again.", { code: "Wrong code" });
  }
  await claimEmail(row.email, userId, true);
  await db.update(emailCodes).set({ usedAt: new Date() }).where(eq(emailCodes.id, row.id));
  const [user] = await db.update(users).set({ email: row.email, emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId)).returning();
  return user;
}
