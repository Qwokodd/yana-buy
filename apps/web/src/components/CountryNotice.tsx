"use client";

import { countryInfo, type Country } from "@yanabuy/shared";
import { useCountry } from "@/lib/country";

/** Shown on a shop or product from another country (opened from a shared link). */
export function CountryNotice({ country, what = "shop" }: { country: Country; what?: "shop" | "product" }) {
  const { country: shopping, setCountry } = useCountry();
  if (country === shopping) return null;
  const there = countryInfo(country);
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-amber bg-amber/15 px-4 py-3 text-sm">
      <p>
        <span aria-hidden="true">{there.flag} </span>
        This {what === "shop" ? "shop" : "item"} is in <strong>{there.name}</strong>. You're shopping in {countryInfo(shopping).name}.
      </p>
      <button type="button" onClick={() => setCountry(country)} className="h-9 rounded-full bg-purple px-4 text-[13px] font-bold text-white hover:bg-purple/90">
        Switch to {there.name}
      </button>
    </div>
  );
}
