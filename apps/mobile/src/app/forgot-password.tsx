import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ApiError } from "@yanabuy/shared";
import { AuthScreen } from "@/components/AuthScreen";
import { Button, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCountry } from "@/lib/country";
import { colors, font } from "@/lib/theme";

/** Forgot password: phone number or email → 6-digit code (by text or email) → new password. */
export default function ForgotPassword() {
  const params = useLocalSearchParams<{ phone?: string; login?: string }>();
  const phoneExample = useCountry().country === "US" ? "(215) 555 0123" : "0770 000 000";
  const { setUser } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState(params.login ?? params.phone ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "danger" | "info" | "success"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const fail = (err: unknown) => {
    setNotice({ tone: "danger", text: err instanceof Error ? err.message : "Something went wrong" });
    if (err instanceof ApiError && err.fields) setFields(err.fields);
  };

  async function sendCode() {
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      await api.auth.forgotPassword(phone);
      setStep("code");
      setNotice({
        tone: "info",
        text: phone.includes("@")
          ? "If this email has an account, we've emailed it a 6-digit code (check spam too). It works for 15 minutes."
          : "If this number has an account, we've texted it a 6-digit code (or emailed it, if texts can't be sent). It works for 15 minutes.",
      });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      const res = await api.auth.resetPassword({ login: phone, code, password });
      setUser(res.user);
      router.dismissAll?.();
      router.replace("/profile");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen title="Reset your password" subtitle="We'll send a code to your phone or email.">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {step === "phone" ? (
        <>
          <Field
            label="Phone number or email"
            value={phone}
            onChangeText={setPhone}
            error={fields.login ?? fields.phone ?? fields.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            placeholder={`${phoneExample} or you@example.com`}
            hint="The one you log in with."
          />
          <Button title="Send me a code" onPress={sendCode} busy={busy} />
        </>
      ) : (
        <>
          <Field
            label="6-digit code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            error={fields.code}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            placeholder="123456"
            style={{ letterSpacing: 6, fontSize: 20 }}
          />
          <Field label="New password" value={password} onChangeText={setPassword} error={fields.password} secure autoComplete="new-password" hint="At least 8 characters." />
          <Button title="Save new password" onPress={reset} busy={busy} disabled={code.length !== 6} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Pressable accessibilityRole="button" onPress={sendCode} disabled={busy} style={{ paddingVertical: 6 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.purple }}>Send a new code</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setStep("phone")} style={{ paddingVertical: 6 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.muted }}>Use a different number or email</Text>
            </Pressable>
          </View>
          <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>No code? Check the number or email, wait a minute and send a new one — or contact YanaBuy support.</Text>
        </>
      )}
    </AuthScreen>
  );
}
