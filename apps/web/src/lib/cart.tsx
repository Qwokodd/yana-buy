"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CartItem } from "@yanabuy/shared";

const KEY = "yanabuy.cart";

interface CartValue {
  items: CartItem[];
  count: number;
  /** variantId: the colour/size picked, for products with options. */
  add: (productId: string, quantity?: number, variantId?: string | null) => void;
  setQuantity: (productId: string, quantity: number, variantId?: string | null) => void;
  remove: (productId: string, variantId?: string | null) => void;
  clear: () => void;
}

/** Same product and same choice = the same cart line. */
const same = (i: CartItem, productId: string, variantId?: string | null) => i.productId === productId && (i.variantId ?? null) === (variantId ?? null);

const Ctx = createContext<CartValue | null>(null);

/** The cart lives in this browser. Prices are always checked again by the server. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(saved)) setItems(saved.filter((i) => i && typeof i.productId === "string" && i.quantity > 0));
    } catch {
      /* start empty */
    }
    // Keep two open tabs in step.
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        try {
          setItems(JSON.parse(e.newValue ?? "[]"));
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const save = useCallback((next: CartItem[]) => {
    setItems(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode: cart lasts until the tab closes */
    }
  }, []);

  const value = useMemo<CartValue>(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      add: (productId, quantity = 1, variantId = null) => {
        const found = items.find((i) => same(i, productId, variantId));
        save(
          found
            ? items.map((i) => (same(i, productId, variantId) ? { ...i, quantity: Math.min(99, i.quantity + quantity) } : i))
            : [...items, { productId, variantId: variantId ?? null, quantity: Math.min(99, quantity) }]
        );
      },
      setQuantity: (productId, quantity, variantId = null) =>
        save(
          quantity <= 0
            ? items.filter((i) => !same(i, productId, variantId))
            : items.map((i) => (same(i, productId, variantId) ? { ...i, quantity: Math.min(99, quantity) } : i))
        ),
      remove: (productId, variantId = null) => save(items.filter((i) => !same(i, productId, variantId))),
      clear: () => save([]),
    }),
    [items, save]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart outside CartProvider");
  return v;
}
