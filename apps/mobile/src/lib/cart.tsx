import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CartItem } from "@yanabuy/shared";
import { storage } from "./storage";

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

/** The cart is kept on the phone. The server checks prices again at checkout. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    storage.get(KEY).then((raw) => {
      try {
        const saved = JSON.parse(raw ?? "[]");
        if (Array.isArray(saved)) setItems(saved.filter((i) => i && typeof i.productId === "string" && i.quantity > 0));
      } catch {
        /* start empty */
      }
      loaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (loaded.current) storage.set(KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartValue>(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      add: (productId, quantity = 1, variantId = null) =>
        setItems((prev) => {
          const found = prev.find((i) => same(i, productId, variantId));
          return found
            ? prev.map((i) => (same(i, productId, variantId) ? { ...i, quantity: Math.min(99, i.quantity + quantity) } : i))
            : [...prev, { productId, variantId: variantId ?? null, quantity: Math.min(99, quantity) }];
        }),
      setQuantity: (productId, quantity, variantId = null) =>
        setItems((prev) =>
          quantity <= 0
            ? prev.filter((i) => !same(i, productId, variantId))
            : prev.map((i) => (same(i, productId, variantId) ? { ...i, quantity: Math.min(99, quantity) } : i))
        ),
      remove: (productId, variantId = null) => setItems((prev) => prev.filter((i) => !same(i, productId, variantId))),
      clear: () => setItems([]),
    }),
    [items]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart outside CartProvider");
  return v;
}
