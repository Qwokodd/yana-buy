import { useCallback, useEffect, useRef, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque";
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold } from "@expo-google-fonts/figtree";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/lib/auth";
import { ModeProvider } from "@/lib/mode";
import { CartProvider } from "@/lib/cart";
import { WishlistProvider } from "@/lib/wishlist";
import { CountryProvider } from "@/lib/country";
import { listenForTaps, registerForPush } from "@/lib/push";
import { useAuth } from "@/lib/auth";
import { useRouter, useSegments } from "expo-router";
import { colors } from "@/lib/theme";
import { BrandingProvider } from "@/lib/branding";
import { useLocationReporter } from "@/lib/location";
import { isBrowsing, workspaceFor } from "@/lib/workspace";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_800ExtraBold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });

  const [brandReady, setBrandReady] = useState(false);
  const onBrandReady = useCallback(() => setBrandReady(true), []);
  const fontsReady = loaded || !!error;

  useEffect(() => {
    if (fontsReady && brandReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady, brandReady]);

  return (
    <SafeAreaProvider>
      <BrandingProvider onReady={onBrandReady}>{fontsReady ? <App /> : null}</BrandingProvider>
    </SafeAreaProvider>
  );
}

function App() {
  return (
    <>
      <AuthProvider>
        <ModeProvider>
          <CartProvider>
          <WishlistProvider>
          <PushSetup />
          <LocationSetup />
          <StatusBar style="dark" />
          <CountryProvider>
          <EmailGate />
          <WorkspaceGate />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{ presentation: "modal" }} />
            <Stack.Screen name="register" options={{ presentation: "modal" }} />
            <Stack.Screen name="forgot-password" options={{ presentation: "modal" }} />
            <Stack.Screen name="sell" />
          </Stack>
          </CountryProvider>
          </WishlistProvider>
          </CartProvider>
        </ModeProvider>
      </AuthProvider>
    </>
  );
}

/** Anyone logged in without a confirmed email is asked for it first (the server needs it for checkout too). */
function EmailGate() {
  const { user } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const here = segments[0] as string | undefined;
  useEffect(() => {
    if (user?.needsVerification && here !== "verify-email" && here !== "login" && here !== "register" && here !== "forgot-password") router.push("/verify-email");
  }, [user, here, router]);
  return null;
}

/**
 * Sellers land on "My shop" / "My restaurant" and riders on "My deliveries" — when the app opens
 * logged in, and right after they log in. Buyers stay on the product feed.
 * Only from the home tabs or the log-in screens, so a notification tap still opens its own page.
 */
function WorkspaceGate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const here = useRef<string | undefined>(undefined);
  here.current = segments[0] as string | undefined;
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    if (!user) {
      handled.current = null;
      return;
    }
    if (handled.current === user.id) return;
    const home = workspaceFor(user);
    if (!home) {
      handled.current = user.id;
      return;
    }
    // Let the log-in sheet close first. Only marked as done once the timer actually runs, so a quick
    // account refresh right after log-in (which re-runs this effect and cancels the timer) can't skip it.
    const t = setTimeout(() => {
      handled.current = user.id;
      if (isBrowsing()) return;
      const at = here.current;
      if (at === undefined || at === "(tabs)" || at === "login" || at === "register") router.replace(home);
    }, 300);
    return () => clearTimeout(t);
  }, [user, loading, router]);
  return null;
}

/** Once logged in: ask for push permission, register the phone, and open the right screen when a notification is tapped. */
function PushSetup() {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (user) void registerForPush();
  }, [user]);
  useEffect(() => listenForTaps((path) => router.push(path as never)), [router]);
  return null;
}

/** Every logged-in account keeps a current location (so vendors and riders can find buyers). */
function LocationSetup() {
  const { user } = useAuth();
  // Riders send theirs live from the deliveries screen while online.
  useLocationReporter(user?.id);
  return null;
}
