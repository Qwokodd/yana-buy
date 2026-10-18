"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatLD, formatLiberianPhone, type BookingSlot, type Product, type PublicShop } from "@yanabuy/shared";
import { Alert, Button, Field, TextInput, fieldErrorsOf, messageOf, useAuth } from "@yanabuy/web-kit";
import { api } from "@/lib/api";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayLabel = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Pick a day and time, then send the booking request. Times are Liberia time (UTC). */
export function BookingForm({ shop, service }: { shop: PublicShop; service: Product | null }) {
  const { user } = useAuth();
  const router = useRouter();
  const table = shop.kind === "restaurant";
  const days = useMemo(() => {
    const start = new Date(`${iso(new Date())}T00:00:00Z`);
    return Array.from({ length: Math.min(shop.booking?.daysAhead ?? 14, 21) }, (_, i) => new Date(start.getTime() + i * 86400_000));
  }, [shop.booking?.daysAhead]);
  const [date, setDate] = useState(iso(days[0]));
  const [slots, setSlots] = useState<BookingSlot[] | null>(null);
  const [slot, setSlot] = useState<BookingSlot | null>(null);
  const [party, setParty] = useState(2);
  const [form, setForm] = useState({ name: user?.fullName ?? "", phone: user ? formatLiberianPhone(user.phone) : "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: f.name || user.fullName, phone: f.phone || formatLiberianPhone(user.phone) }));
  }, [user]);

  useEffect(() => {
    setSlots(null);
    setSlot(null);
    api.public
      .availability(shop.slug, date, service?.id)
      .then((r) => setSlots(r.slots))
      .catch(() => setSlots([]));
  }, [shop.slug, date, service?.id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    if (!slot) return setError("Pick a time");
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const r = await api.bookings.create({
        shopId: shop.id,
        productId: service?.id ?? null,
        startsAt: slot.startsAt,
        partySize: table ? party : null,
        contactName: form.name,
        contactPhone: form.phone,
        note: form.note || null,
      });
      router.replace(`/bookings/${r.booking.id}?new=1`);
    } catch (err) {
      setFields(fieldErrorsOf(err));
      setError(messageOf(err));
      if (fieldErrorsOf(err).startsAt) api.public.availability(shop.slug, date, service?.id).then((r) => setSlots(r.slots));
    } finally {
      setBusy(false);
    }
  }

  if (!shop.booking) {
    return <Alert tone="warn">{shop.name} isn&rsquo;t taking bookings online right now. Call them on {formatLiberianPhone(shop.phone)}.</Alert>;
  }

  return (
    <form onSubmit={send} noValidate className="flex flex-col gap-5 rounded-card border border-line bg-white p-6">
      {service && (
        <div className="rounded-2xl bg-ground p-4 text-sm">
          <p className="font-bold">{service.name}</p>
          <p className="text-soft">
            {formatLD(service.price)} · {service.durationMinutes ?? 60} minutes · pay {shop.name} at your appointment
          </p>
        </div>
      )}
      {shop.booking.note && <p className="rounded-2xl bg-amber-tint px-4 py-3 text-sm">{shop.booking.note}</p>}

      <fieldset>
        <legend className="mb-2 text-sm font-bold">Day</legend>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => {
            const v = iso(d);
            const on = v === date;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                onClick={() => setDate(v)}
                className={`min-w-[78px] flex-shrink-0 rounded-2xl border-2 px-3 py-2 text-center text-sm font-bold ${on ? "border-purple bg-purple text-white" : "border-line-strong bg-white hover:border-purple"}`}
              >
                {dayLabel(d)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-bold">Time</legend>
        {slots === null ? (
          <p className="text-sm text-muted">Checking free times…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted">No times this day — try another day.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => {
              const on = slot?.startsAt === s.startsAt;
              return (
                <button
                  key={s.startsAt}
                  type="button"
                  disabled={s.left < 1}
                  aria-pressed={on}
                  onClick={() => setSlot(s)}
                  className={`h-10 rounded-full border-2 px-4 text-sm font-bold ${on ? "border-purple bg-purple text-white" : "border-line-strong bg-white hover:border-purple"} disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through`}
                >
                  {s.time}
                </button>
              );
            })}
          </div>
        )}
        {fields.startsAt && <p className="mt-1 text-xs font-semibold text-danger">{fields.startsAt}</p>}
      </fieldset>

      {table && (
        <Field label="How many people?" error={fields.partySize} hint={`Up to ${shop.booking.maxPartySize} online. For bigger groups, call the restaurant.`}>
          {(id) => (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setParty((p) => Math.max(1, p - 1))} className="h-10 w-10 rounded-full border border-line-strong font-bold text-purple" aria-label="Fewer people">
                −
              </button>
              <span id={id} className="w-8 text-center text-lg font-bold" aria-live="polite">
                {party}
              </span>
              <button type="button" onClick={() => setParty((p) => Math.min(shop.booking!.maxPartySize, p + 1))} className="h-10 w-10 rounded-full border border-line-strong font-bold text-purple" aria-label="More people">
                +
              </button>
            </div>
          )}
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name for the booking" error={fields.contactName}>
          {(id) => <TextInput id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </Field>
        <Field label="Phone" error={fields.contactPhone}>
          {(id) => <TextInput id={id} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
        </Field>
      </div>
      <Field label="Anything they should know? (optional)" error={fields.note}>
        {(id) => <TextInput id={id} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={300} placeholder={table ? "e.g. Birthday, a table outside" : "e.g. What you need done"} />}
      </Field>
      {error && <Alert>{error}</Alert>}
      <div>
        <Button type="submit" size="lg" busy={busy} disabled={!slot}>
          {user ? `Request ${table ? "the table" : "the appointment"}${slot ? ` · ${dayLabel(new Date(`${date}T00:00:00Z`))} ${slot.time}` : ""}` : "Log in to book"}
        </Button>
        <p className="mt-2 text-[12.5px] text-muted">{shop.name} confirms your booking — we&rsquo;ll let you know.</p>
      </div>
    </form>
  );
}
