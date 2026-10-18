"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatLiberianPhone, type Booking } from "@yanabuy/shared";
import { Alert, Button, TextInput, messageOf } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { BookingStatusBadge, bookingWhat, bookingWhen } from "@/components/BookingBits";
import { api } from "@/lib/api";

export default function BookingPage() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setIsNew(new URLSearchParams(window.location.search).has("new"));
    api.bookings
      .get(id)
      .then((r) => setB(r.booking))
      .catch((err) => setError(messageOf(err)));
  }, [id]);

  async function cancel() {
    setBusy(true);
    try {
      setB((await api.bookings.cancel(id, reason || undefined)).booking);
      setCancelling(false);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8 sm:px-8">
        <Link href="/bookings" className="text-[13px] font-bold text-purple hover:underline">
          ← Your bookings
        </Link>
        {error && <Alert>{error}</Alert>}
        {b && (
          <>
            {isNew && b.status === "requested" && <Alert tone="success">Request sent! {b.shop.name} will confirm — we&rsquo;ll let you know.</Alert>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-display text-[26px] font-extrabold">
                {bookingWhat(b)} <span className="text-muted">· {b.number}</span>
              </h1>
              <BookingStatusBadge status={b.status} />
            </div>
            <section className="flex flex-col gap-1.5 rounded-card border border-line bg-white p-5 text-sm">
              <p className="text-lg font-bold">{bookingWhen(b.startsAt)}</p>
              <p className="text-soft">
                {b.durationMinutes} minutes{b.partySize ? ` · ${b.partySize} people` : ""}
              </p>
              <p className="mt-2 font-bold">
                <Link href={`/shop/${b.shop.slug}`} className="hover:text-purple">
                  {b.shop.name}
                </Link>
              </p>
              <p className="text-soft">📍 {b.shop.address}, {b.shop.city}</p>
              <p className="text-soft">📞 {formatLiberianPhone(b.shop.phone)}</p>
              <p className="mt-2 text-muted">
                Booked for {b.contactName} · {formatLiberianPhone(b.contactPhone)}
              </p>
              {b.note && <p className="text-muted">Your note: {b.note}</p>}
              {b.statusNote && (b.status === "declined" || b.status === "cancelled") && <p className="mt-1 font-semibold text-danger">{b.statusNote}</p>}
            </section>
            {["requested", "confirmed"].includes(b.status) &&
              (cancelling ? (
                <div className="flex flex-wrap gap-2">
                  <TextInput aria-label="Why? (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? (optional)" className="max-w-sm" />
                  <Button variant="danger" busy={busy} onClick={cancel}>
                    Cancel booking
                  </Button>
                  <Button variant="ghost" onClick={() => setCancelling(false)}>
                    Keep it
                  </Button>
                </div>
              ) : (
                <div>
                  <Button variant="outline" onClick={() => setCancelling(true)}>
                    Cancel this booking
                  </Button>
                </div>
              ))}
          </>
        )}
      </main>
    </>
  );
}
