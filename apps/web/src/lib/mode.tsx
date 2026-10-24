"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Fulfilment } from "@yanabuy/shared";
import { FoodHowPicker } from "@/components/FoodHowPicker";

export type Mode = "goods" | "food";
export type FoodHow = Fulfilment;

/** Read by the API client on every request (see lib/api.ts): food prices depend on it. */
let currentHow: FoodHow = "delivery";
export const currentFoodHow = () => currentHow;

type Value = {
  mode: Mode;
  /** Change mode quietly (e.g. following a link). */
  setMode: (m: Mode) => void;
  /** The buyer pressed the Goods / Food switch: going to Food asks delivery, pickup or eat in. */
  switchMode: (m: Mode) => void;
  /** Food: delivery, pickup or eat in. */
  foodHow: FoodHow;
  setFoodHow: (h: FoodHow) => void;
  /** Open the delivery / pickup / eat-in question. */
  askFoodHow: () => void;
};
const ModeContext = createContext<Value>({
  mode: "goods",
  setMode: () => {},
  switchMode: () => {},
  foodHow: "delivery",
  setFoodHow: () => {},
  askFoodHow: () => {},
});

const isHow = (v: unknown): v is FoodHow => v === "delivery" || v === "pickup" || v === "eat_in";

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>("goods");
  const [foodHow, setHowState] = useState<FoodHow>("delivery");
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("yanabuy.mode");
      if (saved === "goods" || saved === "food") setModeState(saved);
      const how = localStorage.getItem("yanabuy.foodHow");
      if (isHow(how)) {
        currentHow = how;
        setHowState(how);
      }
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
  const setFoodHow = (h: FoodHow) => {
    currentHow = h;
    setHowState(h);
    try {
      localStorage.setItem("yanabuy.foodHow", h);
    } catch {
      /* ignore */
    }
  };
  const switchMode = (m: Mode) => {
    if (m === "food") setAsking(true);
    setMode(m);
  };
  return (
    <ModeContext.Provider value={{ mode, setMode, switchMode, foodHow, setFoodHow, askFoodHow: () => setAsking(true) }}>
      {children}
      {asking && (
        <FoodHowPicker
          current={foodHow}
          onPick={(h) => {
            setFoodHow(h);
            setAsking(false);
          }}
          onClose={() => setAsking(false)}
        />
      )}
    </ModeContext.Provider>
  );
}

export const useMode = () => useContext(ModeContext);
