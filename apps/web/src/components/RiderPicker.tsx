"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistance, formatLiberianPhone, type GeoPoint, type NearbyRider, type Order } from "@yanabuy/shared";
import { Alert, Avatar, Button, GoogleMap, getCurrentPosition, messageOf } from "@yanabuy/web-kit";
import { api } from "@/lib/api";
import { MAPS_KEY } from "@/lib/maps";

const VEHICLE: Record<string, string> = { motorbike: "🏍️ Motorbike", keke: "🛺 Keke", car: "🚗 Car", bicycle: "🚲 Bicycle", on_foot: "🚶 On foot" };
const minsAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

/** The shop picks an online rider near it; the rider accepts or declines in their app. */
export function RiderPicker({ order, onChanged }: { order: Order; onChanged: (o: Order) => void }) {
  const [riders, setRiders] = useState<NearbyRider[] | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [shopAt, setShopAt] = useState<GeoPoint | null>(null);
  const [heavy, setHeavy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.shop
      .orderRiders(order.id)
      .then((res) => {
        setRiders(res.riders);
        setRadiusKm(res.radiusKm);
        setShopAt(res.shopLocation);
        setHeavy(res.heavy);
      })
      .catch((err) => setError(messageOf(err)));
  }, [order.id]);

  useEffect(() => {
    if (order.offer) return;
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load, order.offer]);

  async function run(key: string, fn: () => Promise<{ order: Order } | unknown>) {
    setBusy(key);
    setError(null);
    try {
      const res = (await fn()) as { order?: Order };
      if (res?.order) onChanged(res.order);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  async function setShopHere() {
    await run("shop", async () => {
      const p = await getCurrentPosition();
      await api.shop.setLocation(p);
      load();
    });
  }

  if (order.offer) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-amber bg-[#FFF8E8] p-4">
        <p className="text-sm">
          Waiting for <strong>{order.offer.rider.fullName}</strong> to accept · asked {minsAgo(order.offer.at)} min ago
        </p>
        <p className="text-[12.5px] text-soft">They get a notification on their phone. If they don&rsquo;t answer, cancel and ask someone else.</p>
        <div className="flex flex-wrap gap-2">
          {order.offer.rider.phone && (
            <a href={`tel:${order.offer.rider.phone}`} className="inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-[13px] font-bold text-purple hover:border-purple">
              Call {formatLiberianPhone(order.offer.rider.phone)}
            </a>
          )}
          <Button variant="ghost" busy={busy === "cancel"} onClick={() => run("cancel", () => api.shop.cancelOffer(order.id))}>
            Cancel request
          </Button>
        </div>
        {error && <Alert>{error}</Alert>}
      </div>
    );
  }

  const markers = [
    ...(shopAt ? [{ id: "shop", position: shopAt, color: "purple" as const, label: "S", title: order.shop.name, info: "Your shop" }] : []),
    ...(riders ?? []).map((r) => ({ id: r.id, position: r.location, color: (r.declined || !r.canCarry ? "gray" : "green") as "gray" | "green", label: "R", title: r.fullName, info: `${formatDistance(r.distanceKm)} away · ${r.activeDeliveries} on the go` })),
  ];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-extrabold">Pick a rider near you</h3>
          <p className="text-[12.5px] text-soft">
            {order.status === "ready"
              ? `Every online rider within ${radiusKm} km has been told it's packed — the first to accept gets it. You can also ask one rider directly.`
              : `When you mark it packed, every online rider within ${radiusKm} km is told and the first to accept gets it. Or ask one rider now.`}
          </p>
        </div>
        <button onClick={load} className="text-[13px] font-bold text-purple hover:underline">
          Refresh
        </button>
      </div>
      {heavy && (
        <p className="rounded-xl bg-[#FFF8E8] px-3 py-2 text-[12.5px] font-semibold">This order is heavy — only riders with a keke or car can take it.</p>
      )}
      {error && <Alert>{error}</Alert>}
      {riders !== null && !shopAt ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-soft">Set your shop&rsquo;s location so we can find riders near you. Do this while you&rsquo;re at the shop.</p>
          <Button busy={busy === "shop"} onClick={setShopHere}>
            📍 My shop is where I am now
          </Button>
        </div>
      ) : (
        <>
          {shopAt && <GoogleMap apiKey={MAPS_KEY} markers={markers} height={240} circle={{ center: shopAt, radiusKm }} />}
          {riders === null ? (
            <p className="text-sm text-muted">Looking for riders…</p>
          ) : riders.length === 0 ? (
            <p className="text-sm text-soft">No riders are online within {radiusKm} km right now. Try again in a few minutes — the list refreshes by itself.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {riders.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                  <Avatar name={r.fullName} url={r.avatarUrl} size={40} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-bold">{r.fullName}</span>
                    <span className="text-soft">
                      {formatDistance(r.distanceKm)} away{r.vehicle ? ` · ${VEHICLE[r.vehicle] ?? r.vehicle}` : ""} · {r.activeDeliveries ? `${r.activeDeliveries} delivery on the go` : "free now"}
                    </span>
                    {r.declined && <span className="block text-[12px] font-semibold text-danger">Said no to this order</span>}
                    {!r.canCarry && <span className="block text-[12px] font-semibold text-danger">Too heavy for their vehicle — needs a keke or car</span>}
                  </span>
                  <Button busy={busy === r.id} disabled={!!busy || !r.canCarry} onClick={() => run(r.id, () => api.shop.offerRider(order.id, r.id))}>
                    Ask to deliver
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
