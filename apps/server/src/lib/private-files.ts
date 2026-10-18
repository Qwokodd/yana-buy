import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request } from "express";
import { env } from "../env";

/**
 * Private files (ID cards, selfies) live outside the public uploads folder.
 * They are shown only through links signed with a server secret that stop
 * working after a short time, so a copied link can't be shared around.
 */
export const PRIVATE_ROOT = path.resolve(process.cwd(), env.PRIVATE_UPLOAD_DIR);
fs.mkdirSync(PRIVATE_ROOT, { recursive: true });

export const PRIVATE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|heic|heif)$/;

const LINK_LIFETIME_SECONDS = 60 * 60;
const secret = crypto.createHash("sha256").update(`private-files:${env.JWT_ACCESS_SECRET}`).digest();

function signature(key: string, exp: number) {
  return crypto.createHmac("sha256", secret).update(`${key}:${exp}`).digest("base64url");
}

export function publicBase(req: Request) {
  return (env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

export function signedUrl(req: Request, key: string) {
  const exp = Math.floor(Date.now() / 1000) + LINK_LIFETIME_SECONDS;
  return `${publicBase(req)}/private-files/${key}?exp=${exp}&sig=${signature(key, exp)}`;
}

export function verifySignature(key: string, exp: string | undefined, sig: string | undefined) {
  if (!PRIVATE_KEY.test(key) || !exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now() / 1000) return false;
  const expected = Buffer.from(signature(key, expNum));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export function privateFileExists(key: string) {
  return PRIVATE_KEY.test(key) && fs.existsSync(path.join(PRIVATE_ROOT, key));
}
