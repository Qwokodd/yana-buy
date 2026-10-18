"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Booking } from "@yanabuy/shared";
import { Alert, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { ShopLogo } from "@/components/ShopTile";
import { BookingStatusBadge, bookingWhat, bookingWhen } from "@/components/BookingBits";
import { api } from "@/lib/api";

export default function MyBookings() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/bookings");
  }, [loading, user, router]);
  useEffect(() => {
    if (!user) return;
    api.bookings
      .mine()
      .then((r) => setItems(r.items))
      .catch((err) => setError(messageOf(err)));
  }, [user]);
  const now = Date.now();
  const upcoming = items?.filter((b) => ["requested", "confirmed"].includes(b.status) && new Date(b.startsAt).getTime() > now - 3 * 3600_000) ?? [];
  const past = items?.filter((b) => !upcoming.includes(b)) ?? [];

  const List = ({ list }: { list: Booking[] }) => (
    <ul className="flex flex-col gap-2">
      {list.map((b) => (
        <li key={b.id}>
          <Link href={`/bookings/${b.id}`} className="flex items-center gap-4 rounded-card border border-line bg-white p-4 hover:border-purple">
            <ShopLogo name={b.shop.name} url={b.shop.logoUrl} />
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {b.shop.name} <span className="font-semibold text-muted">· {b.number}</span>
              </p>
              <p className="text-sm text-soft">
                {bookingWhat(b)} · {bookingWhen(b.startsAt)}
              </p>
            </div>
            <BookingStatusBadge status={b.status} />
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-8">
        <h1 className="font-display text-[28px] font-extrabold">Your bookings</h1>
        {error && <Alert>{error}</Alert>}
        {items === null && !error && <p className="text-muted">Loading…</p>}
        {items?.length === 0 && (
          <div className="rounded-card border border-line bg-white px-6 py-12 text-center">
            <p className="font-display text-lg font-extrabold">No bookings yet</p>
            <p className="mt-1 text-sm text-muted">Book a table at a restaurant, or an appointment for a service.</p>
            <Link href="/shops?mode=food" className="mt-4 inline-block font-bold text-purple hover:underline">
              Find a restaurant
            </Link>
          </div>
        )}
        {upcoming.length > 0 && (
          <>
            <h2 className="font-display text-lg font-extrabold">Coming up</h2>
            <List list={upcoming} />
          </>
        )}
        {past.length > 0 && (
          <>
            <h2 className="mt-2 font-display text-lg font-extrabold">Earlier</h2>
            <List list={past} />
          </>
        )}
      </main>
    </>
  );
}
