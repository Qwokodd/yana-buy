"use client";

import { useEffect } from "react";
import type { Fulfilment } from "@yanabuy/shared";

export const FOOD_HOW: { value: Fulfilment; icon: string; title: string; text: string }[] = [
  { value: "delivery", icon: "🛵", title: "Delivery", text: "A rider brings it to you. Delivery fee worked out at checkout." },
  { value: "pickup", icon: "🛍️", title: "Pickup", text: "Order ahead and collect it at the restaurant." },
  { value: "eat_in", icon: "🍽️", title: "Eat in", text: "Eat at the restaurant — you pay the restaurant's own menu price." },
];

/** "How do you want your food?" — shown when switching to Food. */
export function FoodHowPicker({ current, onPick, onClose }: { current: Fulfilment; onPick: (h: Fulfilment) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="food-how-title"
        className="w-full max-w-md rounded-sheet bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="food-how-title" className="font-display text-2xl font-extrabold">
          How do you want your food?
        </h2>
        <p className="mt-1 text-sm text-muted">Menu prices depend on this. You can change it any time.</p>
        <div className="mt-4 flex flex-col gap-2.5">
          {FOOD_HOW.map((o) => (
            <button
              key={o.value}
              type="button"
              autoFocus={o.value === current}
              onClick={() => onPick(o.value)}
              className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left hover:border-orange ${o.value === current ? "border-orange bg-orange-tint" : "border-line"}`}
            >
              <span className="text-2xl" aria-hidden>
                {o.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{o.title}</span>
                <span className="text-[13px] text-muted">{o.text}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
