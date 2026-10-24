"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { directionsUrl, distanceKm, formatDistance, formatLD, formatLiberianPhone, type GeoPoint, type MyRiderEarnings, type OpenJob, type Order, type OrderSummary } from "@yanabuy/shared";
import { Alert, Button, getCurrentPosition, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { OrderMap } from "@/components/OrderMap";
import { OrderStatusBadge } from "@/components/OrderBits";
import { api } from "@/lib/api";
import { setBrowsing } from "@/lib/workspace";

/** While online and this page is open, sends the rider's spot about every 30 seconds. */
function useLiveLocation(online: boolean, onPoint: (p: GeoPoint) => void) {
  const cb = useRef(onPoint);
  cb.current = onPoint;
  useEffect(() => {
    if (!online || typeof navigator === "undefined" || !navigator.geolocation) return;
    let last = 0;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        cb.current(p);
        if (Date.now() - last < 25_000) return;
        last = Date.now();
        api.me.setLocation(p).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [online]);
}

/** A rider's work on the website: go online, answer shops' requests, follow the map. (The phone app does the same.) */
export default function RiderPage() {
  const { user, loading, setUser } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<OrderSummary[] | null>(null);
  const [jobs, setJobs] = useState<OpenJob[]>([]);
  const [cash, setCash] = useState<{ amount: number; orders: number } | null>(null);
  const [pay, setPay] = useState<MyRiderEarnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [me, setMe] = useState<GeoPoint | null>(null);
  const online = !!user?.riderOnline;
  useLiveLocation(online, setMe);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/rider");
    if (user?.location && !me) setMe(user.location);
  }, [loading, user, router, me]);

  const load = useCallback(() => {
    api.rider
      .orders()
      .then((res) => {
        setItems(res.items);
        setError(null);
      })
      .catch((err) => setError(messageOf(err)));
    api.rider.cash().then(setCash).catch(() => {});
    api.rider
      .earnings()
      .then((r) => setPay(r.earnings))
      .catch(() => {});
    api.rider
      .openJobs()
      .then((r) => setJobs(r.items))
      .catch(() => setJobs([]));
  }, []);

  useEffect(() => {
    if (user?.role !== "rider") return;
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [user?.role, load]);

  async function setOnline(next: boolean) {
    setSwitching(true);
    setError(null);
    try {
      let at: GeoPoint | null = null;
      if (next) {
        at = await getCurrentPosition();
        setMe(at);
      }
      const res = await api.rider.setOnline(next, at);
      setUser(res.user);
      load();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSwitching(false);
    }
  }

  const open = (items ?? []).filter((o) => o.status !== "delivered" && o.status !== "cancelled");
  const requests = open.filter((o) => !o.rider && o.offer);
  const active = open.filter((o) => !!o.rider);
  const done = (items ?? []).filter((o) => o.status === "delivered" || o.status === "cancelled");

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-[28px] font-extrabold">My deliveries</h1>
          {user?.role === "rider" && (
            <button
              type="button"
              onClick={() => {
                setBrowsing(true);
                router.push("/");
              }}
              className="rounded-full border border-line-strong px-4 py-2 text-sm font-bold text-purple hover:border-purple"
            >
              Browse like a buyer
            </button>
          )}
        </div>
        {user && user.role !== "rider" ? (
          <Alert tone="info">
            This page is for YanaBuy riders. <Link href="/ride" className="font-bold underline">Apply to deliver</Link>
          </Alert>
        ) : (
          <>
            {error && <Alert>{error}</Alert>}
            {flash && <Alert tone="success">{flash}</Alert>}
            <section className={`flex items-center gap-4 rounded-card border p-5 ${online ? "border-success bg-success-tint" : "border-line bg-white"}`}>
              <span className={`h-3 w-3 rounded-full ${online ? "bg-success" : "bg-muted"}`} />
              <div className="flex-1">
                <p className="font-bold">{online ? "You're online" : "You're offline"}</p>
                <p className="text-[13px] text-soft">
                  {online ? "Shops near you can send delivery requests. Keep this page (or the app) open so your location stays fresh." : "Go online to get delivery requests from shops near you."}
                </p>
              </div>
              <Button variant={online ? "outline" : "success"} busy={switching} onClick={() => setOnline(!online)}>
                {online ? "Go offline" : "Go online"}
              </Button>
            </section>
            {pay && (
              <section className="grid grid-cols-2 gap-3 rounded-card border border-line bg-white p-5" aria-label="Your delivery pay">
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Today</p>
                  <p className="font-display text-2xl font-extrabold">{formatLD(pay.today.earned)}</p>
                  <p className="text-[13px] text-soft">
                    {pay.today.trips} {pay.today.trips === 1 ? "trip" : "trips"}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-wide text-muted">YanaBuy owes you</p>
                  <p className="font-display text-2xl font-extrabold text-success">{formatLD(pay.owed)}</p>
                  <p className="text-[13px] text-soft">Sent to your mobile money</p>
                </div>
                <p className="col-span-2 text-[12.5px] text-muted">You earn the full delivery fee of every order you deliver.</p>
              </section>
            )}
            {cash && cash.amount > 0 && (
              <section className="rounded-card bg-ink p-5 text-white">
                <p className="text-[12px] font-bold uppercase tracking-wide text-white/70">Cash to hand in</p>
                <p className="font-display text-2xl font-extrabold text-amber">{formatLD(cash.amount)}</p>
                <p className="text-[13px] text-white/80">From {cash.orders} cash {cash.orders === 1 ? "order" : "orders"}. Give it to the YanaBuy office.</p>
              </section>
            )}
            {requests.map((o) => (
              <Request key={o.id} id={o.id} me={me} onDone={(m) => { setFlash(m); load(); }} />
            ))}
            {online && jobs.filter((j) => !requests.some((r) => r.id === j.id)).length > 0 && (
              <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Packed and waiting near you — first to accept gets it</p>
            )}
            {online &&
              jobs
                .filter((j) => !requests.some((r) => r.id === j.id))
                .map((j) => <Request key={j.id} id={j.id} me={me} openKm={j.distanceKm} onDone={(m) => { setFlash(m); load(); }} />)}
            {active.map((o) => (
              <Delivery key={o.id} id={o.id} me={me} onDone={(m) => { if (m) setFlash(m); load(); }} />
            ))}
            {items && !requests.length && !active.length && !(online && jobs.length) && (
              <p className="rounded-card border border-line bg-white px-6 py-10 text-center text-sm text-muted">
                {online ? "No deliveries right now. Requests from shops near you show up here." : "No deliveries right now. Go online to get requests."}
              </p>
            )}
            {done.length > 0 && (
              <section className="flex flex-col gap-2">
                <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Last two days</p>
                {done.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3 text-sm">
                    <span className="font-semibold">{o.number} · {o.shop.name}</span>
                    <OrderStatusBadge status={o.status} />
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

function useRiderOrder(id: string) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.rider
      .order(id)
      .then((r) => setOrder(r.order))
      .catch((err) => setError(messageOf(err)));
  }, [id]);
  return { order, setOrder, error, setError };
}

function Stops({ order }: { order: Order }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl bg-ground p-3 text-sm">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">1 · Pick up from</p>
        <p className="font-bold">{order.shop.name}</p>
        <p className="text-soft">{order.shop.address}, {order.shop.city}</p>
        <a href={`tel:${order.shop.phone}`} className="font-bold text-purple hover:underline">Call {formatLiberianPhone(order.shop.phone)}</a>
      </div>
      <div className="rounded-2xl bg-ground p-3 text-sm">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">2 · Deliver to</p>
        <p className="font-bold">{order.delivery.name}</p>
        <p className="text-soft">{order.delivery.address}, {order.delivery.area ? `${order.delivery.area}, ` : ""}{order.delivery.city}</p>
        {order.delivery.note && <p className="italic text-soft">“{order.delivery.note}”</p>}
        <a href={`tel:${order.delivery.phone}`} className="font-bold text-purple hover:underline">Call {formatLiberianPhone(order.delivery.phone)}</a>
      </div>
    </div>
  );
}

function NextStop({ order, me }: { order: Order; me: GeoPoint | null }) {
  const drop = order.delivery.lat != null && order.delivery.lng != null ? { lat: order.delivery.lat, lng: order.delivery.lng } : null;
  const toShop = order.status === "accepted" || order.status === "ready";
  const next = toShop ? order.shop.location : drop;
  if (!next) return <p className="text-[13px] text-muted">{toShop ? "The shop hasn't set its pin — use the address and call them." : "No drop-off pin — use the address and call the buyer."}</p>;
  return (
    <a href={directionsUrl(next, me)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center rounded-full border-2 border-purple px-5 text-sm font-bold text-purple hover:bg-purple-tint">
      Directions to the {toShop ? "shop" : "buyer"}{me ? ` · ${formatDistance(distanceKm(me, next))}` : ""} ↗
    </a>
  );
}

function Request({ id, me, onDone, openKm }: { id: string; me: GeoPoint | null; onDone: (message: string) => void; openKm?: number }) {
  const { order, error, setError } = useRiderOrder(id);
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  if (!order) return <div className="rounded-card border border-line bg-white p-5 text-sm text-muted">{error ?? "Loading request…"}</div>;
  async function answer(yes: boolean) {
    setBusy(yes ? "yes" : "no");
    setError(null);
    try {
      if (yes) await api.rider.accept(order!.id);
      else await api.rider.decline(order!.id);
      onDone(yes ? `You're delivering ${order!.number}. Head to ${order!.shop.name}.` : openKm != null ? `${order!.number} hidden.` : `You said no to ${order!.number}.`);
    } catch (err) {
      setError(messageOf(err));
      setBusy(null);
    }
  }
  return (
    <section className="flex flex-col gap-3 rounded-card border-2 border-amber bg-white p-5">
      <p className="text-[12px] font-bold uppercase tracking-wide text-warn">
        {openKm != null ? `Pickup near you · shop ${formatDistance(openKm)} away` : "New delivery request"}
      </p>
      <p className="font-display text-xl font-extrabold">{order.number} · {order.shop.name}</p>
      {error && <Alert>{error}</Alert>}
      {order.paymentMethod === "cod" && <p className="text-sm font-bold text-warn">Collect {formatLD(order.total)} in cash</p>}
      <Stops order={order} />
      <OrderMap order={order} height={240} title="The trip" />
      <div className="flex gap-2">
        <Button variant="outline" busy={busy === "no"} disabled={!!busy} onClick={() => answer(false)}>{openKm != null ? "Not for me" : "Decline"}</Button>
        <Button busy={busy === "yes"} disabled={!!busy} onClick={() => answer(true)}>Accept</Button>
      </div>
    </section>
  );
}

function Delivery({ id, me, onDone }: { id: string; me: GeoPoint | null; onDone: (message?: string) => void }) {
  const { order, setOrder, error, setError } = useRiderOrder(id);
  const [busy, setBusy] = useState(false);
  const [cash, setCash] = useState(false);
  if (!order) return <div className="rounded-card border border-line bg-white p-5 text-sm text-muted">{error ?? "Loading…"}</div>;
  const cod = order.paymentMethod === "cod";
  async function run(fn: () => Promise<{ order: Order }>, msg?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      setOrder(res.order);
      onDone(msg);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="flex flex-col gap-3 rounded-card border-2 border-purple bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-xl font-extrabold">{order.number}</p>
        <OrderStatusBadge status={order.status} />
      </div>
      {error && <Alert>{error}</Alert>}
      <p className="text-sm text-soft">{order.items.map((i) => `${i.quantity} × ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""}`).join(", ")}</p>
      {cod && <p className="rounded-2xl bg-warn-tint p-3 text-sm font-bold text-warn">Collect {formatLD(order.total)} in cash</p>}
      <Stops order={order} />
      <OrderMap order={order} height={260} title="Map" />
      <NextStop order={order} me={me} />
      {order.status === "accepted" && <p className="text-sm text-soft">The shop is still packing it. Pick it up when they mark it ready.</p>}
      {order.status === "ready" && <Button busy={busy} onClick={() => run(() => api.rider.pickedUp(order.id))}>I&rsquo;ve picked it up</Button>}
      {order.status === "picked_up" && (
        <>
          {cod && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--c-purple))]" />
              I collected {formatLD(order.total)} in cash
            </label>
          )}
          <Button variant="success" busy={busy} disabled={cod && !cash} onClick={() => run(() => api.rider.delivered(order.id, cash), `${order.number} delivered — thank you!`)}>
            Delivered
          </Button>
        </>
      )}
    </section>
  );
}
