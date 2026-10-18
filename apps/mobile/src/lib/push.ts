import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { phonePath } from "@yanabuy/shared";
import { api } from "./api";
import { storage } from "./storage";

const KEY = "yanabuy.pushToken";

// Show alerts even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Asks to send notifications and registers this phone with the server.
 * Works in store/development builds. Expo Go on Android can't receive pushes —
 * there it quietly does nothing and the bell in the app still works.
 */
export async function registerForPush() {
  try {
    if (!Device.isDevice || Platform.OS === "web") return;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", { name: "YanaBuy", importance: Notifications.AndroidImportance.HIGH, lightColor: "#491F67" });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return; // needs an EAS project (set up when making the store build)
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.me.registerPush(token, Platform.OS === "ios" ? "ios" : "android");
    await storage.set(KEY, token);
  } catch {
    /* Expo Go, no Google services, offline… the in-app bell still works */
  }
}

/** On log-out: stop pushes to this phone for that account. */
export async function unregisterPush() {
  try {
    const token = await storage.get(KEY);
    if (token) await api.me.unregisterPush(token);
  } catch {
    /* ignore */
  }
}

/** Opening a notification goes to the right screen. Returns a cleanup function. */
export function listenForTaps(go: (path: string) => void) {
  try {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const link = (r.notification.request.content.data as { link?: string | null } | undefined)?.link;
      const path = phonePath(link);
      if (path) go(path);
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
