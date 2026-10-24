import { useState } from "react";
import { Alert, Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { ApiError, type LoginChallenge } from "@yanabuy/shared";
import { AuthScreen } from "@/components/AuthScreen";
import { LoginCode } from "@/components/LoginCode";
import { Button, Field, Notice } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";
import { useCountry } from "@/lib/country";

/** Sign up with a phone number (email optional). Buyers can browse and order straight away. */
export default function Register() {
  const phoneExample = useCountry().country === "US" ? "(215) 555 0123" : "0770 000 000";
  const { register, verifyCode } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", city: "", password: "" });
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function finish(welcomeBack: boolean) {
    // Bought on the old Shopify store with this number? Their past orders are waiting.
    const past = welcomeBack ? { items: [1] } : await api.me.shopifyOrders().catch(() => ({ items: [] }));
    if (past.items.length) Alert.alert("Welcome back!", "Your orders from the old YanaBuy store are in Profile → Your orders.");
    // Straight back to where they were — buyers don't need to confirm anything.
    if (router.canGoBack()) router.back();
    else router.replace("/profile");
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const next = await register({
        fullName: form.fullName,
        phone: form.phone,
        email: form.email || undefined,
        password: form.password,
        city: form.city || undefined,
      });
      if (next) setChallenge(next);
      else await finish(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your account");
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <AuthScreen title="Welcome back!" subtitle="You shopped with YanaBuy before. Enter the code we sent to prove this account is yours — your past orders will be there.">
        <LoginCode
          challenge={challenge}
          onVerify={async (input) => {
            await verifyCode(input);
            await finish(true);
          }}
          onBack={() => setChallenge(null)}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Create your account" subtitle="It takes less than a minute — then start shopping straight away.">
      {error && <Notice>{error}</Notice>}
      <Field label="Full name" value={form.fullName} onChangeText={set("fullName")} error={fields.fullName} autoComplete="name" />
      <Field label="Phone number" value={form.phone} onChangeText={set("phone")} error={fields.phone} keyboardType="phone-pad" autoComplete="tel" placeholder={phoneExample} hint="You'll log in with this number. Use your mobile money number so paying is easy." />
      <Field label="Email (optional)" value={form.email} onChangeText={set("email")} error={fields.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" hint="For receipts and order updates. Needed later if you want to sell or deliver." />
      <Field label="City (optional)" value={form.city} onChangeText={set("city")} placeholder="Monrovia" />
      <Field label="Password" value={form.password} onChangeText={set("password")} error={fields.password} secure autoComplete="new-password" hint="At least 8 characters." />
      <Button title="Create account" onPress={submit} busy={busy} style={{ marginTop: 4 }} />
      <Pressable accessibilityRole="link" onPress={() => router.replace("/login")} style={{ alignItems: "center", paddingVertical: 8 }}>
        <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted }}>
          Already have an account? <Text style={{ fontFamily: font.bold, color: colors.purple }}>Log in</Text>
        </Text>
      </Pressable>
    </AuthScreen>
  );
}
