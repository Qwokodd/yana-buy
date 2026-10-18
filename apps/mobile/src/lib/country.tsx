import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_COUNTRY, guessCountry, isCountry, type Country } from "@yanabuy/shared";
import { storage } from "./storage";

const KEY = "yanabuy.country";

/** Read by the API client on every request (see lib/api.ts). */
let current: Country = DEFAULT_COUNTRY;
export const currentCountry = () => current;

/** First open: from the phone's time zone (US zones → USA, anything else → Liberia). Language isn't used — most phones say "en-US" everywhere. */
function firstGuess(): Country {
  try {
    return guessCountry(Intl.DateTimeFormat().resolvedOptions().timeZone ?? null, null);
  } catch {
    return DEFAULT_COUNTRY;
  }
}

const Ctx = createContext<{ country: Country; setCountry: (c: Country) => void }>({ country: DEFAULT_COUNTRY, setCountry: () => {} });

/**
 * The country switch. Lists only show shops from the chosen country. Changing it
 * starts the screens again from Home so everything is fetched for the new country.
 */
export function CountryProvider({ children }: { children: ReactNode }) {
  const [country, setState] = useState<Country | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    storage.get(KEY).then((saved) => {
      current = isCountry(saved) ? saved : firstGuess();
      setState(current);
    });
  }, []);

  const setCountry = (c: Country) => {
    if (c === current) return;
    current = c;
    storage.set(KEY, c);
    setState(c);
    setVersion((v) => v + 1);
  };

  // Wait for the saved choice so the first screens already ask for the right country.
  if (!country) return null;
  return (
    <Ctx.Provider value={{ country, setCountry }}>
      <Fragment key={version}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export const useCountry = () => useContext(Ctx);
