import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createApi, type TokenStore } from "@yanabuy/shared";
import { currentCountry } from "./country";

/**
 * Where the API is. On a phone running Expo Go, "localhost" would be the
 * phone itself, so by default we use the same computer that serves the app
 * (the host part of the Expo address) on port 4000.
 */
function apiUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:4000`;
  return Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000";
}

export const API_URL = apiUrl();

const KEY = "yanabuy.session";

// Tokens live in the phone's secure keychain (web preview falls back to localStorage).
const tokens: TokenStore = {
  async get() {
    const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return raw ? JSON.parse(raw) : null;
  },
  async set(value) {
    const raw = JSON.stringify(value);
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, raw);
    else await SecureStore.setItemAsync(KEY, raw);
  },
  async clear() {
    if (Platform.OS === "web") globalThis.localStorage?.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  },
};

export const api = createApi({ baseUrl: API_URL, tokens, country: currentCountry });
