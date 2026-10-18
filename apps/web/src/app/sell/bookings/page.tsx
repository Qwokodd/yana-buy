"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatLiberianPhone, type Booking, type BookingSettings, type MyShop } from "@yanabuy/shared";
import { Alert, Button, Field, TextInput, inputClass, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { BookingStatusBadge, bookingWhat, bookingWhen } from "@/components/BookingBits";
import { api } from "@/lib/api";

type View = "requests" | "upcoming" | "past";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SellerBookings() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [shop, setShop] = useState<MyShop | null>(null);
  const [view, setView] = useState<View>("requests");
  const [items, setItems] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/sell/bookings");
  }, [loading, user, router]);
  useEffect(() => {
    if (!user) return;
    api.shop
      .mine()
      .then((r) => setShop(r.shop))
      .catch(() => {});
  }, [user]);
  const load = useCallback(() => {
    setItems(null);
    api.bookings
      .forShop(view)
      .then((r) => setItems(r.items))
      .catch((err) => setError(messageOf(err)));
  }, [view]);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const table = shop?.kind === "restaurant";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-5 px-4 py-8 sm:px-8">
        <div>
          <Link href="/sell" className="text-[13px] font-bold text-purple hover:underline">
            ← My shop
          </Link>
          <h1 className="font-display text-[28px] font-extrabold">{table ? "Table bookings" : "Appointments"}</h1>
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="flex flex-col gap-3">
            <div className="flex gap-2" role="tablist">
              {(["requests", "upcoming", "past"] as View[]).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`h-10 rounded-full px-4 text-sm font-bold ${view === v ? "bg-purple text-white" : "border border-line-strong bg-white text-soft"}`}
                >
                  {v === "requests" ? "New requests" : v === "upcoming" ? "Coming up" : "Past"}
                </button>
              ))}
            </div>
            {items === null && <p className="text-sm text-muted">Loading…</p>}
            {items?.length === 0 && <p className="rounded-card border border-line bg-white px-6 py-10 text-center text-sm text-muted">Nothing here.</p>}
            {items?.map((b) => <Row key={b.id} b={b} onChanged={(u) => setItems((xs) => xs?.map((x) => (x.id === u.id ? u : x)) ?? null)} />)}
          </section>
          {shop && <SettingsForm table={!!table} />}
        </div>
      </main>
    </>
  );
}

function Row({ b, onChanged }: { b: Booking; onChanged: (b: Booking) => void }) {
  const [asking, setAsking] = useState<"decline" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (step: "confirm" | "decline" | "complete" | "no-show" | "cancel") => {
    setBusy(true);
    setError(null);
    try {
      onChanged((await api.bookings.step(b.id, step, reason || undefined)).booking);
      setAsking(null);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };
  const past = new Date(b.startsAt).getTime() < Date.now();
  return (
    <article className="flex flex-col gap-2 rounded-card border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">
          {bookingWhen(b.startsAt)} <span className="font-semibold text-muted">· {b.number}</span>
        </p>
        <BookingStatusBadge status={b.status} />
      </div>
      <p className="text-sm">
        <span className="font-semibold">{bookingWhat(b)}</span> · {b.contactName} ·{" "}
        <a href={`tel:${b.contactPhone}`} className="font-semibold text-purple hover:underline">
          {formatLiberianPhone(b.contactPhone)}
        </a>
      </p>
      {b.note && <p className="text-sm text-soft">“{b.note}”</p>}
      {b.statusNote && <p className="text-[13px] text-muted">{b.statusNote}</p>}
      {asking ? (
        <div className="flex flex-wrap gap-2">
          <TextInput aria-label="Reason the customer will see" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason the customer will see, e.g. Fully booked" className="max-w-sm" />
          <Button size="sm" variant="danger" busy={busy} disabled={reason.trim().length < 3} onClick={() => run(asking)}>
            {asking === "decline" ? "Decline" : "Cancel booking"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>
            Back
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {b.status === "requested" && (
            <>
              <Button size="sm" busy={busy} onClick={() => run("confirm")}>
                Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAsking("decline")}>
                Decline
              </Button>
            </>
          )}
          {b.status === "confirmed" && (
            <>
              {past && (
                <>
                  <Button size="sm" busy={busy} onClick={() => run("complete")}>
                    They came
                  </Button>
                  <Button size="sm" variant="outline" busy={busy} onClick={() => run("no-show")}>
                    Didn&rsquo;t come
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => setAsking("cancel")}>
                Cancel
              </Button>
            </>
          )}
        </div>
      )}
      {error && <Alert>{error}</Alert>}
    </article>
  );
}

function SettingsForm({ table }: { table: boolean }) {
  const [s, setS] = useState<BookingSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  useEffect(() => {
    api.bookings
      .settings()
      .then((r) => setS(r.settings))
      .catch(() => {});
  }, []);
  if (!s) return null;
  const set = <K extends keyof BookingSettings>(k: K, v: BookingSettings[K]) => setS({ ...s, [k]: v });
  const num = (k: keyof BookingSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      setS((await api.bookings.saveSettings(s!)).settings);
      setNotice({ tone: "success", text: s!.enabled ? "Saved — customers can book now." : "Saved. Bookings are switched off." });
    } catch (err) {
      setNotice({ tone: "danger", text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-card border border-line bg-white p-5 lg:sticky lg:top-4" noValidate>
      <h2 className="font-display text-lg font-extrabold">Booking settings</h2>
      <label className="flex items-center gap-3 text-sm font-bold">
        <input type="checkbox" checked={s.enabled} onChange={(e) => set("enabled", e.target.checked)} className="h-5 w-5 accent-[rgb(var(--c-purple))]" />
        {table ? "Take table bookings online" : "Take appointments online"}
      </label>
      {!table && <p className="-mt-2 text-[12.5px] text-muted">Mark a product as a bookable service in Manage your products to let people book it.</p>}
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-bold">Open days</legend>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => {
            const on = s.days.includes(i);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => set("days", on ? s.days.filter((x) => x !== i) : [...s.days, i].sort())}
                className={`h-9 w-12 rounded-full text-[13px] font-bold ${on ? "bg-purple text-white" : "border border-line-strong text-soft"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opens">{(id) => <TextInput id={id} type="time" value={s.opens} onChange={(e) => set("opens", e.target.value)} />}</Field>
        <Field label="Closes">{(id) => <TextInput id={id} type="time" value={s.closes} onChange={(e) => set("closes", e.target.value)} />}</Field>
        <Field label="Times every">
          {(id) => (
            <select id={id} value={s.slotMinutes} onChange={(e) => set("slotMinutes", Number(e.target.value))} className={inputClass}>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={table ? "Tables per time" : "Bookings per time"} hint={table ? "How many groups at once" : "e.g. how many staff"}>
          {(id) => <TextInput id={id} type="number" min={1} value={s.perSlot} onChange={num("perSlot")} />}
        </Field>
        {table && <Field label="Biggest group online">{(id) => <TextInput id={id} type="number" min={1} value={s.maxPartySize} onChange={num("maxPartySize")} />}</Field>}
        <Field label="Book at least (hours ahead)">{(id) => <TextInput id={id} type="number" min={0} value={s.leadHours} onChange={num("leadHours")} />}</Field>
        <Field label="Up to (days ahead)">{(id) => <TextInput id={id} type="number" min={1} value={s.daysAhead} onChange={num("daysAhead")} />}</Field>
      </div>
      <Field label="Note for customers (optional)">
        {(id) => <TextInput id={id} value={s.note ?? ""} onChange={(e) => set("note", e.target.value || null)} maxLength={300} placeholder={table ? "e.g. We hold tables for 15 minutes" : "e.g. Please come 10 minutes early"} />}
      </Field>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <div>
        <Button type="submit" busy={busy}>
          Save booking settings
        </Button>
      </div>
    </form>
  );
}
