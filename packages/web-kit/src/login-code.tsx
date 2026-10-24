"use client";

import { useEffect, useState } from "react";
import { formatPhone, type Api, type LoginChallenge, type LoginChannel, type User } from "@yanabuy/shared";
import { Alert, Button, Field, TextInput, fieldErrorsOf, messageOf } from "./ui";
import { EmailConfirm } from "./email";

const sentLine = (c: LoginChallenge) =>
  c.channel === "sms" ? `We texted a 6-digit code to ${c.sentTo}.` : `We emailed a 6-digit code to ${c.sentTo}. Check your inbox (and spam).`;

/** A 60-second countdown before "Send a new code" works again. */
function useCooldown(start: number) {
  const [left, setLeft] = useState(start);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}

export function CodeInput({ id, value, onChange, invalid }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <TextInput
      id={id}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      invalid={invalid}
      placeholder="123456"
      className="text-center text-xl tracking-[8px]"
    />
  );
}

/**
 * Second step of logging in: the 6-digit code that went by text or email.
 * Also used when someone signs up with a number from the old store.
 */
export function LoginCode({
  api,
  challenge: first,
  onVerify,
  onBack,
  allowTrust = true,
}: {
  api: Api;
  challenge: LoginChallenge;
  /** Called with the code; should log in (e.g. useAuth().verifyCode) and move on. Throw to show an error. */
  onVerify: (input: { challengeId: string; code: string; trustDevice: boolean }) => Promise<unknown>;
  onBack: () => void;
  /** Show "Trust this device for 30 days" (never for the admin dashboard). */
  allowTrust?: boolean;
}) {
  const [challenge, setChallenge] = useState(first);
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "danger" | "info" | "success"; text: string }>({ tone: "info", text: sentLine(first) });
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [left, setLeft] = useCooldown(60);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFieldError(undefined);
    try {
      await onVerify({ challengeId: challenge.challengeId, code, trustDevice: trust });
    } catch (err) {
      setNotice({ tone: "danger", text: messageOf(err) });
      setFieldError(fieldErrorsOf(err).code);
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
      setNotice({ tone: "danger", text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  const other: LoginChannel | undefined = challenge.channels.find((c) => c !== challenge.channel);
  const expired = fieldError === "Log in again";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Alert tone={notice.tone}>{notice.text}</Alert>
      {!expired && (
        <>
          <Field label="6-digit code" error={fieldError}>
            {(id) => <CodeInput id={id} value={code} onChange={setCode} invalid={!!fieldError} />}
          </Field>
          {allowTrust && challenge.purpose === "login" && (
            <label className="flex items-center gap-2 text-sm text-soft">
              <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} className="h-4 w-4 accent-purple" />
              Trust this device — don&apos;t ask for a code here for 30 days
            </label>
          )}
          <Button type="submit" size="lg" busy={busy} disabled={code.length !== 6} className="w-full">
            {challenge.purpose === "claim" ? "Confirm and finish signing up" : "Log in"}
          </Button>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
            <button type="button" onClick={() => resend()} disabled={busy || left > 0} className="font-bold text-purple hover:underline disabled:text-muted disabled:no-underline">
              {left > 0 ? `Send a new code in ${left}s` : "Send a new code"}
            </button>
            {other && (
              <button type="button" onClick={() => resend(other)} disabled={busy} className="font-bold text-purple hover:underline">
                {other === "sms" ? "Text me instead" : "Email me instead"}
              </button>
            )}
          </div>
        </>
      )}
      <button type="button" onClick={onBack} className="text-center text-sm font-bold text-soft hover:underline">
        ← Back
      </button>
    </form>
  );
}

/**
 * Add, change or confirm a phone number: type it, get a 6-digit code by text,
 * enter the code. The number on the account (used to log in) changes once confirmed.
 */
export function PhoneConfirm({
  api,
  user,
  onDone,
  changing = false,
  placeholder = "0770 000 000",
}: {
  api: Api;
  user: User;
  onDone: (u: User) => void;
  /** Start by asking for a new number (instead of confirming the current one). */
  changing?: boolean;
  placeholder?: string;
}) {
  const [phone, setPhone] = useState(changing || !user.phone ? "" : formatPhone(user.phone));
  // Codes are only sent when asked for ("Text me a code").
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [left, setLeft] = useCooldown(0);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
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
      setNotice({ tone: "danger", text: messageOf(err) });
      setFields(fieldErrorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      const r = await api.me.verifyPhone(code);
      setNotice({ tone: "success", text: "Phone number confirmed." });
      onDone(r.user);
    } catch (err) {
      setNotice({ tone: "danger", text: messageOf(err) });
      setFields(fieldErrorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {!sentTo ? (
        <form onSubmit={send} className="flex flex-col gap-3" noValidate>
          <Field label="Phone number" error={fields.phone}>
            {(id) => <TextInput id={id} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!fields.phone} placeholder={placeholder} />}
          </Field>
          <div>
            <Button type="submit" busy={busy}>
              Text me a code
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3" noValidate>
          <Field label={`Code sent to ${formatPhone(sentTo)}`} error={fields.code}>
            {(id) => <CodeInput id={id} value={code} onChange={setCode} invalid={!!fields.code} />}
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" busy={busy} disabled={code.length !== 6}>
              Confirm
            </Button>
            <button type="button" onClick={() => send()} disabled={busy || left > 0} className="text-sm font-bold text-purple hover:underline disabled:text-muted">
              {left > 0 ? `New code in ${left}s` : "Send a new code"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSentTo(null);
                setPhone("");
                setNotice(null);
              }}
              className="text-sm font-bold text-soft hover:underline"
            >
              Use a different number
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * "Confirm your account": a code by text (phone) or by email — whichever the server
 * can send. Used on the website's confirm page.
 */
export function VerifyAccount({ api, user, onDone, phonePlaceholder }: { api: Api; user: User; onDone: (u: User) => void; phonePlaceholder?: string }) {
  const ways = user.canVerifyBy?.length ? user.canVerifyBy : (["email"] as LoginChannel[]);
  const [way, setWay] = useState<LoginChannel>(ways.includes("sms") && (user.phone || !user.email) ? "sms" : ways.includes("email") ? "email" : ways[0]);
  return (
    <div className="flex flex-col gap-4">
      {ways.length > 1 && (
        <div className="flex rounded-full bg-purple-tint p-1 text-sm font-bold" role="tablist">
          {ways.map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={way === w}
              onClick={() => setWay(w)}
              className={`flex-1 rounded-full px-3 py-2 ${way === w ? "bg-white text-purple shadow-sm" : "text-soft"}`}
            >
              {w === "sms" ? "By text message" : "By email"}
            </button>
          ))}
        </div>
      )}
      {way === "sms" ? <PhoneConfirm api={api} user={user} onDone={onDone} placeholder={phonePlaceholder} /> : <EmailConfirm api={api} user={user} onDone={onDone} />}
    </div>
  );
}

/** "First, confirm your email" box shown at the top of the shop and rider applications. */
export function ConfirmEmailFirst({ api, user, onDone, who, error }: { api: Api; user: User; onDone: (u: User) => void; who: "sellers" | "riders"; error?: string }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-amber bg-[#FFF8E8] p-4" aria-label="Confirm your email">
      <h3 className="font-display text-base font-extrabold">First, confirm your email</h3>
      <p className="text-[13px] text-soft">
        {who === "sellers" ? "Sellers need a confirmed email. We send new orders, payouts and account messages there." : "Riders need a confirmed email. We send your delivery updates and account messages there."}
      </p>
      {error && <p className="text-[12.5px] font-semibold text-danger">{error}</p>}
      <EmailConfirm api={api} user={user} onDone={onDone} />
    </section>
  );
}
