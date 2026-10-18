"use client";

import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_COUNTRY, guessCountry, isCountry, type Country } from "@yanabuy/shared";

const KEY = "yanabuy.country";

/** Read by the API client on every request (see lib/api.ts). */
let current: Country = DEFAULT_COUNTRY;
let loaded = false;
export const currentCountry = () => current;

function load(): Country {
  try {
    const saved = localStorage.getItem(KEY);
    if (isCountry(saved)) return saved;
  } catch {
    /* private mode */
  }
  return guessCountry(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language);
}

const Ctx = createContext<{ country: Country; setCountry: (c: Country) => void }>({ country: DEFAULT_COUNTRY, setCountry: () => {} });

/**
 * The country switch. Lists only show shops from the chosen country. Changing it
 * re-opens the page's content so everything is fetched again for the new country.
 */
export function CountryProvider({ children }: { children: ReactNode }) {
  // Set before any child effect runs, so the very first requests already use the right country.
  if (typeof window !== "undefined" && !loaded) {
    current = load();
    loaded = true;
  }
  const [country, setState] = useState<Country>(DEFAULT_COUNTRY);
  const [version, setVersion] = useState(0);
  useEffect(() => setState(current), []);

  const setCountry = (c: Country) => {
    if (c === current) return;
    current = c;
    try {
      localStorage.setItem(KEY, c);
    } catch {
      /* ignore */
    }
    setState(c);
    setVersion((v) => v + 1);
  };

  return (
    <Ctx.Provider value={{ country, setCountry }}>
      <Fragment key={version}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export const useCountry = () => useContext(Ctx);
