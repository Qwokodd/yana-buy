"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Mode = "goods" | "food";
const ModeContext = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({ mode: "goods", setMode: () => {} });

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>("goods");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("yanabuy.mode");
      if (saved === "goods" || saved === "food") setModeState(saved);
    } catch {
      /* ignore */
    }
  }, []);
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem("yanabuy.mode", m);
    } catch {
      /* ignore */
    }
  };
  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export const useMode = () => useContext(ModeContext);
