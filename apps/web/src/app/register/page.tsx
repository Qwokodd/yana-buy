"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { nextPath, useWithNext } from "@/lib/next-url";
import { useState } from "react";
import { Alert, Button, Field, PasswordInput, TextInput, fieldErrorsOf, messageOf, useAuth } from "@yanabuy/web-kit";
import { AuthShell } from "@/components/AuthShell";
import { api } from "@/lib/api";
import { useCountry } from "@/lib/country";

export default function RegisterPage() {
  const phoneExample = useCountry().country === "US" ? "(215) 555 0123" : "0770 000 000";
  const otherHref = useWithNext("/login");
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", password: "", city: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const user = await register({ ...form, city: form.city || undefined });
      // Bought on the old Shopify store with this number? Their past orders are waiting.
      const past = await api.me.shopifyOrders().catch(() => ({ items: [] }));
      const after = nextPath(past.items.length ? "/account?welcome=back" : "/account?welcome=1");
      router.replace(user.needsEmail ? `/verify-email?next=${encodeURIComponent(after)}` : after);
    } catch (err) {
      setError(messageOf(err));
      setFields(fieldErrorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="It takes less than a minute. Use your mobile money number so paying is easy.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Full name" error={fields.fullName}>
          {(id) => <TextInput id={id} autoComplete="name" value={form.fullName} onChange={set("fullName")} invalid={!!fields.fullName} required />}
        </Field>
        <Field label="Phone number" error={fields.phone} hint="You'll log in with this number.">
          {(id) => (
            <TextInput id={id} type="tel" inputMode="tel" autoComplete="tel" placeholder={phoneExample} value={form.phone} onChange={set("phone")} invalid={!!fields.phone} required />
          )}
        </Field>
        <Field label="Email" error={fields.email} hint="We send a code to confirm it, then your order and account updates.">
          {(id) => <TextInput id={id} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set("email")} invalid={!!fields.email} required />}
        </Field>
        <Field label="City (optional)" error={fields.city}>
          {(id) => <TextInput id={id} autoComplete="address-level2" placeholder="Monrovia" value={form.city} onChange={set("city")} />}
        </Field>
        <Field label="Password" error={fields.password} hint="At least 8 characters.">
          {(id) => <PasswordInput id={id} autoComplete="new-password" value={form.password} onChange={set("password")} invalid={!!fields.password} required />}
        </Field>
        <Button type="submit" size="lg" busy={busy} className="mt-2 w-full">
          Create account
        </Button>
        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href={otherHref} className="font-bold text-purple hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
