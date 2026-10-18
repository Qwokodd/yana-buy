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

/** Forgot password: phone number → 6-digit code (email and/or SMS) → new password. */
export default function ForgotPassword() {
  const params = useLocalSearchParams<{ phone?: string }>();
  const phoneExample = useCountry().country === "US" ? "(215) 555 0123" : "0770 000 000";
  const { setUser } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState(params.phone ?? "");
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
      setNotice({ tone: "info", text: "If this number has an account, we've sent a 6-digit code to its email (and by text message). It works for 15 minutes." });
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
      const res = await api.auth.resetPassword({ phone, code, password });
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
    <AuthScreen title="Reset your password" subtitle="We'll send a code to the email and phone on your account.">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {step === "phone" ? (
        <>
          <Field label="Phone number" value={phone} onChangeText={setPhone} error={fields.phone} keyboardType="phone-pad" autoComplete="tel" placeholder={phoneExample} hint="The number you log in with." />
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
              <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.muted }}>Change number</Text>
            </Pressable>
          </View>
          <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>No email on your account and no text? Contact YanaBuy support from the number you signed up with.</Text>
        </>
      )}
    </AuthScreen>
  );
}
