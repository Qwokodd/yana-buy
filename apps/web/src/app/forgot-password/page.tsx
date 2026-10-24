"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Button, Field, PasswordInput, TextInput, fieldErrorsOf, messageOf, useAuth } from "@yanabuy/web-kit";
import { AuthShell } from "@/components/AuthShell";
import { api } from "@/lib/api";
import { useCountry } from "@/lib/country";

/** Forgot password: phone number or email → 6-digit code (by text or email) → new password. */
export default function ForgotPasswordPage() {
  const phoneExample = useCountry().country === "US" ? "(215) 555 0123" : "0770 000 000";
  const { setUser } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"login" | "code">("login");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "danger" | "info"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const p = q.get("login") ?? q.get("phone");
    if (p) setPhone(p);
  }, []);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
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
      setNotice({ tone: "danger", text: messageOf(err) });
      setFields(fieldErrorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      const res = await api.auth.resetPassword({ login: phone, code, password });
      setUser(res.user);
      router.replace("/account?reset=1");
    } catch (err) {
      setNotice({ tone: "danger", text: messageOf(err) });
      setFields(fieldErrorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll send a code to your phone or email.">
      {notice && (
        <div className="mb-4">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}
      {step === "login" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4" noValidate>
          <Field label="Phone number or email" error={fields.login ?? fields.phone ?? fields.email} hint="The one you log in with.">
            {(id) => (
              <TextInput
                id={id}
                type="text"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                placeholder={`${phoneExample} or you@example.com`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                invalid={!!(fields.login ?? fields.phone ?? fields.email)}
                required
              />
            )}
          </Field>
          <Button type="submit" size="lg" busy={busy} className="w-full">
            Send me a code
          </Button>
        </form>
      ) : (
        <form onSubmit={reset} className="flex flex-col gap-4" noValidate>
          <Field label="6-digit code" error={fields.code}>
            {(id) => (
              <TextInput id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} invalid={!!fields.code} placeholder="123456" className="tracking-[6px]" />
            )}
          </Field>
          <Field label="New password" error={fields.password} hint="At least 8 characters.">
            {(id) => <PasswordInput id={id} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!fields.password} />}
          </Field>
          <Button type="submit" size="lg" busy={busy} disabled={code.length !== 6} className="w-full">
            Save new password
          </Button>
          <div className="flex justify-between text-sm">
            <button type="button" onClick={() => sendCode()} disabled={busy} className="font-bold text-purple hover:underline">
              Send a new code
            </button>
            <button type="button" onClick={() => setStep("login")} className="font-bold text-soft hover:underline">
              Use a different number or email
            </button>
          </div>
          <p className="text-[12.5px] text-muted">No code? Check the number or email, wait a minute and send a new one — or contact YanaBuy support.</p>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-bold text-purple hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
