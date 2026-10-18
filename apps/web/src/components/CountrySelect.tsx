"use client";

import { COUNTRIES, countryInfo, type Country } from "@yanabuy/shared";
import { useCountry } from "@/lib/country";

/** The "where are you shopping from" switch in the header. */
export function CountrySelect({ className = "" }: { className?: string }) {
  const { country, setCountry } = useCountry();
  return (
    <label className={`relative flex h-10 flex-shrink-0 items-center whitespace-nowrap rounded-full bg-white/10 pl-3 pr-7 text-sm font-bold text-white hover:bg-white/20 ${className}`}>
      <span className="sr-only">Country you're shopping in</span>
      <span aria-hidden="true" className="pointer-events-none">
        {countryInfo(country).flag} <span className="hidden sm:inline xl:hidden">{country}</span>
        <span className="hidden xl:inline">{countryInfo(country).name}</span>
      </span>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" className="pointer-events-none absolute right-2.5" fill="none">
        <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <select
        value={country}
        onChange={(e) => setCountry(e.target.value as Country)}
        className="absolute inset-0 cursor-pointer opacity-0"
        title="Country you're shopping in"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
