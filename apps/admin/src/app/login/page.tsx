"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Button, Field, Logo, PasswordInput, TextInput, fieldErrorsOf, messageOf, useAuth } from "@yanabuy/web-kit";

export default function AdminLogin() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await login(phone, password);
      router.replace("/");
    } catch (err) {
      setError(messageOf(err));
      setFields(fieldErrorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-4">
      <div className="absolute -right-24 -top-24 h-[380px] w-[380px] rounded-full bg-amber/90" />
      <div className="absolute -bottom-32 -left-16 h-[320px] w-[320px] rounded-full bg-purple-light" />
      <form onSubmit={submit} noValidate className="relative w-full max-w-[400px] rounded-sheet bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-2 text-[16px]">
          <Logo size={30} dark />
          <span className="text-[10px] font-bold tracking-[1.4px] text-muted">ADMIN</span>
        </div>
        <h1 className="mb-5 font-display text-2xl font-extrabold">Log in to the admin console</h1>
        <div className="flex flex-col gap-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Phone number" error={fields.phone}>
            {(id) => <TextInput id={id} type="tel" autoComplete="tel" placeholder="0770 000 000" value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!fields.phone} />}
          </Field>
          <Field label="Password" error={fields.password}>
            {(id) => <PasswordInput id={id} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!fields.password} />}
          </Field>
          <Button type="submit" size="lg" busy={busy} className="mt-1 w-full">
            Log in
          </Button>
        </div>
      </form>
    </main>
  );
}
