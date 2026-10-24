"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { nextPath, useWithNext } from "@/lib/next-url";
import { homeFor, setBrowsing } from "@/lib/workspace";
import { useState } from "react";
import type { LoginChallenge } from "@yanabuy/shared";
import { Alert, Button, Field, LoginCode, PasswordInput, TextInput, fieldErrorsOf, messageOf, useAuth } from "@yanabuy/web-kit";
import { AuthShell } from "@/components/AuthShell";
import { api } from "@/lib/api";
import { useCountry } from "@/lib/country";

/** Log in with a phone number or an email + password, then (usually) a 6-digit code. */
export default function LoginPage() {
  const phoneExample = useCountry().country === "US" ? "(215) 555 0123" : "0770 000 000";
  const otherHref = useWithNext("/register");
  const { login, verifyCode } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const step = await login(identifier, password);
      if (step.challenge) setChallenge(step.challenge);
      else {
        // Sellers go to their shop / restaurant, riders to their deliveries, buyers to the feed.
        setBrowsing(false);
        router.replace(nextPath(homeFor(step.user)));
      }
    } catch (err) {
      setError(messageOf(err));
      setFields(fieldErrorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <AuthShell title={challenge.channel === "sms" ? "Check your phone" : "Check your email"} subtitle={challenge.channel === "sms" ? "Enter the code we just texted you." : "Enter the code we just emailed you."}>
        <LoginCode
          api={api}
          challenge={challenge}
          onVerify={async (input) => {
            const res = await verifyCode(input);
            setBrowsing(false);
            router.replace(nextPath(homeFor(res.user)));
          }}
          onBack={() => {
            setChallenge(null);
            setPassword("");
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in with your phone number or email.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Phone number or email" error={fields.login ?? fields.phone ?? fields.email}>
          {(id) => (
            <TextInput
              id={id}
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              placeholder={`${phoneExample} or you@example.com`}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              invalid={!!(fields.login ?? fields.phone ?? fields.email)}
              required
            />
          )}
        </Field>
        <Field label="Password" error={fields.password}>
          {(id) => <PasswordInput id={id} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!fields.password} required />}
        </Field>
        <Link href={identifier ? `/forgot-password?login=${encodeURIComponent(identifier)}` : "/forgot-password"} className="-mt-2 self-end text-[13px] font-bold text-purple hover:underline">
          Forgot your password?
        </Link>
        <Button type="submit" size="lg" busy={busy} className="mt-2 w-full">
          Log in
        </Button>
        <p className="text-center text-[12.5px] text-muted">For your security we&apos;ll send you a 6-digit code to finish logging in.</p>
        <p className="text-center text-sm text-muted">
          New to YanaBuy?{" "}
          <Link href={otherHref} className="font-bold text-purple hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
