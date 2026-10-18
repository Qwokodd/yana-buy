"use client";

import { useEffect, useState } from "react";
import { BOOKING_STATUS_LABEL, formatLiberianPhone, type Booking, type BookingStatus } from "@yanabuy/shared";
import { Alert, Badge, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { PillTabs } from "@/components/bits";
import { api } from "@/lib/api";

const when = (iso: string) => `${new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} ${iso.slice(11, 16)}`;
const TONE: Record<BookingStatus, "success" | "neutral" | "danger" | "warn" | "purple"> = { requested: "warn", confirmed: "success", declined: "danger", cancelled: "neutral", completed: "purple", no_show: "neutral" };

export default function BookingsPage() {
  const [status, setStatus] = useState<BookingStatus | "all">("all");
  const [items, setItems] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setItems(null);
    api.admin
      .bookings(status === "all" ? undefined : status)
      .then((r) => setItems(r.items))
      .catch((err) => setError(messageOf(err)));
  }, [status]);
  return (
    <AdminShell title="Bookings" subtitle="Restaurant tables and service appointments. Shops confirm their own; this is for keeping an eye on things.">
      <div className="mb-5">
        <PillTabs
          label="Show"
          tabs={[{ value: "all", label: "All" }, ...(Object.keys(BOOKING_STATUS_LABEL) as BookingStatus[]).map((s) => ({ value: s, label: BOOKING_STATUS_LABEL[s] }))]}
          value={status}
          onChange={(v) => setStatus(v as BookingStatus | "all")}
        />
      </div>
      {error && <Alert>{error}</Alert>}
      <section className="overflow-x-auto rounded-[20px] border border-line bg-white">
        {!items && <p className="p-6 text-sm text-muted">Loading…</p>}
        {items?.length === 0 && <p className="px-6 py-12 text-center text-sm text-muted">No bookings.</p>}
        {items && items.length > 0 && (
          <table className="w-full min-w-[760px] text-[13.5px]">
            <thead className="bg-ground text-left text-[12px] font-bold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Booking</th>
                <th className="px-4 py-2.5">Shop</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-t border-line">
                  <td className="whitespace-nowrap px-4 py-2.5 font-semibold">{when(b.startsAt)}</td>
                  <td className="px-4 py-2.5">
                    {b.number} · {b.kind === "table" ? `Table for ${b.partySize}` : (b.product?.name ?? "Appointment")}
                  </td>
                  <td className="px-4 py-2.5">{b.shop.name}</td>
                  <td className="px-4 py-2.5">
                    {b.contactName} · {formatLiberianPhone(b.contactPhone)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={TONE[b.status]}>{BOOKING_STATUS_LABEL[b.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AdminShell>
  );
}
