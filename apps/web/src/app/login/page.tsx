"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { nextPath, useWithNext } from "@/lib/next-url";
import { useState } from "react";
import { Alert, Button, Field, PasswordInput, TextInput, fieldErrorsOf, messageOf, useAuth } from "@yanabuy/web-kit";
import { AuthShell } from "@/components/AuthShell";
import { useCountry } from "@/lib/country";

export default function LoginPage() {
  const phoneExample = useCountry().country === "US" ? "(215) 555 0123" : "0770 000 000";
  const otherHref = useWithNext("/register");
  const { login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await login(phone, password);
      router.replace(nextPath("/"));
    } catch (err) {
      setError(messageOf(err));
      setFields(fieldErrorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in with the phone number you signed up with.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Phone number" error={fields.phone}>
          {(id) => (
            <TextInput id={id} type="tel" inputMode="tel" autoComplete="tel" placeholder={phoneExample} value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!fields.phone} required />
          )}
        </Field>
        <Field label="Password" error={fields.password}>
          {(id) => <PasswordInput id={id} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!fields.password} required />}
        </Field>
        <Link href={phone ? `/forgot-password?phone=${encodeURIComponent(phone)}` : "/forgot-password"} className="-mt-2 self-end text-[13px] font-bold text-purple hover:underline">
          Forgot your password?
        </Link>
        <Button type="submit" size="lg" busy={busy} className="mt-2 w-full">
          Log in
        </Button>
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
