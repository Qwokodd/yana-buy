import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ApiError, type User } from "@yanabuy/shared";
import { Button, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

/** Add, change or confirm an email: type it, get a 6-digit code by email, enter the code. */
export function EmailConfirm({ user, onDone, changing = false }: { user: User; onDone: (u: User) => void; changing?: boolean }) {
  const waiting = !changing && !!user.email && !user.emailVerified;
  const [email, setEmail] = useState(changing ? "" : (user.email ?? ""));
  const [sentTo, setSentTo] = useState<string | null>(waiting ? user.email : null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(
    waiting ? { tone: "info", text: `We sent a 6-digit code to ${user.email}. Check your inbox (and spam).` } : null
  );
  const [fields, setFields] = useState<Record<string, string>>({});

  const fail = (err: unknown) => {
    setNotice({ tone: "danger", text: err instanceof Error ? err.message : "Something went wrong" });
    if (err instanceof ApiError && err.fields) setFields(err.fields);
  };

  async function send() {
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      const target = email.trim().toLowerCase();
      const r = await api.me.sendEmailCode(target || undefined);
      setSentTo(r.email);
      setCode("");
      setNotice({ tone: "info", text: r.sent ? `We sent a 6-digit code to ${r.email}. Check your inbox (and spam).` : "Email isn't set up on the server yet — the code is printed in the server window." });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      const r = await api.me.verifyEmail(code);
      setNotice({ tone: "success", text: "Email confirmed." });
      onDone(r.user);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {!sentTo ? (
        <>
          <Field label="Email address" value={email} onChangeText={setEmail} error={fields.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" />
          <Button title="Send me a code" onPress={send} busy={busy} />
        </>
      ) : (
        <>
          <Field
            label={`Code sent to ${sentTo}`}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            error={fields.code}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            placeholder="123456"
            style={{ letterSpacing: 6, fontSize: 20 }}
          />
          <Button title="Confirm" onPress={verify} busy={busy} disabled={code.length !== 6} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Pressable accessibilityRole="button" onPress={send} disabled={busy} style={{ paddingVertical: 6 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.purple }}>Send a new code</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSentTo(null);
                setEmail("");
                setNotice(null);
              }}
              style={{ paddingVertical: 6 }}
            >
              <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.muted }}>Use a different email</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}
