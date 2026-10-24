import type { User } from "@yanabuy/shared";

/**
 * Sellers start on their shop / restaurant, riders on their deliveries.
 * Only buyers (and admins) start on the product feed.
 */
export function workspaceFor(user: User | null | undefined): "/sell" | "/rider" | null {
  if (user?.role === "vendor") return "/sell";
  if (user?.role === "rider") return "/rider";
  return null;
}

/** Where to go after logging in. */
export const homeFor = (user: User | null | undefined) => workspaceFor(user) ?? "/";

/** "My shop", "My restaurant" or "My deliveries". */
export const workspaceTitle = (user: User | null | undefined) =>
  user?.role === "rider" ? "My deliveries" : user?.myShop?.kind === "restaurant" ? "My restaurant" : "My shop";

// "Browse like a buyer" — remembered for this browser tab only.
const KEY = "yb-browse-as-buyer";
export function isBrowsing() {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
export function setBrowsing(on: boolean) {
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: they just land on their own page next time */
  }
}
