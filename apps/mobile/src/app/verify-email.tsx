import { useEffect } from "react";
import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { AuthScreen } from "@/components/AuthScreen";
import { EmailConfirm } from "@/components/EmailConfirm";
import { useAuth } from "@/lib/auth";
import { colors, font } from "@/lib/theme";

/** "Confirm your email" — sellers and riders need a confirmed email (buyers never see this screen). */
export default function VerifyEmail() {
  const { user, setUser, logout } = useAuth();
  const router = useRouter();
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  useEffect(() => {
    if (!user) router.replace("/");
  }, [user, router]);
  if (!user) return null;
  return (
    <AuthScreen title={user.email ? "Confirm your email" : "Add your email"} subtitle="Sellers and riders need a confirmed email. We send orders, payouts and account messages there.">
      <EmailConfirm
        user={user}
        onDone={(u) => {
          setUser(u);
          leave();
        }}
      />
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          await logout();
          router.replace("/");
        }}
        style={{ alignItems: "center", paddingVertical: 10 }}
      >
        <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.muted }}>Log out</Text>
      </Pressable>
    </AuthScreen>
  );
}
