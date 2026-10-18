/**
 * The countries YanaBuy runs in. Shoppers pick one with the country switch and
 * only see shops (and their products) from that country.
 */
export type Country = "LR" | "US";

export const COUNTRIES: { code: Country; name: string; flag: string; dial: string }[] = [
  { code: "LR", name: "Liberia", flag: "🇱🇷", dial: "+231" },
  { code: "US", name: "USA", flag: "🇺🇸", dial: "+1" },
];

export const COUNTRY_CODES = COUNTRIES.map((c) => c.code) as [Country, ...Country[]];
export const DEFAULT_COUNTRY: Country = "LR";

export const isCountry = (v: unknown): v is Country => typeof v === "string" && (COUNTRY_CODES as string[]).includes(v);
export const countryInfo = (c: Country) => COUNTRIES.find((x) => x.code === c) ?? COUNTRIES[0];
export const countryName = (c: Country) => countryInfo(c).name;

/** First-open guess from the device's time zone / language: anywhere in the US → USA, otherwise Liberia. */
export function guessCountry(timeZone?: string | null, locale?: string | null): Country {
  const tz = timeZone ?? "";
  if (/^America\/(New_York|Detroit|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Boise|Indiana|Kentucky|North_Dakota|Menominee|Juneau|Sitka|Nome|Adak)/.test(tz) || tz === "Pacific/Honolulu")
    return "US";
  if (tz === "Africa/Monrovia") return "LR";
  if (!tz && /[-_]US$/i.test(locale ?? "")) return "US";
  return "LR";
}

/** Common towns, offered as suggestions in city fields. */
export const CITIES: Record<Country, string[]> = {
  LR: [
    "Monrovia",
    "Paynesville",
    "Gbarnga",
    "Buchanan",
    "Kakata",
    "Ganta",
    "Harper",
    "Zwedru",
    "Voinjama",
    "Robertsport",
    "Tubmanburg",
    "Sanniquellie",
    "Greenville",
    "Barclayville",
    "Fish Town",
    "Cestos City",
    "Bensonville",
  ],
  US: [
    "Philadelphia, PA",
    "Minneapolis, MN",
    "Brooklyn Park, MN",
    "Staten Island, NY",
    "New York, NY",
    "Newark, NJ",
    "Trenton, NJ",
    "Providence, RI",
    "Atlanta, GA",
    "Houston, TX",
    "Dallas, TX",
    "Charlotte, NC",
    "Columbus, OH",
    "Silver Spring, MD",
    "Washington, DC",
    "Boston, MA",
    "Chicago, IL",
    "Los Angeles, CA",
  ],
};

/** Liberian towns (older screens — prefer CITIES[country]). */
export const LIBERIAN_CITIES = CITIES.LR;
