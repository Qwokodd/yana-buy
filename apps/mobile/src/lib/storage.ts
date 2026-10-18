import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** Small key-value storage: the phone's keychain, or localStorage in the web preview. */
export const storage = {
  async get(key: string) {
    try {
      return Platform.OS === "web" ? (globalThis.localStorage?.getItem(key) ?? null) : await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string) {
    try {
      if (Platform.OS === "web") globalThis.localStorage?.setItem(key, value);
      else await SecureStore.setItemAsync(key, value);
    } catch {
      /* not important enough to fail over */
    }
  },
};
