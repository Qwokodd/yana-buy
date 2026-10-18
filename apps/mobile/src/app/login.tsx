import { useState } from "react";
import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { ApiError } from "@yanabuy/shared";
import { AuthScreen } from "@/components/AuthScreen";
import { Button, Field, Notice } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors, font } from "@/lib/theme";
import { useCountry } from "@/lib/country";

export default function Login() {
  const phoneExample = useCountry().country === "US" ? "(215) 555 0123" : "0770 000 000";
  const { login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await login(phone, password);
      // Close the login sheet and go back to where they were.
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log in");
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen title="Welcome back" subtitle="Log in with the phone number you signed up with.">
      {error && <Notice>{error}</Notice>}
      <Field label="Phone number" value={phone} onChangeText={setPhone} error={fields.phone} keyboardType="phone-pad" autoComplete="tel" placeholder={phoneExample} />
      <Field label="Password" value={password} onChangeText={setPassword} error={fields.password} secure autoComplete="current-password" onSubmitEditing={submit} />
      <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/forgot-password", params: phone ? { phone } : {} })} style={{ alignSelf: "flex-end", marginTop: -6 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: colors.purple }}>Forgot your password?</Text>
      </Pressable>
      <Button title="Log in" onPress={submit} busy={busy} style={{ marginTop: 4 }} />
      <Pressable accessibilityRole="link" onPress={() => router.replace("/register")} style={{ alignItems: "center", paddingVertical: 8 }}>
        <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted }}>
          New to YanaBuy? <Text style={{ fontFamily: font.bold, color: colors.purple }}>Create an account</Text>
        </Text>
      </Pressable>
    </AuthScreen>
  );
}
