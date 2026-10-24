import { useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { ApiError, formatPhone, type LoginChallenge, type LoginChannel, type User } from "@yanabuy/shared";
import { Button, Field, Notice } from "@/components/ui";
import { EmailConfirm } from "@/components/EmailConfirm";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

const sentLine = (c: LoginChallenge) =>
  c.channel === "sms" ? `We texted a 6-digit code to ${c.sentTo}.` : `We emailed a 6-digit code to ${c.sentTo}. Check your inbox (and spam).`;

/** A countdown before "Send a new code" works again. */
function useCooldown(start: number) {
  const [left, setLeft] = useState(start);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong");

function CodeField({ label, code, setCode, error }: { label: string; code: string; setCode: (v: string) => void; error?: string }) {
  return (
    <Field
      label={label}
      value={code}
      onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
      error={error}
      keyboardType="number-pad"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      autoFocus
      placeholder="123456"
      style={{ letterSpacing: 8, fontSize: 22, textAlign: "center" }}
    />
  );
}

function LinkButton({ title, onPress, disabled, muted }: { title: string; onPress: () => void; disabled?: boolean; muted?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={{ paddingVertical: 8 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 14, color: disabled || muted ? colors.muted : colors.purple }}>{title}</Text>
    </Pressable>
  );
}

/** Second step of logging in (or of claiming an old-store account): the 6-digit code. */
export function LoginCode({
  challenge: first,
  onVerify,
  onBack,
}: {
  challenge: LoginChallenge;
  onVerify: (input: { challengeId: string; code: string; trustDevice: boolean }) => Promise<unknown>;
  onBack: () => void;
}) {
  const [challenge, setChallenge] = useState(first);
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "danger" | "info"; text: string }>({ tone: "info", text: sentLine(first) });
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [left, setLeft] = useCooldown(60);

  async function submit() {
    setBusy(true);
    setFieldError(undefined);
    try {
      await onVerify({ challengeId: challenge.challengeId, code, trustDevice: trust });
    } catch (err) {
      setNotice({ tone: "danger", text: errorText(err) });
      setFieldError(err instanceof ApiError ? err.fields?.code : undefined);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function resend(channel?: LoginChannel) {
    setBusy(true);
    setFieldError(undefined);
    try {
      const next = await api.auth.resendLoginCode(challenge.challengeId, channel);
      setChallenge(next);
      setCode("");
      setLeft(60);
      setNotice({ tone: "info", text: `New code sent. ${sentLine(next)}` });
    } catch (err) {
      setNotice({ tone: "danger", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  const other = challenge.channels.find((c) => c !== challenge.channel);
  const expired = fieldError === "Log in again";

  return (
    <View style={{ gap: 12 }}>
      <Notice tone={notice.tone}>{notice.text}</Notice>
      {!expired && (
        <>
          <CodeField label="6-digit code" code={code} setCode={setCode} error={fieldError} />
          {challenge.purpose === "login" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Switch value={trust} onValueChange={setTrust} trackColor={{ true: colors.purple }} accessibilityLabel="Trust this phone" />
              <Text style={{ flex: 1, fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>Trust this phone — don't ask for a code here for 30 days</Text>
            </View>
          )}
          <Button title={challenge.purpose === "claim" ? "Confirm and finish signing up" : "Log in"} onPress={submit} busy={busy} disabled={code.length !== 6} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            <LinkButton title={left > 0 ? `Send a new code in ${left}s` : "Send a new code"} onPress={() => resend()} disabled={busy || left > 0} />
            {other && <LinkButton title={other === "sms" ? "Text me instead" : "Email me instead"} onPress={() => resend(other)} disabled={busy} />}
          </View>
        </>
      )}
      <View style={{ alignItems: "center" }}>
        <LinkButton title="← Back" onPress={onBack} muted />
      </View>
    </View>
  );
}

/** Add, change or confirm a phone number with a texted 6-digit code. */
export function PhoneConfirm({ user, onDone, changing = false, placeholder }: { user: User; onDone: (u: User) => void; changing?: boolean; placeholder?: string }) {
  const [phone, setPhone] = useState(changing || !user.phone ? "" : formatPhone(user.phone));
  // Codes are only sent when asked for ("Text me a code").
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [left, setLeft] = useCooldown(0);

  const fail = (err: unknown) => {
    setNotice({ tone: "danger", text: errorText(err) });
    if (err instanceof ApiError && err.fields) setFields(err.fields);
  };

  async function send() {
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      const typed = phone.trim();
      const r = await api.me.sendPhoneCode(typed && (!user.phone || typed !== formatPhone(user.phone)) ? typed : undefined);
      setSentTo(r.phone);
      setCode("");
      setLeft(60);
      setNotice({ tone: "info", text: r.sent ? `We texted a 6-digit code to ${formatPhone(r.phone)}.` : "Text messages aren't set up on the server yet — the code is printed in the server window." });
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
      const r = await api.me.verifyPhone(code);
      setNotice({ tone: "success", text: "Phone number confirmed." });
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
          <Field label="Phone number" value={phone} onChangeText={setPhone} error={fields.phone} keyboardType="phone-pad" autoComplete="tel" placeholder={placeholder ?? "0770 000 000"} />
          <Button title="Text me a code" onPress={send} busy={busy} />
        </>
      ) : (
        <>
          <CodeField label={`Code sent to ${formatPhone(sentTo)}`} code={code} setCode={setCode} error={fields.code} />
          <Button title="Confirm" onPress={verify} busy={busy} disabled={code.length !== 6} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <LinkButton title={left > 0 ? `New code in ${left}s` : "Send a new code"} onPress={send} disabled={busy || left > 0} />
            <LinkButton
              title="Use a different number"
              muted
              onPress={() => {
                setSentTo(null);
                setPhone("");
                setNotice(null);
              }}
            />
          </View>
        </>
      )}
    </View>
  );
}

/** "Confirm your account": by text or by email, whichever the server can send. */
export function VerifyAccount({ user, onDone, phonePlaceholder }: { user: User; onDone: (u: User) => void; phonePlaceholder?: string }) {
  const ways: LoginChannel[] = user.canVerifyBy?.length ? user.canVerifyBy : ["email"];
  const [way, setWay] = useState<LoginChannel>(ways.includes("sms") && (user.phone || !user.email) ? "sms" : ways.includes("email") ? "email" : ways[0]);
  return (
    <View style={{ gap: 14 }}>
      {ways.length > 1 && (
        <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: colors.purpleTint, borderRadius: 999, padding: 4 }}>
          {ways.map((w) => (
            <Pressable
              key={w}
              accessibilityRole="tab"
              accessibilityState={{ selected: way === w }}
              onPress={() => setWay(w)}
              style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 999, backgroundColor: way === w ? "#fff" : "transparent" }}
            >
              <Text style={{ fontFamily: font.bold, fontSize: 14, color: way === w ? colors.purple : colors.textSoft }}>{w === "sms" ? "By text message" : "By email"}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {way === "sms" ? <PhoneConfirm user={user} onDone={onDone} placeholder={phonePlaceholder} /> : <EmailConfirm user={user} onDone={onDone} />}
    </View>
  );
}

/** Two-option switch (e.g. "Phone number" / "Email" on sign-up). */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: colors.purpleTint, borderRadius: 999, padding: 4 }}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === o.value }}
          onPress={() => onChange(o.value)}
          style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 999, backgroundColor: value === o.value ? "#fff" : "transparent" }}
        >
          <Text style={{ fontFamily: font.bold, fontSize: 14, color: value === o.value ? colors.purple : colors.textSoft }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** "First, confirm your email" box shown at the top of the shop and rider applications. */
export function ConfirmEmailFirst({ user, onDone, who, error }: { user: User; onDone: (u: User) => void; who: "sellers" | "riders"; error?: string }) {
  return (
    <View style={{ gap: 8, borderWidth: 1, borderColor: colors.amber, backgroundColor: "#FFF8E8", borderRadius: 16, padding: 14 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>First, confirm your email</Text>
      <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.textSoft }}>
        {who === "sellers" ? "Sellers need a confirmed email. We send new orders, payouts and account messages there." : "Riders need a confirmed email. We send your delivery updates and account messages there."}
      </Text>
      {error && <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{error}</Text>}
      <EmailConfirm user={user} onDone={onDone} />
    </View>
  );
}
