import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loadState, saveState } from "../utils/storage";

const FoodCartContext = createContext(null);

// Separate from the marketplace CartContext on purpose — a food order is
// for a single restaurant at a time (like most delivery apps), so this
// cart tracks a restaurantId alongside its line items and clears itself
// if you start ordering from a different restaurant.
export function FoodCartProvider({ children }) {
  const [restaurantId, setRestaurantId] = useState(() => loadState("foodCartRestaurant", null));
  // items: [{ menuItemId, qty }]
  const [items, setItems] = useState(() => loadState("foodCart", []));

  useEffect(() => saveState("foodCartRestaurant", restaurantId), [restaurantId]);
  useEffect(() => saveState("foodCart", items), [items]);

  // Returns false (and does nothing) if the caller should ask the user to
  // confirm clearing the cart first because it belongs to another restaurant.
  function addItem(newRestaurantId, menuItemId, qty = 1, { force = false } = {}) {
    if (restaurantId && restaurantId !== newRestaurantId && items.length > 0 && !force) {
      return false;
    }
    if (restaurantId !== newRestaurantId) {
      setRestaurantId(newRestaurantId);
      setItems([{ menuItemId, qty }]);
      return true;
    }
    setItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === menuItemId);
      if (existing) {
        return prev.map((i) => (i.menuItemId === menuItemId ? { ...i, qty: i.qty + qty } : i));
      }
      return [...prev, { menuItemId, qty }];
    });
    return true;
  }

  function removeItem(menuItemId) {
    setItems((prev) => {
      const next = prev.filter((i) => i.menuItemId !== menuItemId);
      if (next.length === 0) setRestaurantId(null);
      return next;
    });
  }

  function setQty(menuItemId, qty) {
    if (qty <= 0) return removeItem(menuItemId);
    setItems((prev) => prev.map((i) => (i.menuItemId === menuItemId ? { ...i, qty } : i)));
  }

  function clear() {
    setItems([]);
    setRestaurantId(null);
  }

  const count = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items]);

  return (
    <FoodCartContext.Provider
      value={{ restaurantId, items, addItem, removeItem, setQty, clear, count }}
    >
      {children}
    </FoodCartContext.Provider>
  );
}

export function useFoodCart() {
  const ctx = useContext(FoodCartContext);
  if (!ctx) throw new Error("useFoodCart must be used within FoodCartProvider");
  return ctx;
}
