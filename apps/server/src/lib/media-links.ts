import type { NextFunction, Request, Response } from "express";
import { env } from "../env";
import { publicBase } from "./private-files";

/**
 * Photo links are saved with the address the server had when they were
 * uploaded or imported — usually http://localhost:4000. A phone can't use
 * "localhost" (that's the phone itself), so every JSON reply has those links
 * rewritten to the address this request actually came in on
 * (e.g. http://192.168.1.139:4000, or the live https address).
 */
const own = [
  "localhost",
  "127\\.0\\.0\\.1",
  "10\\.\\d+\\.\\d+\\.\\d+",
  "192\\.168\\.\\d+\\.\\d+",
  "172\\.(?:1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+",
];
const fromPublic = env.PUBLIC_URL ? [env.PUBLIC_URL.replace(/\/$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")] : [];
const OWN_LINK = new RegExp(`^(?:https?://(?:${own.join("|")})(?::\\d+)?${fromPublic.length ? `|${fromPublic.join("|")}` : ""})(/uploads/)`);

function rewrite(value: unknown, base: string, depth = 0): unknown {
  if (depth > 12) return value;
  if (typeof value === "string") return value.length < 600 && value.includes("/uploads/") ? value.replace(OWN_LINK, `${base}$1`) : value;
  if (Array.isArray(value)) return value.map((v) => rewrite(v, base, depth + 1));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewrite(v, base, depth + 1);
    return out;
  }
  return value;
}

export function mediaLinks(req: Request, res: Response, next: NextFunction) {
  const send = res.json.bind(res);
  res.json = (body: unknown) => send(rewrite(body, publicBase(req)));
  next();
}
