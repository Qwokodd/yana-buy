import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_BRANDING, fetchBranding, type Branding } from "@yanabuy/shared";
import { API_URL } from "./api";
import { storage } from "./storage";
import { applyBrandColors } from "./theme";

const KEY = "yanabuy.branding";
const Ctx = createContext<Branding>(DEFAULT_BRANDING);

/**
 * Loads the admin's branding (name, logo, colours) while the splash screen is
 * up: the latest from the server if it answers within 2 seconds, otherwise
 * the copy saved last time. Children render only once it's ready.
 */
export function BrandingProvider({ children, onReady }: { children: ReactNode; onReady?: () => void }) {
  const [branding, setBranding] = useState<Branding | null>(null);

  useEffect(() => {
    let done = false;
    (async () => {
      const cachedRaw = await storage.get(KEY);
      const cached = cachedRaw ? (JSON.parse(cachedRaw) as Branding) : null;
      const fresh = await fetchBranding(API_URL, 2000);
      // fetchBranding returns the defaults (updatedAt null) when the server can't be reached.
      const chosen = fresh.updatedAt || !cached ? fresh : cached;
      if (fresh.updatedAt) await storage.set(KEY, JSON.stringify(fresh));
      if (done) return;
      applyBrandColors(chosen.colors);
      setBranding(chosen);
    })();
    return () => {
      done = true;
    };
  }, []);

  useEffect(() => {
    if (branding) onReady?.();
  }, [branding, onReady]);

  if (!branding) return null;
  return <Ctx.Provider value={branding}>{children}</Ctx.Provider>;
}

export const useBranding = () => useContext(Ctx);
