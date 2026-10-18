import type { TokenStore } from "@yanabuy/shared";

/** Browser token storage under an app-specific key (web and admin never share a session). */
export function browserTokenStore(key: string): TokenStore {
  return {
    async get() {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    async set(tokens) {
      try {
        window.localStorage.setItem(key, JSON.stringify(tokens));
      } catch {
        /* storage full or blocked: the session just won't survive a reload */
      }
    },
    async clear() {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}
