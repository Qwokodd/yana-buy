import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Fulfilment } from "@yanabuy/shared";
import { storage } from "./storage";
import { FoodHowPicker } from "@/components/FoodHowPicker";

export type Mode = "goods" | "food";
export type FoodHow = Fulfilment;

/** Read by the API client on every request (see lib/api.ts): food prices depend on it. */
let currentHow: FoodHow = "delivery";
export const currentFoodHow = () => currentHow;
const KEY = "yanabuy.foodHow";

type Value = {
  mode: Mode;
  /** The middle tab button: Goods ⇄ Food (going to Food asks delivery / pickup / eat in). */
  toggle: () => void;
  /** Change mode quietly (e.g. following a link). */
  setMode: (m: Mode) => void;
  /** The buyer pressed a Goods / Food switch. */
  switchMode: (m: Mode) => void;
  foodHow: FoodHow;
  setFoodHow: (h: FoodHow) => void;
  askFoodHow: () => void;
};
const Ctx = createContext<Value>({
  mode: "goods",
  toggle: () => {},
  setMode: () => {},
  switchMode: () => {},
  foodHow: "delivery",
  setFoodHow: () => {},
  askFoodHow: () => {},
});

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("goods");
  const [foodHow, setHowState] = useState<FoodHow>("delivery");
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    storage.get(KEY).then((v) => {
      if (v === "delivery" || v === "pickup" || v === "eat_in") {
        currentHow = v;
        setHowState(v);
      }
    });
  }, []);
  const setFoodHow = (h: FoodHow) => {
    currentHow = h;
    setHowState(h);
    storage.set(KEY, h);
  };
  const switchMode = (m: Mode) => {
    if (m === "food") setAsking(true);
    setMode(m);
  };
  return (
    <Ctx.Provider
      value={{
        mode,
        setMode,
        switchMode,
        toggle: () => switchMode(mode === "goods" ? "food" : "goods"),
        foodHow,
        setFoodHow,
        askFoodHow: () => setAsking(true),
      }}
    >
      {children}
      <FoodHowPicker
        visible={asking}
        current={foodHow}
        onPick={(h) => {
          setFoodHow(h);
          setAsking(false);
        }}
        onClose={() => setAsking(false)}
      />
    </Ctx.Provider>
  );
}

export const useMode = () => useContext(Ctx);
