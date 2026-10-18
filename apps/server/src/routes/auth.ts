import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { db } from "../db/client";
import { linkShopifyOrders } from "../lib/shopify";
import { users } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { createSession, endSession, rotateSession, signAccess } from "../lib/tokens";
import { publicUser } from "../lib/serialize";
import { email, fullName, optionalText, password, phone } from "../lib/validation";
import { claimEmail, sendCode } from "../lib/email-codes";
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

const registerSchema = z.object({
  fullName,
  phone,
  password,
  email,
  city: optionalText(60, "City"),
});

authRouter.post("/register", limiter, async (req, res) => {
  const input = parse(registerSchema, req.body);

  const [existingPhone] = await db.select().from(users).where(eq(users.phone, input.phone)).limit(1);
  // Bought on the old Shopify store: signing up with the same number takes over that account (and its order history).
  if (existingPhone?.unclaimed && existingPhone.status === "active" && existingPhone.role === "buyer") {
    await claimEmail(input.email, existingPhone.id);
    const [claimed] = await db
      .update(users)
      .set({
        fullName: input.fullName,
        email: input.email,
        emailVerifiedAt: null,
        city: input.city ?? existingPhone.city,
        passwordHash: await bcrypt.hash(input.password, 12),
        unclaimed: false,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingPhone.id))
      .returning();
    await linkShopifyOrders(claimed.id, claimed.phone);
    await sendCode(claimed, input.email).catch(() => {});
    return res.status(201).json({
      user: publicUser(claimed),
      accessToken: signAccess({ sub: claimed.id, role: claimed.role }),
      refreshToken: await createSession(claimed.id),
      welcomeBack: true,
    });
  }
  if (existingPhone) {
    throw new HttpError(409, "An account with this phone number already exists. Try logging in.", {
      phone: "Already registered",
    });
  }
  await claimEmail(input.email, null);

  const [user] = await db
    .insert(users)
    .values({
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      city: input.city,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: "buyer", // never taken from the request
      lastLoginAt: new Date(),
    })
    .returning();
  await linkShopifyOrders(user.id, user.phone);
  // The app opens the "enter your code" screen next. A failed send can be retried there.
  await sendCode(user, input.email).catch(() => {});

  res.status(201).json({
    user: publicUser(user),
    accessToken: signAccess({ sub: user.id, role: user.role }),
    refreshToken: await createSession(user.id),
  });
});

const loginSchema = z.object({ phone, password: z.string().min(1, "Enter your password") });

authRouter.post("/login", limiter, async (req, res) => {
  const input = parse(loginSchema, req.body);
  const [user] = await db.select().from(users).where(eq(users.phone, input.phone)).limit(1);

  if (user?.unclaimed && user.role === "buyer") {
    throw new HttpError(401, "You shopped with YanaBuy before — tap Sign up and use this number to set your password. Your past orders will be there.", {
      phone: "Sign up to set a password",
    });
  }
  // Same message whether the phone or the password is wrong, so nobody can
  // use this form to find out which numbers are registered.
  if (!user || user.unclaimed || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "Wrong phone number or password");
  }
  if (user.status === "blocked") throw new HttpError(403, blockedMessage(user.blockedReason));

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  res.json({
    user: publicUser(user),
    accessToken: signAccess({ sub: user.id, role: user.role }),
    refreshToken: await createSession(user.id),
  });
});

// Forgot password: a code by email and/or SMS, then a new password.
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many tries. Please wait a few minutes and try again." } });

authRouter.post("/forgot-password", resetLimiter, async (req, res) => {
  const input = parse(z.object({ phone }), req.body);
  const [user] = await db.select().from(users).where(eq(users.phone, input.phone)).limit(1);
  // Same answer whether or not the number has an account.
  await startReset(user).catch((err) => {
    // Too many codes: say so. Anything else stays quiet.
    if (err instanceof HttpError && err.status === 429) throw err;
  });
  res.json({ ok: true });
});

authRouter.post("/reset-password", limiter, async (req, res) => {
  const input = parse(z.object({ phone, code: z.string({ required_error: "Enter the code" }).trim().regex(/^\d{6}$/, "Enter the 6-digit code"), password }), req.body);
  const [found] = await db.select().from(users).where(eq(users.phone, input.phone)).limit(1);
  const user = await finishReset(found, input.code, input.password);
  res.json({
    user: publicUser(user),
    accessToken: signAccess({ sub: user.id, role: user.role }),
    refreshToken: await createSession(user.id),
  });
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
