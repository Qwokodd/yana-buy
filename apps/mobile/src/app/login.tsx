import { useState } from "react";
import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { ApiError, type LoginChallenge } from "@yanabuy/shared";
import { AuthScreen } from "@/components/AuthScreen";
import { LoginCode } from "@/components/LoginCode";
import { Button, Field, Notice } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors, font } from "@/lib/theme";
import { useCountry } from "@/lib/country";

/** Log in with a phone number or an email + password, then (usually) a 6-digit code. */
export default function Login() {
  const phoneExample = useCountry().country === "US" ? "(215) 555 0123" : "0770 000 000";
  const { login, verifyCode } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  // Close the login sheet and go back to where they were.
  const done = () => (router.canGoBack() ? router.back() : router.replace("/"));

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const next = await login(identifier, password);
      if (next) setChallenge(next);
      else done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log in");
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <AuthScreen title="Enter your code" subtitle={challenge.channel === "sms" ? "We just texted you a 6-digit code." : "We just emailed you a 6-digit code."}>
        <LoginCode
          challenge={challenge}
          onVerify={async (input) => {
            await verifyCode(input);
            done();
          }}
          onBack={() => {
            setChallenge(null);
            setPassword("");
          }}
        />
      </AuthScreen>
    );
  }

  const idError = fields.login ?? fields.phone ?? fields.email;
  return (
    <AuthScreen title="Welcome back" subtitle="Log in with your phone number or email.">
      {error && <Notice>{error}</Notice>}
      <Field
        label="Phone number or email"
        value={identifier}
        onChangeText={setIdentifier}
        error={idError}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        placeholder={`${phoneExample} or you@example.com`}
      />
      <Field label="Password" value={password} onChangeText={setPassword} error={fields.password} secure autoComplete="current-password" onSubmitEditing={submit} />
      <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/forgot-password", params: identifier ? { login: identifier } : {} })} style={{ alignSelf: "flex-end", marginTop: -6 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: colors.purple }}>Forgot your password?</Text>
      </Pressable>
      <Button title="Log in" onPress={submit} busy={busy} style={{ marginTop: 4 }} />
      <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted, textAlign: "center" }}>For your security we'll send you a 6-digit code to finish logging in.</Text>
      <Pressable accessibilityRole="link" onPress={() => router.replace("/register")} style={{ alignItems: "center", paddingVertical: 8 }}>
        <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted }}>
          New to YanaBuy? <Text style={{ fontFamily: font.bold, color: colors.purple }}>Create an account</Text>
        </Text>
      </Pressable>
    </AuthScreen>
  );
}
