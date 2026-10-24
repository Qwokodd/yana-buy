import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { db } from "../db/client";
import { linkShopifyOrders } from "../lib/shopify";
import { users, type UserRow } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { createSession, endSession, rotateSession, signAccess } from "../lib/tokens";
import { userWithShop } from "../lib/serialize";
import { email, fullName, optionalText, password, phone } from "../lib/validation";
import { claimEmail, sendCode } from "../lib/email-codes";
import { sendPhoneCode } from "../lib/phone-codes";
import { canTrustDevice, codeChannels, loginCodesOn, resendChallenge, startChallenge, trustDevice, verifyChallenge } from "../lib/login-codes";
import { emailReady } from "../lib/outbound";
import { normalizePhone } from "@yanabuy/shared";
import { finishReset, startReset } from "../lib/password-reset";
import { blockedMessage } from "../middleware/auth";

export const authRouter = Router();

// Slows down password guessing: 20 tries per 15 minutes per IP.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  // Only failed attempts count, so normal logins never lock anyone out.
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});

/** Phone or email, whichever they typed. Emails have an @; everything else is read as a phone number. */
type Identifier = { kind: "sms"; phone: string } | { kind: "email"; email: string };

function readIdentifier(body: { login?: string; phone?: string; email?: string }): Identifier {
  const raw = (body.login ?? body.email ?? body.phone ?? "").trim();
  if (!raw) throw new HttpError(400, "Enter your phone number or email", { login: "Enter your phone number or email", phone: "Enter your phone number" });
  if (raw.includes("@")) {
    const r = email.safeParse(raw);
    if (!r.success) throw new HttpError(400, "Enter a valid email address", { login: "Enter a valid email address", email: "Enter a valid email address" });
    return { kind: "email", email: r.data };
  }
  const p = normalizePhone(raw);
  if (!p) throw new HttpError(400, "Enter a valid phone number or email", { login: "Enter a valid phone number or email", phone: "Enter a valid phone number" });
  return { kind: "sms", phone: p };
}

async function findBy(id: Identifier) {
  const [user] = await db
    .select()
    .from(users)
    .where(id.kind === "sms" ? eq(users.phone, id.phone) : eq(users.email, id.email))
    .limit(1);
  return user as UserRow | undefined;
}

async function session(user: UserRow, extra: Record<string, unknown> = {}) {
  return {
    user: await userWithShop(user),
    accessToken: signAccess({ sub: user.id, role: user.role }),
    refreshToken: await createSession(user.id),
    ...extra,
  };
}

const identifierFields = {
  login: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(200).optional(),
};
const code6 = z.string({ required_error: "Enter the code" }).trim().regex(/^\d{6}$/, "Enter the 6-digit code");

const registerSchema = z.object({
  fullName,
  // Buyers sign up with a phone number; an email is optional (sellers and riders confirm one later).
  phone,
  email: email.optional().or(z.literal("").transform(() => undefined)),
  password,
  city: optionalText(60, "City"),
});

authRouter.post("/register", limiter, async (req, res) => {
  const input = parse(registerSchema, req.body);
  const existingPhone = await findBy({ kind: "sms", phone: input.phone });
  // Bought on the old Shopify store: signing up with the same number takes over that account (and its order history)
  // — once they prove the number (or the email the store had) is theirs with a code.
  if (existingPhone?.unclaimed && existingPhone.status === "active" && existingPhone.role === "buyer") {
    if (input.email) await claimEmail(input.email, existingPhone.id);
    const pending = { fullName: input.fullName, email: input.email ?? null, city: input.city, passwordHash: await bcrypt.hash(input.password, 12) };
    if (loginCodesOn()) {
      const challenge = await startChallenge(existingPhone, codeChannels(existingPhone, "sms", true).filter((c) => c === "email"), "claim", pending);
      if (challenge) return res.status(202).json(challenge);
    }
    // No way to send a code: take it over straight away (as before codes existed).
    const claimed = await finishClaim(existingPhone.id, pending);
    return res.status(201).json(await session(claimed, { welcomeBack: true }));
  }
  if (existingPhone) {
    throw new HttpError(409, "An account with this phone number already exists. Try logging in, or use Forgot password.", {
      phone: "Already registered",
    });
  }
  if (input.email) await claimEmail(input.email, null);

  const [user] = await db
    .insert(users)
    .values({
      fullName: input.fullName,
      phone: input.phone,
      email: input.email ?? null,
      city: input.city,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: "buyer", // never taken from the request
      lastLoginAt: new Date(),
    })
    .returning();
  await linkShopifyOrders(user.id, input.phone);
  // No codes for buyers: they start browsing and ordering straight away.

  res.status(201).json(await session(user));
});

/** Finishes taking over an old-store account: their name, password and email go on it. */
async function finishClaim(userId: string, pending: Record<string, unknown>) {
  const p = pending as { fullName: string; email: string | null; city: string | null; passwordHash: string };
  const [current] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  let newEmail = current.email;
  if (p.email && p.email !== current.email) {
    await claimEmail(p.email, userId);
    newEmail = p.email;
  }
  const [claimed] = await db
    .update(users)
    .set({
      fullName: p.fullName,
      email: newEmail,
      emailVerifiedAt: newEmail === current.email ? current.emailVerifiedAt : null,
      city: p.city ?? current.city,
      passwordHash: p.passwordHash,
      unclaimed: false,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();
  if (claimed.phone) await linkShopifyOrders(claimed.id, claimed.phone);
  if (claimed.email && !claimed.emailVerifiedAt && emailReady()) await sendCode(claimed, claimed.email).catch(() => {});
  return claimed;
}

const loginSchema = z.object({ ...identifierFields, password: z.string({ required_error: "Enter your password" }).min(1, "Enter your password"), deviceToken: z.string().max(200).optional() });

authRouter.post("/login", limiter, async (req, res) => {
  const input = parse(loginSchema, req.body);
  const id = readIdentifier(input);
  const user = await findBy(id);

  if (user?.unclaimed && user.role === "buyer") {
    throw new HttpError(401, "You shopped with YanaBuy before — tap Sign up and use this number to set your password. Your past orders will be there.", {
      login: "Sign up to set a password",
      phone: "Sign up to set a password",
    });
  }
  // Same message whether the phone/email or the password is wrong, so nobody can
  // use this form to find out who has an account.
  if (!user || user.unclaimed || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, id.kind === "email" ? "Wrong email or password" : "Wrong phone number or password");
  }
  if (user.status === "blocked") throw new HttpError(403, blockedMessage(user.blockedReason));

  // No second step: the right phone/email + password logs straight in (admins too).
  // Email confirmation is only asked for when applying to sell, offer services or ride.

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  res.json(await session(user));
});

// Codes have their own limit (each challenge also allows only 5 wrong tries).
const codeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, skipSuccessfulRequests: true, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many attempts. Please wait a few minutes and try again." } });

const verifySchema = z.object({ challengeId: z.string().min(20).max(200), code: code6, trustDevice: z.boolean().optional() });

authRouter.post("/login/verify", codeLimiter, async (req, res) => {
  const input = parse(verifySchema, req.body);
  const done = await verifyChallenge(input.challengeId, input.code);
  let user = done.user;
  const extra: Record<string, unknown> = {};
  if (done.purpose === "claim" && done.pending) {
    user = await finishClaim(user.id, done.pending);
    extra.welcomeBack = true;
  }
  if (user.status === "blocked") throw new HttpError(403, blockedMessage(user.blockedReason));
  if (input.trustDevice && canTrustDevice(user.role)) extra.deviceToken = await trustDevice(user.id);
  res.json(await session(user, extra));
});

const resendSchema = z.object({ challengeId: z.string().min(20).max(200), channel: z.enum(["sms", "email"]).optional() });

authRouter.post("/login/resend", codeLimiter, async (req, res) => {
  const input = parse(resendSchema, req.body);
  res.json(await resendChallenge(input.challengeId, input.channel));
});

// Forgot password: a code by text or email, then a new password.
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many tries. Please wait a few minutes and try again." } });

authRouter.post("/forgot-password", resetLimiter, async (req, res) => {
  const id = readIdentifier(parse(z.object(identifierFields), req.body ?? {}));
  const user = await findBy(id);
  // Same answer whether or not there is an account.
  await startReset(user, id.kind).catch((err) => {
    // Too many codes: say so. Anything else stays quiet.
    if (err instanceof HttpError && err.status === 429) throw err;
  });
  res.json({ ok: true });
});

authRouter.post("/reset-password", limiter, async (req, res) => {
  const input = parse(z.object({ ...identifierFields, code: code6, password }), req.body);
  const found = await findBy(readIdentifier(input));
  const user = await finishReset(found, input.code, input.password);
  res.json(await session(user));
});

const refreshSchema = z.object({ refreshToken: z.string().min(10) });

authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = parse(refreshSchema, req.body);
  const rotated = await rotateSession(refreshToken);
  if (!rotated) throw new HttpError(401, "Your session has expired. Please log in again.");

  const [user] = await db.select().from(users).where(eq(users.id, rotated.userId)).limit(1);
  if (!user || user.status === "blocked") throw new HttpError(401, "Please log in again");

  res.json({ accessToken: signAccess({ sub: user.id, role: user.role }), refreshToken: rotated.refreshToken });
});

authRouter.post("/logout", async (req, res) => {
  const { refreshToken } = parse(refreshSchema, req.body);
  await endSession(refreshToken);
  res.status(204).send();
});
