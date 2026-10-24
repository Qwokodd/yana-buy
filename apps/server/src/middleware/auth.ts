import { emailReady } from "../lib/outbound";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users, type UserRow } from "../db/schema";
import { verifyAccess } from "../lib/tokens";
import { HttpError } from "../lib/http";
import type { UserRole } from "@yanabuy/shared";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}

/**
 * Requires a valid access token AND an active account. The user is loaded
 * fresh from the database on every request, so blocking someone or changing
 * their role takes effect immediately — not when their token expires.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Please log in");

  let userId: string;
  try {
    userId = verifyAccess(header.slice(7)).sub;
  } catch {
    throw new HttpError(401, "Your session has expired. Please log in again.");
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new HttpError(401, "Please log in");
  if (user.status === "blocked") {
    throw new HttpError(403, blockedMessage(user.blockedReason));
  }
  req.user = user;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpError(403, "You don't have access to this");
    }
    next();
  };
}

export function blockedMessage(reason: string | null) {
  return `Your account has been blocked${reason ? `: ${reason}` : ""}. Contact YanaBuy support if you think this is a mistake.`;
}

/** Like requireAuth, but carries on as a guest when there's no valid login. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const userId = verifyAccess(header.slice(7)).sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user && user.status === "active") req.user = user;
    } catch {
      /* guest */
    }
  }
  next();
}

/**
 * Opening a shop and applying to ride need a confirmed email (once email sending is
 * set up). Buyers never need to confirm anything to browse or order.
 */
export function requireConfirmedEmail(req: Request, _res: Response, next: NextFunction) {
  if (req.user && emailReady() && !req.user.emailVerifiedAt) {
    throw new HttpError(403, "Confirm your email address first — sellers and riders need a confirmed email.", { email: "needs_email" });
  }
  next();
}
/** @deprecated use requireConfirmedEmail. */
export const requireEmail = requireConfirmedEmail;
