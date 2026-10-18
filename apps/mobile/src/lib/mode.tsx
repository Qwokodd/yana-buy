import { createContext, useContext, useState, type ReactNode } from "react";

export type Mode = "goods" | "food";
const Ctx = createContext<{ mode: Mode; toggle: () => void; setMode: (m: Mode) => void }>({
  mode: "goods",
  toggle: () => {},
  setMode: () => {},
});

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("goods");
  return <Ctx.Provider value={{ mode, setMode, toggle: () => setMode((m) => (m === "goods" ? "food" : "goods")) }}>{children}</Ctx.Provider>;
}

export const useMode = () => useContext(Ctx);
