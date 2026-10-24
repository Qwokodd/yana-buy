"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  deliveryDetailLabel,
  formatLD,
  formatLiberianPhone,
  FULFILMENT_LABEL,
  orderStatusLabel,
  payLabel,
  type Fulfilment,
  type Order,
  type OrderStatus,
  type OrderSummary,
  type RiderSummary,
} from "@yanabuy/shared";
import { Alert, Avatar, Badge, Button, Field, messageOf } from "@yanabuy/web-kit";
import { api } from "@/lib/api";
import { whenTime } from "@/lib/labels";
import { EmptyPanel, Pager, PillTabs, SearchBox, Tile } from "./bits";

const TONE: Record<OrderStatus, "warn" | "purple" | "success" | "neutral" | "danger"> = {
  awaiting_payment: "neutral",
  placed: "warn",
  accepted: "purple",
  ready: "purple",
  picked_up: "purple",
  delivered: "success",
  cancelled: "danger",
};

export function OrderStatusBadge({ status, fulfilment = "delivery" }: { status: OrderStatus; fulfilment?: Fulfilment }) {
  return <Badge tone={TONE[status]}>{orderStatusLabel(status, fulfilment)}</Badge>;
}

const EVENT_LABEL: Record<string, string> = {
  placed: "Order placed",
  accepted: "Shop accepted",
  ready: "Packed and ready",
  picked_up: "Rider picked it up",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rider_assigned: "Rider assigned",
  rider_removed: "Rider removed",
  rider_offered: "Shop asked a rider",
  rider_broadcast: "Nearby riders were told it's ready",
  rider_declined: "Rider said no",
  rider_offer_cancelled: "Shop cancelled its rider request",
  dispute_opened: "Buyer reported a problem",
  dispute_response: "Seller answered the problem",
  dispute_resolved: "YanaBuy decided the problem",
};

type View = "all" | "active" | "need_rider" | "delivered" | "cancelled";

/** Orders table with a detail panel. `board` = the rider-assignment view. */
export function OrdersBrowser({ board = false }: { board?: boolean }) {
  const [view, setView] = useState<View>(board ? "need_rider" : "all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<OrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [riders, setRiders] = useState<RiderSummary[]>([]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setSelectedId(id);
  }, []);

  const loadRiders = useCallback(() => {
    api.admin
      .riders()
      .then((r) => setRiders(r.items))
      .catch(() => {});
  }, []);
  useEffect(loadRiders, [loadRiders]);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .orders({ view, q: search || undefined, page })
      .then((res) => {
        setRows(res.items);
        setTotal(res.total);
        setError(null);
        if (board) setSelectedId((cur) => cur ?? res.items[0]?.id ?? null);
      })
      .catch((err) => setError(messageOf(err)))
      .finally(() => setLoading(false));
  }, [view, search, page, board]);

  useEffect(() => {
    load();
  }, [load]);

  const tabs: { value: View; label: string }[] = board
    ? [
        { value: "need_rider", label: "Needs a rider" },
        { value: "active", label: "All on the way" },
      ]
    : [
        { value: "all", label: "All" },
        { value: "active", label: "In progress" },
        { value: "need_rider", label: "Needs a rider" },
        { value: "delivered", label: "Delivered" },
        { value: "cancelled", label: "Cancelled" },
      ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PillTabs
          label="Show"
          tabs={tabs}
          value={view}
          onChange={(v) => {
            setView(v);
            setPage(1);
          }}
        />
        <SearchBox
          label="Search orders"
          value={query}
          onChange={setQuery}
          onSubmit={() => {
            setSearch(query.trim());
            setPage(1);
          }}
          placeholder="Order number, name, phone or shop"
        />
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="flex flex-col gap-5">
          <div className="overflow-hidden rounded-card border border-line bg-white">
            <table className="w-full text-left text-[13.5px]">
              <thead className="bg-[#FBF9FC] text-[11.5px] font-bold uppercase tracking-[0.6px] text-muted">
                <tr>
                  <th className="px-[18px] py-3">Order</th>
                  <th className="px-3 py-3">Shop</th>
                  <th className="px-3 py-3">Total</th>
                  <th className="px-3 py-3">Rider</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelectedId(o.id)}
                    className={`cursor-pointer border-t border-[#F0EAF2] hover:bg-[#FBF9FC] ${selectedId === o.id ? "bg-purple-tint/60" : ""}`}
                  >
                    <td className="px-[18px] py-3">
                      <button className="flex items-center gap-2.5 text-left" onClick={() => setSelectedId(o.id)}>
                        <Tile name={o.number} url={o.firstImage} size={38} />
                        <span>
                          <span className="block font-bold">{o.number}</span>
                          <span className="text-xs text-muted">
                            {whenTime(o.createdAt)} · {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                            {o.fulfilment !== "delivery" && <span className="ml-1 font-bold text-ink">· {FULFILMENT_LABEL[o.fulfilment]}</span>}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-3">{o.shop.name}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold">{formatLD(o.total)}</td>
                    <td className="px-3 py-3 text-soft">{o.rider?.fullName ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-3">
                      <OrderStatusBadge status={o.status} fulfilment={o.fulfilment} />
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted">
                      {view === "need_rider" ? "Every accepted order has a rider." : `No orders here${search ? ` matching “${search}”` : ""}.`}
                    </td>
                  </tr>
                )}
                {loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted">
                      Loading…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <Pager page={page} pages={Math.max(1, Math.ceil(total / 25))} onPage={setPage} />
          </div>
          {board && <RiderList riders={riders} />}
        </div>

        {selectedId ? (
          <OrderPanel
            key={selectedId}
            id={selectedId}
            riders={riders}
            onChanged={(o) => {
              setRows((prev) => prev.map((r) => (r.id === o.id ? { ...r, status: o.status, rider: o.rider } : r)));
              loadRiders();
            }}
          />
        ) : (
          <EmptyPanel>Pick an order to see what was bought, where it goes and who delivers it.</EmptyPanel>
        )}
      </div>
    </>
  );
}

export function RiderList({ riders }: { riders: RiderSummary[] }) {
  return (
    <section className="rounded-[20px] border border-line bg-white p-5" aria-label="Riders">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-extrabold">Riders</h2>
        <Link href="/people?role=rider" className="text-[13px] font-bold text-purple hover:underline">
          Add a rider
        </Link>
      </div>
      <p className="text-[12.5px] text-muted">Least busy first.</p>
      <ul className="mt-2 flex flex-col">
        {riders.map((r) => (
          <li key={r.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
            <Avatar name={r.fullName} url={r.avatarUrl} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{r.fullName}</p>
              <p className="text-xs text-muted">{formatLiberianPhone(r.phone)}</p>
            </div>
            {r.status === "blocked" ? (
              <Badge tone="danger">Blocked</Badge>
            ) : (
              <span className="text-right text-[12.5px]">
                <span className={`block font-bold ${r.activeDeliveries ? "text-purple" : "text-success"}`}>
                  {r.activeDeliveries ? `${r.activeDeliveries} on the go` : "Free"}
                </span>
                <span className="text-muted">{r.deliveredToday} delivered today</span>
              </span>
            )}
          </li>
        ))}
        {!riders.length && (
          <li className="py-5 text-center text-sm text-muted">
            No riders yet. Open someone in Buyers &amp; accounts and change their role to Rider.
          </li>
        )}
      </ul>
    </section>
  );
}

function OrderPanel({ id, riders, onChanged }: { id: string; riders: RiderSummary[]; onChanged: (o: Order) => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [riderId, setRiderId] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    api.admin
      .order(id)
      .then((res) => {
        setOrder(res.order);
        setRiderId(res.order.rider?.id ?? "");
      })
      .catch((err) => setError(messageOf(err)));
  }, [id]);

  async function run(action: () => Promise<{ order: Order }>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await action();
      setOrder(res.order);
      setRiderId(res.order.rider?.id ?? "");
      setNotice(done);
      setCancelling(false);
      setReason("");
      onChanged(res.order);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (!order) return <div className="rounded-[20px] border border-line bg-white p-6 text-sm text-muted">{error ?? "Loading…"}</div>;

  // Eat in / pickup: the buyer comes to the restaurant — no rider.
  const canAssign = order.fulfilment === "delivery" && ["accepted", "ready", "picked_up"].includes(order.status);
  const open = order.status !== "delivered" && order.status !== "cancelled";

  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-[22px]" aria-label={`Order ${order.number}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-extrabold">{order.number}</p>
          <p className="text-[12.5px] text-muted">
            {whenTime(order.createdAt)} · {FULFILMENT_LABEL[order.fulfilment]} · {payLabel(order.paymentMethod, order.fulfilment)} · {order.paymentStatus === "paid" ? "paid" : "not paid yet"}
          </p>
        </div>
        <OrderStatusBadge status={order.status} fulfilment={order.fulfilment} />
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
      {order.dispute && (
        <Alert tone={order.dispute.status === "open" ? "warn" : "info"}>
          {order.dispute.status === "open" ? "The buyer reported a problem with this order. " : "A problem on this order was decided. "}
          <a href={`/disputes`} className="font-bold underline">
            Open Disputes
          </a>
        </Alert>
      )}
      {order.status === "cancelled" && (
        <Alert tone="warn">
          Cancelled by the {order.cancelledBy}
          {order.cancelReason ? `: ${order.cancelReason}` : ""}
        </Alert>
      )}

      <ul className="flex flex-col gap-2">
        {order.items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 text-[13.5px]">
            <Tile name={i.name} url={i.image} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{i.name}</span>
              {i.variantLabel && <span className="block text-[12.5px] font-semibold text-soft">{i.variantLabel}</span>}
              <span className="text-muted">
                {i.quantity} × {formatLD(i.price)}
              </span>
            </span>
            <span className="font-semibold">{formatLD(i.price * i.quantity)}</span>
          </li>
        ))}
      </ul>
      <dl className="grid gap-1 border-t border-line pt-3 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-muted">Items</dt>
          <dd>{formatLD(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{order.fulfilment !== "delivery" ? `${FULFILMENT_LABEL[order.fulfilment]} — no delivery fee` : "Delivery"}{order.deliveryFeeBreakdown ? ` (${deliveryDetailLabel({ ...order.deliveryFeeBreakdown, weightCharged: order.deliveryFeeBreakdown.weightFeeCents > 0 })})` : ""}</dt>
          <dd>{order.deliveryFee ? formatLD(order.deliveryFee) : "Free"}</dd>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between text-success">
            <dt>Discount {order.discountCode} (YanaBuy pays)</dt>
            <dd>−{formatLD(order.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between text-[15px] font-extrabold">
          <dt>Total</dt>
          <dd>{formatLD(order.total)}</dd>
        </div>
        {order.sellerEarning != null && (
          <>
            <div className="flex justify-between border-t border-line pt-1 text-soft">
              <dt>Shop earns (its own prices)</dt>
              <dd>{formatLD(order.sellerEarning)}</dd>
            </div>
            <div className="flex justify-between text-purple">
              <dt>YanaBuy commission</dt>
              <dd>{formatLD(order.subtotal - order.sellerEarning)}</dd>
            </div>
            {order.fulfilment === "delivery" && order.deliveryFee > 0 && (
              <div className="flex justify-between text-soft">
                <dt>Rider earns (delivery fee)</dt>
                <dd>{formatLD(order.deliveryFee)}</dd>
              </div>
            )}
          </>
        )}
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-ground p-3 text-[13px]">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">Pick up from</p>
          <p className="font-bold">{order.shop.name}</p>
          <p>{order.shop.address}, {order.shop.city}</p>
          <p className="text-muted">{formatLiberianPhone(order.shop.phone)}</p>
        </div>
        <div className="rounded-2xl bg-ground p-3 text-[13px]">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">{order.fulfilment === "delivery" ? "Deliver to" : order.fulfilment === "eat_in" ? "Eating in" : "Collecting"}</p>
          <p className="font-bold">{order.delivery.name}</p>
          {order.fulfilment !== "delivery" && (
            <p>
              {order.arriveAt ? `Arriving ${whenTime(order.arriveAt)}` : "As soon as it's ready"}
              {order.partySize ? ` · ${order.partySize} people` : ""}
              {order.booking ? ` · booking ${order.booking.number}` : ""}
            </p>
          )}
          <p>
            {order.delivery.address}, {order.delivery.area ? `${order.delivery.area}, ` : ""}
            {order.delivery.city}
          </p>
          <p className="text-muted">{formatLiberianPhone(order.delivery.phone)}</p>
          {order.delivery.note && <p className="mt-1 italic text-soft">“{order.delivery.note}”</p>}
        </div>
      </div>

      {canAssign && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <Field label={order.rider ? "Rider" : "Choose a rider"}>
            {(fid) => (
              <select id={fid} value={riderId} onChange={(e) => setRiderId(e.target.value)} className="h-11 rounded-[12px] border border-line-strong bg-white px-3 text-sm font-semibold">
                <option value="">No rider</option>
                {riders
                  .filter((r) => r.status === "active")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.fullName} — {r.activeDeliveries ? `${r.activeDeliveries} on the go` : "free"}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          <Button
            busy={busy}
            disabled={riderId === (order.rider?.id ?? "")}
            onClick={() =>
              run(
                () => api.admin.assignRider(order.id, riderId || null),
                riderId ? `${riders.find((r) => r.id === riderId)?.fullName} is delivering ${order.number}.` : "Rider removed."
              )
            }
          >
            {order.rider ? "Change rider" : "Assign rider"}
          </Button>
        </div>
      )}
      {!canAssign && order.rider && (
        <p className="text-[13px]">
          Rider: <strong>{order.rider.fullName}</strong> · {formatLiberianPhone(order.rider.phone)}
        </p>
      )}
      {order.status === "placed" && <p className="text-[12.5px] text-muted">Waiting for the shop to accept before a rider can be assigned.</p>}

      <div className="border-t border-line pt-4">
        <p className="mb-2 text-[13px] font-bold">Timeline</p>
        <ol className="flex flex-col gap-2">
          {order.events.map((e, i) => (
            <li key={i} className="flex gap-3 text-[13px]">
              <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-purple" />
              <span>
                <strong>{EVENT_LABEL[e.status] ?? e.status}</strong>
                {e.note ? ` — ${e.note}` : ""}
                <span className="block text-xs text-muted">
                  {whenTime(e.createdAt)}
                  {e.by ? ` · ${e.by}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-2xl bg-ground p-3 text-[13px]">
        Buyer: <strong>{order.buyer.fullName}</strong> · {formatLiberianPhone(order.buyer.phone)} ·{" "}
        <Link href={`/people?id=${order.buyer.id}`} className="font-bold text-purple hover:underline">
          Account
        </Link>
      </div>

      {open &&
        (cancelling ? (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <Field label="Why cancel? (the buyer and shop see this)">
              {(fid) => (
                <textarea
                  id={fid}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="resize-none rounded-[12px] border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-purple"
                  placeholder="e.g. The buyer asked by phone"
                />
              )}
            </Field>
            <div className="flex gap-2">
              <Button variant="danger" busy={busy} disabled={reason.trim().length < 3} onClick={() => run(() => api.admin.cancelOrder(order.id, reason), `${order.number} is cancelled and the stock is back.`)}>
                Cancel order
              </Button>
              <Button variant="ghost" onClick={() => setCancelling(false)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="text-danger hover:!text-danger" onClick={() => setCancelling(true)}>
            Cancel this order
          </Button>
        ))}
    </section>
  );
}
