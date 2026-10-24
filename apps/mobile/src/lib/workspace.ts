import type { User } from "@yanabuy/shared";

/**
 * Sellers open the app on their shop / restaurant, riders on their deliveries.
 * Only buyers (and admins) start on the product feed.
 */
export function workspaceFor(user: User | null | undefined): "/sell" | "/rider" | null {
  if (user?.role === "vendor") return "/sell";
  if (user?.role === "rider") return "/rider";
  return null;
}

/** "My shop" or "My restaurant" for a seller (falls back to "My shop" until the shop is known). */
export const workspaceTitle = (user: User | null | undefined) =>
  user?.role === "rider" ? "My deliveries" : user?.myShop?.kind === "restaurant" ? "My restaurant" : "My shop";

// Set when a seller or rider taps "Browse like a buyer" — lasts until the app is closed.
let browsing = false;
export const isBrowsing = () => browsing;
export function setBrowsing(on: boolean) {
  browsing = on;
}
