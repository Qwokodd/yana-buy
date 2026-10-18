"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatLiberianPhone } from "@yanabuy/shared";
import {
  Alert,
  AvatarUpload,
  Badge,
  Button,
  EmailConfirm,
  Field,
  PasswordInput,
  TextInput,
  fieldErrorsOf,
  messageOf,
  useAuth,
} from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { api } from "@/lib/api";

const ROLE_LABEL = { buyer: "Buyer", vendor: "Seller", rider: "Rider", admin: "Admin" } as const;

export default function AccountPage() {
  const { user, loading, setUser, logout } = useAuth();
  const router = useRouter();
  // Set while logging out, so the "not logged in → go to login" redirect doesn't fire.
  const leaving = useRef(false);

  const [form, setForm] = useState({ fullName: "", city: "" });
  const [changingEmail, setChangingEmail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwNotice, setPwNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pwFields, setPwFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!loading && !user && !leaving.current) router.replace("/login?next=/account");
  }, [loading, user, router]);

  useEffect(() => {
    if (user) setForm({ fullName: user.fullName, city: user.city ?? "" });
  }, [user]);

  useEffect(() => {
    const welcome = new URLSearchParams(window.location.search).get("welcome");
    if (new URLSearchParams(window.location.search).has("reset")) setNotice({ tone: "success", text: "Your new password is saved. You've been logged out on other devices." });
    else if (welcome === "back") {
      setNotice({ tone: "success", text: "Welcome back! Your orders from the old YanaBuy store are in Your orders." });
    } else if (welcome) {
      setNotice({ tone: "success", text: "Welcome to YanaBuy! Add a profile photo so shops and riders know it's you." });
    }
  }, []);

  if (loading || !user) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-muted">Loading…</main>
      </>
    );
  }

  async function saveAvatar(url: string | null) {
    const res = await api.me.update({ avatarUrl: url });
    setUser(res.user);
    setNotice({ tone: "success", text: url ? "Profile photo updated." : "Profile photo removed." });
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    setFields({});
    try {
      const res = await api.me.update({ fullName: form.fullName, city: form.city || null });
      setUser(res.user);
      setNotice({ tone: "success", text: "Your details are saved." });
    } catch (err) {
      setNotice({ tone: "danger", text: messageOf(err) });
      setFields(fieldErrorsOf(err));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwNotice(null);
    setPwFields({});
    try {
      await api.me.changePassword(pw);
      setPw({ currentPassword: "", newPassword: "" });
      setPwNotice({ tone: "success", text: "Password changed." });
    } catch (err) {
      setPwNotice({ tone: "danger", text: messageOf(err) });
      setPwFields(fieldErrorsOf(err));
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-9 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-[28px] font-extrabold">Your account</h1>
            <p className="text-sm text-muted">{formatLiberianPhone(user.phone)}</p>
          </div>
          <Badge tone="purple">{ROLE_LABEL[user.role]}</Badge>
        </div>

        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

        <Link href="/orders" className="flex items-center justify-between rounded-card border border-line bg-white p-5 hover:border-purple">
          <span>
            <span className="block font-display text-lg font-extrabold">Your orders</span>
            <span className="text-sm text-muted">Track deliveries and see what you've bought.</span>
          </span>
          <span className="font-bold text-purple">Open →</span>
        </Link>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/wishlist" className="flex items-center justify-between rounded-card border border-line bg-white p-5 hover:border-purple">
            <span>
              <span className="block font-display text-lg font-extrabold">Wishlist</span>
              <span className="text-sm text-muted">Things you saved — we tell you when they get cheaper.</span>
            </span>
            <span className="font-bold text-purple">Open →</span>
          </Link>
          <Link href="/bookings" className="flex items-center justify-between rounded-card border border-line bg-white p-5 hover:border-purple">
            <span>
              <span className="block font-display text-lg font-extrabold">Bookings</span>
              <span className="text-sm text-muted">Tables and appointments you booked.</span>
            </span>
            <span className="font-bold text-purple">Open →</span>
          </Link>
          <Link href="/notifications" className="flex items-center justify-between rounded-card border border-line bg-white p-5 hover:border-purple">
            <span>
              <span className="block font-display text-lg font-extrabold">Notifications</span>
              <span className="text-sm text-muted">Order updates, messages, price drops.</span>
            </span>
            <span className="font-bold text-purple">Open →</span>
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/messages" className="flex items-center justify-between rounded-card border border-line bg-white p-5 hover:border-purple">
            <span>
              <span className="block font-display text-lg font-extrabold">Messages</span>
              <span className="text-sm text-muted">Chats with shops.</span>
            </span>
            <span className="font-bold text-purple">Open →</span>
          </Link>
          {(user.role === "buyer" || user.role === "rider") && (
            <Link href="/ride" className="flex items-center justify-between rounded-card border border-line bg-white p-5 hover:border-purple">
              <span>
                <span className="block font-display text-lg font-extrabold">🏍️ {user.role === "rider" ? "Rider account" : "Become a rider"}</span>
                <span className="text-sm text-muted">{user.role === "rider" ? "You deliver for YanaBuy." : "Deliver orders and earn."}</span>
              </span>
              <span className="font-bold text-purple">Open →</span>
            </Link>
          )}
          <Link href="/china" className="flex items-center justify-between rounded-card border border-line bg-white p-5 hover:border-purple">
            <span>
              <span className="block font-display text-lg font-extrabold">🇨🇳 Buy from China</span>
              <span className="text-sm text-muted">Your China requests and quotes.</span>
            </span>
            <span className="font-bold text-purple">Open →</span>
          </Link>
        </div>

        <section className="rounded-card border border-line bg-white p-6">
          <h2 className="mb-4 font-display text-lg font-extrabold">Profile photo</h2>
          <AvatarUpload api={api} name={user.fullName} url={user.avatarUrl} onChange={saveAvatar} />
        </section>

        <form onSubmit={saveProfile} className="flex flex-col gap-4 rounded-card border border-line bg-white p-6" noValidate>
          <h2 className="font-display text-lg font-extrabold">Your details</h2>
          <Field label="Full name" error={fields.fullName}>
            {(id) => (
              <TextInput id={id} value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} invalid={!!fields.fullName} />
            )}
          </Field>
          <Field label="City (optional)" error={fields.city}>
            {(id) => <TextInput id={id} value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />}
          </Field>
          <div>
            <Button type="submit" busy={saving}>
              Save details
            </Button>
          </div>
        </form>

        {(user.role === "buyer" || user.role === "vendor") && (
          <section className="relative overflow-hidden rounded-card bg-ink p-6 text-white">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-amber" />
            <h2 className="relative font-display text-lg font-extrabold">{user.role === "vendor" ? "Your shop" : "Have something to sell?"}</h2>
            <p className="relative mt-1 max-w-md text-sm text-white/80">
              {user.role === "vendor"
                ? "See your shop's status and update its details."
                : "Open a shop or restaurant. It's free to apply — we just check your ID first."}
            </p>
            <Link href="/sell" className="relative mt-4 inline-flex h-10 items-center rounded-full bg-amber px-5 text-sm font-bold text-ink">
              {user.role === "vendor" ? "Go to my shop" : "Start selling"}
            </Link>
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold">Email</h2>
            {user.email && (user.emailVerified ? <Badge tone="success">Confirmed</Badge> : <Badge tone="warn">Not confirmed</Badge>)}
          </div>
          <p className="text-sm text-muted">We email and text you about your orders, messages and account.</p>
          {user.email && user.emailVerified && !changingEmail ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold">{user.email}</span>
              <button type="button" onClick={() => setChangingEmail(true)} className="text-sm font-bold text-purple hover:underline">
                Change
              </button>
            </div>
          ) : (
            <EmailConfirm
              api={api}
              user={user}
              changing={changingEmail}
              onDone={(u) => {
                setUser(u);
                setChangingEmail(false);
                setNotice({ tone: "success", text: `Email confirmed: ${u.email}` });
              }}
            />
          )}
        </section>

        <form onSubmit={changePassword} className="flex flex-col gap-4 rounded-card border border-line bg-white p-6" noValidate>
          <h2 className="font-display text-lg font-extrabold">Change password</h2>
          {pwNotice && <Alert tone={pwNotice.tone}>{pwNotice.text}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Current password" error={pwFields.currentPassword}>
              {(id) => (
                <PasswordInput id={id} autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} invalid={!!pwFields.currentPassword} />
              )}
            </Field>
            <Field label="New password" error={pwFields.newPassword} hint="At least 8 characters.">
              {(id) => (
                <PasswordInput id={id} autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} invalid={!!pwFields.newPassword} />
              )}
            </Field>
          </div>
          <div>
            <Button type="submit" variant="outline" busy={pwBusy}>
              Change password
            </Button>
          </div>
        </form>

        <div>
          <Button
            variant="ghost"
            className="!px-0 text-danger hover:!text-danger"
            onClick={async () => {
              leaving.current = true;
              await logout();
              router.replace("/");
            }}
          >
            Log out
          </Button>
        </div>
      </main>
    </>
  );
}
