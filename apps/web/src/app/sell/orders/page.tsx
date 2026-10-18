"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatLD, formatLiberianPhone, type Order, type OrderSummary } from "@yanabuy/shared";
import { Alert, Button, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { OrderStatusBadge } from "@/components/OrderBits";
import { DisputeCard } from "@/components/OrderTrust";
import { api } from "@/lib/api";

type View = "active" | "done";

export default function SellerOrdersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [view, setView] = useState<View>("active");
  const [items, setItems] = useState<OrderSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/sell/orders");
  }, [loading, user, router]);

  const load = useCallback(() => {
    api.shop
      .orders(view)
      .then((res) => {
        setItems(res.items);
        setError(null);
      })
      .catch((err) => setError(messageOf(err)));
  }, [view]);

  useEffect(() => {
    if (!user) return;
    setItems(null);
    load();
    // New orders show up by themselves.
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [user, load]);

  const waiting = (items ?? []).filter((o) => o.status === "placed").length;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-5 px-4 py-8 sm:px-8">
        <div>
          <Link href="/sell" className="text-[13px] font-bold text-purple hover:underline">
            ← My shop
          </Link>
          <h1 className="font-display text-[28px] font-extrabold">Shop orders</h1>
          <p className="text-sm text-muted">Accept new orders quickly, pack them, and mark them ready — a YanaBuy rider picks them up.</p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Show">
          {(["active", "done"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`h-9 rounded-full px-4 text-[13px] font-bold ${view === v ? "bg-purple text-white" : "border border-line-strong bg-white text-soft"}`}
            >
              {v === "active" ? `To do${waiting ? ` · ${waiting} new` : ""}` : "Finished"}
            </button>
          ))}
        </div>
        {error && <Alert>{error}</Alert>}
        {items === null && !error && <p className="text-muted">Loading…</p>}
        {items && items.length === 0 && (
          <div className="rounded-card border border-line bg-white px-6 py-12 text-center text-sm text-muted">
            {view === "active" ? "No orders to handle right now. New ones appear here by themselves." : "No finished orders yet."}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {items?.map((o) =>
            openId === o.id ? (
              <SellerOrder
                key={o.id}
                id={o.id}
                onClose={() => setOpenId(null)}
                onChanged={(u) => setItems((prev) => (prev ?? []).map((x) => (x.id === u.id ? { ...x, status: u.status, rider: u.rider } : x)))}
              />
            ) : (
              <button key={o.id} onClick={() => setOpenId(o.id)} className="flex items-center gap-4 rounded-card border border-line bg-white p-4 text-left hover:border-purple">
                {o.firstImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.firstImage} alt="" className="h-14 w-14 rounded-xl border border-line object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded-xl bg-ground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{o.number}</span>
                  <span className="text-sm text-soft">
                    {o.itemCount} {o.itemCount === 1 ? "item" : "items"} · {formatLD(o.total)} ·{" "}
                    {new Date(o.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                {o.disputeStatus === "open" && <span className="rounded-full bg-danger-tint px-2.5 py-0.5 text-[12px] font-bold text-danger">Problem reported</span>}
                <OrderStatusBadge status={o.status} />
              </button>
            )
          )}
        </div>
      </main>
    </>
  );
}

function SellerOrder({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: (o: Order) => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    api.shop
      .order(id)
      .then((res) => setOrder(res.order))
      .catch((err) => setError(messageOf(err)));
  }, [id]);

  async function run(action: () => Promise<{ order: Order }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      setOrder(res.order);
      onChanged(res.order);
      setRejecting(false);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (!order) return <div className="rounded-card border border-purple bg-white p-5 text-sm text-muted">{error ?? "Loading…"}</div>;

  return (
    <section className="flex flex-col gap-4 rounded-card border-2 border-purple bg-white p-5" aria-label={`Order ${order.number}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-xl font-extrabold">{order.number}</p>
        <div className="flex items-center gap-3">
          <OrderStatusBadge status={order.status} />
          <button onClick={onClose} className="text-sm font-bold text-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      <ul className="flex flex-col gap-2">
        {order.items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 text-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-tint font-extrabold text-purple">{i.quantity}×</span>
            <span className="flex-1 font-semibold">
              {i.name}
              {i.variantLabel && <span className="ml-1 font-normal text-soft">· {i.variantLabel}</span>}
            </span>
            <span>{formatLD(i.price * i.quantity)}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line pt-2 text-sm">
        Items {formatLD(order.subtotal)} ·{" "}
        {order.paymentMethod === "cod" ? `the buyer pays the rider ${formatLD(order.total)} in cash` : `paid online (${formatLD(order.total)})`}
      </p>
      <div className="rounded-2xl bg-ground p-3 text-sm">
        <p className="font-bold">{order.delivery.name}</p>
        <p>
          {order.delivery.address}, {order.delivery.city} · {formatLiberianPhone(order.delivery.phone)}
        </p>
        {order.delivery.note && <p className="italic text-soft">“{order.delivery.note}”</p>}
      </div>
      {order.rider && (
        <p className="text-sm">
          Rider: <strong>{order.rider.fullName}</strong> · {formatLiberianPhone(order.rider.phone)}
        </p>
      )}
      {order.status === "cancelled" && order.cancelReason && <Alert tone="warn">Cancelled: {order.cancelReason}</Alert>}
      {order.dispute && (
        <DisputeCard dispute={order.dispute} audience="seller">
          {order.dispute.status === "open" && <DisputeResponse order={order} onDone={(o) => { setOrder(o); onChanged(o); }} />}
        </DisputeCard>
      )}

      {rejecting ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="reject-reason" className="text-[13px] font-bold">
            Why can't you do this order? (the buyer sees this)
          </label>
          <textarea id="reject-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="resize-none rounded-[12px] border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-purple" placeholder="e.g. Sold out of size 42 today" />
          <div className="flex gap-2">
            <Button variant="danger" busy={busy} disabled={reason.trim().length < 3} onClick={() => run(() => api.shop.rejectOrder(order.id, reason))}>
              Turn down order
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {order.status === "placed" && (
            <Button variant="success" busy={busy} onClick={() => run(() => api.shop.acceptOrder(order.id))}>
              Accept order
            </Button>
          )}
          {order.status === "accepted" && (
            <Button busy={busy} onClick={() => run(() => api.shop.orderReady(order.id))}>
              Packed — ready for the rider
            </Button>
          )}
          {(order.status === "placed" || order.status === "accepted") && (
            <Button variant="ghost" className="text-danger hover:!text-danger" onClick={() => setRejecting(true)}>
              Can't do it
            </Button>
          )}
          {order.status === "ready" && <p className="text-sm text-soft">{order.rider ? `${order.rider.fullName} is coming to pick it up.` : "Waiting for YanaBuy to send a rider."}</p>}
          {order.status === "picked_up" && <p className="text-sm text-soft">On its way to the buyer.</p>}
        </div>
      )}
    </section>
  );
}

function DisputeResponse({ order, onDone }: { order: Order; onDone: (o: Order) => void }) {
  const [text, setText] = useState(order.dispute?.sellerResponse ?? "");
  const [editing, setEditing] = useState(!order.dispute?.sellerResponse);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="self-start text-sm font-bold text-purple hover:underline">
        Change your side
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="dispute-response" className="text-[13px] font-bold">
        Your side of the story (the buyer and YanaBuy see this)
      </label>
      <textarea
        id="dispute-response"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        className="resize-none rounded-[12px] border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-purple"
        placeholder="e.g. It was checked and working when we packed it. We can swap it."
      />
      {error && <Alert>{error}</Alert>}
      <div>
        <Button
          busy={busy}
          disabled={text.trim().length < 5}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await api.shop.respondToDispute(order.id, text);
              setEditing(false);
              onDone(res.order);
            } catch (err) {
              setError(messageOf(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Send your side
        </Button>
      </div>
    </div>
  );
}
