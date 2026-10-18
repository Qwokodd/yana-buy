import type { Request } from "express";
import { DEFAULT_COUNTRY, isCountry, type Country } from "@yanabuy/shared";

/**
 * The country the shopper picked with the country switch. The apps send it as
 * an X-Country header on every request (?country= works too); anything else
 * means Liberia.
 */
export function countryOf(req: Request): Country {
  const raw = (req.get("x-country") ?? (typeof req.query.country === "string" ? req.query.country : "")).toUpperCase();
  return isCountry(raw) ? raw : DEFAULT_COUNTRY;
}
