import { createHash, randomInt } from "node:crypto";
import { and, desc, eq, gte, isNull, ne } from "drizzle-orm";
import { formatPhone } from "@yanabuy/shared";
import { db } from "../db/client";
import { phoneCodes, users, type UserRow } from "../db/schema";
import { HttpError } from "./http";
import { sendSms, smsReady } from "./outbound";
import { getBranding } from "./branding";

const MINUTES = 10;
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/** "•••• •• 999" style — enough for people to recognise their own number. */
export const maskPhone = (e164: string) => {
  const shown = formatPhone(e164);
  const keep = 3;
  let digitsLeft = shown.replace(/\D/g, "").length - keep;
  return shown.replace(/\d/g, (d) => (digitsLeft-- > 0 ? "•" : d));
};

/** Makes sure no other account uses this number (numbers are how people log in). */
export async function phoneFree(phone: string, userId: string | null) {
  const [other] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, phone), userId ? ne(users.id, userId) : undefined))
    .limit(1);
  if (other) throw new HttpError(409, "That phone number is already used by another account", { phone: "Already used" });
}

/** Texts a fresh 6-digit code to confirm a number. At most one a minute and five an hour per account. */
export async function sendPhoneCode(user: Pick<UserRow, "id">, phone: string) {
  const recent = await db
    .select({ createdAt: phoneCodes.createdAt, phone: phoneCodes.phone })
    .from(phoneCodes)
    .where(and(eq(phoneCodes.userId, user.id), gte(phoneCodes.createdAt, new Date(Date.now() - 3600_000))))
    .orderBy(desc(phoneCodes.createdAt));
  if (recent[0] && recent[0].phone === phone && Date.now() - recent[0].createdAt.getTime() < 60_000) throw new HttpError(429, "We just sent a code — wait a minute before asking for another.");
  if (recent.length >= 5) throw new HttpError(429, "Too many codes asked for. Try again in an hour.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(phoneCodes).values({ userId: user.id, phone, codeHash: hash(code), expiresAt: new Date(Date.now() + MINUTES * 60_000) });

  if (!smsReady()) {
    console.log(`💬 (SMS is off) phone code for ${phone}: ${code}`);
    return { sent: false };
  }
  const { appName } = await getBranding();
  const ok = await sendSms(phone, `${appName}: your code is ${code}. It works for ${MINUTES} minutes. Don't share it with anyone.`);
  if (!ok) throw new HttpError(502, "We couldn't send the text right now. Check the number and try again.");
  return { sent: true };
}

/** Checks a code; on success that number becomes the account's confirmed phone. */
export async function verifyPhoneCode(userId: string, code: string) {
  const [row] = await db
    .select()
    .from(phoneCodes)
    .where(and(eq(phoneCodes.userId, userId), isNull(phoneCodes.usedAt)))
    .orderBy(desc(phoneCodes.createdAt))
    .limit(1);
  if (!row || row.expiresAt < new Date()) throw new HttpError(400, "That code has expired — ask for a new one.", { code: "Expired" });
  if (row.attempts >= 5) throw new HttpError(400, "Too many wrong tries — ask for a new code.", { code: "Ask for a new code" });
  if (row.codeHash !== hash(code.trim())) {
    await db.update(phoneCodes).set({ attempts: row.attempts + 1 }).where(eq(phoneCodes.id, row.id));
    throw new HttpError(400, "That code isn't right. Check the text message and try again.", { code: "Wrong code" });
  }
  await phoneFree(row.phone, userId);
  await db.update(phoneCodes).set({ usedAt: new Date() }).where(eq(phoneCodes.id, row.id));
  const [user] = await db.update(users).set({ phone: row.phone, phoneVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId)).returning();
  return user;
}
