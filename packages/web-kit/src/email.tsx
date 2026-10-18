"use client";

import { useState } from "react";
import type { Api, User } from "@yanabuy/shared";
import { Alert, Button, Field, TextInput, fieldErrorsOf, messageOf } from "./ui";

/**
 * Add, change or confirm an email address: type it, get a 6-digit code by
 * email, enter the code. Used on the website's "Confirm your email" page, the
 * account page and in the admin dashboard.
 */
export function EmailConfirm({
  api,
  user,
  onDone,
  changing = false,
}: {
  api: Api;
  user: User;
  onDone: (u: User) => void;
  /** Start by asking for a new address (instead of confirming the current one). */
  changing?: boolean;
}) {
  const [email, setEmail] = useState(changing ? "" : (user.email ?? ""));
  const [sentTo, setSentTo] = useState<string | null>(!changing && user.email && !user.emailVerified ? user.email : null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(
    !changing && user.email && !user.emailVerified ? { tone: "info", text: `We sent a 6-digit code to ${user.email}. Check your inbox (and spam).` } : null
  );
  const [fields, setFields] = useState<Record<string, string>>({});

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      const target = email.trim().toLowerCase();
      const r = await api.me.sendEmailCode(target && target !== user.email ? target : target || undefined);
      setSentTo(r.email);
      setCode("");
      setNotice({ tone: "info", text: r.sent ? `We sent a 6-digit code to ${r.email}. Check your inbox (and spam).` : "Email sending isn't set up on the server yet — the code is printed in the server window." });
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
      const r = await api.me.verifyEmail(code);
      setNotice({ tone: "success", text: "Email confirmed." });
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
          <Field label="Email address" error={fields.email}>
            {(id) => <TextInput id={id} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!fields.email} placeholder="you@example.com" />}
          </Field>
          <div>
            <Button type="submit" busy={busy}>
              Send me a code
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3" noValidate>
          <Field label={`Code sent to ${sentTo}`} error={fields.code}>
            {(id) => (
              <TextInput
                id={id}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                invalid={!!fields.code}
                placeholder="123456"
                className="tracking-[6px]"
              />
            )}
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" busy={busy} disabled={code.length !== 6}>
              Confirm
            </Button>
            <button type="button" onClick={() => send()} disabled={busy} className="text-sm font-bold text-purple hover:underline">
              Send a new code
            </button>
            <button
              type="button"
              onClick={() => {
                setSentTo(null);
                setEmail("");
                setNotice(null);
              }}
              className="text-sm font-bold text-soft hover:underline"
            >
              Use a different email
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
