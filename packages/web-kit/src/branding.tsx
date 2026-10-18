"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { brandCssVars, DEFAULT_BRANDING, type Branding } from "@yanabuy/shared";

const Ctx = createContext<{ branding: Branding; setBranding: (b: Branding) => void }>({
  branding: DEFAULT_BRANDING,
  setBranding: () => {},
});

/**
 * Holds the live branding (name, logo, colours). The page starts with the
 * branding the server rendered, so there's no flash of the old colours.
 */
export function BrandingProvider({ initial, children }: { initial?: Branding | null; children: ReactNode }) {
  const [branding, setState] = useState<Branding>(initial ?? DEFAULT_BRANDING);
  const setBranding = (b: Branding) => {
    setState(b);
    // Repaint straight away (the admin sees their own change without reloading).
    if (typeof document !== "undefined") {
      for (const part of brandCssVars(b.colors).split(";")) {
        const [k, v] = part.split(":");
        document.documentElement.style.setProperty(k, v);
      }
    }
  };
  return <Ctx.Provider value={{ branding, setBranding }}>{children}</Ctx.Provider>;
}

export const useBranding = () => useContext(Ctx);
