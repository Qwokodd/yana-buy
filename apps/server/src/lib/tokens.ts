import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { and, eq, isNull, gt } from "drizzle-orm";
import { env } from "../env";
import { db } from "../db/client";
import { sessions } from "../db/schema";
import type { UserRole } from "@yanabuy/shared";

const ACCESS_TTL = "15m";
const REFRESH_TTL_DAYS = 30;

export interface AccessClaims {
  sub: string;
  role: UserRole;
}

export function signAccess(claims: AccessClaims) {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function verifyAccess(token: string): AccessClaims {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
  return { sub: String(payload.sub), role: payload.role as UserRole };
}

const hash = (raw: string) => crypto.createHmac("sha256", env.JWT_REFRESH_SECRET).update(raw).digest("hex");

/** A new random refresh token for this user, stored only as a hash. */
export async function createSession(userId: string) {
  const raw = crypto.randomBytes(48).toString("base64url");
  await db.insert(sessions).values({
    userId,
    tokenHash: hash(raw),
    expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  return raw;
}

/**
 * Swaps a refresh token for a new one (the old one stops working).
 * Returns null if the token is unknown, expired or already used.
 */
export async function rotateSession(raw: string) {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.tokenHash, hash(raw)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .returning();
    if (!session) return null;
    const next = crypto.randomBytes(48).toString("base64url");
    await tx.insert(sessions).values({
      userId: session.userId,
      tokenHash: hash(next),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    });
    return { userId: session.userId, refreshToken: next };
  });
}

export async function endSession(raw: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, hash(raw)));
}

/** Signs a user out of every device (used when they're blocked or their role changes). */
export async function endAllSessions(userId: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
