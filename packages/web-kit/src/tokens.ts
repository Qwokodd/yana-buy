import type { DeviceStore, TokenStore } from "@yanabuy/shared";

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

/** Browser storage for the "trust this device" token. It stays when logging out. */
export function browserDeviceStore(key: string): DeviceStore {
  return {
    async get() {
      if (typeof window === "undefined") return null;
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async set(token) {
      try {
        window.localStorage.setItem(key, token);
      } catch {
        /* blocked storage: they'll just be asked for a code next time */
      }
    },
  };
}
