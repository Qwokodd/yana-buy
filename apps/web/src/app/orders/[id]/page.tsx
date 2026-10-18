"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatLD, formatLiberianPhone, PAYMENT_METHOD_LABEL, type Order } from "@yanabuy/shared";
import { Alert, Avatar, Button, messageOf } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { EVENT_LABEL, OrderProgress, OrderStatusBadge } from "@/components/OrderBits";
import { api } from "@/lib/api";
import { DisputeCard, RateItems, ReportProblem } from "@/components/OrderTrust";
import { MessageShopButton } from "@/components/MessageShop";

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.orders
      .get(id)
      .then((res) => setOrder(res.order))
      .catch((err) => setError(messageOf(err)));
  }, [id]);

  useEffect(() => {
    setPlaced(new URLSearchParams(window.location.search).has("placed"));
    load();
    // Check for news every 30 seconds while the order is moving.
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function cancel() {
    if (!order || !confirm("Cancel this order?")) return;
    setBusy(true);
    try {
      const res = await api.orders.cancel(order.id, "Cancelled by the buyer");
      setOrder(res.order);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-8">
        <Link href="/orders" className="text-[13px] font-bold text-purple hover:underline">
          ← All orders
        </Link>
        {error && <Alert>{error}</Alert>}
        {!order ? (
          !error && <p className="text-muted">Loading…</p>
        ) : (
          <>
            {placed && order.status === "placed" && (
              <Alert tone="success">Thank you! Your order is placed. {order.shop.name} will confirm it soon.</Alert>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="font-display text-[26px] font-extrabold">Order {order.number}</h1>
              <OrderStatusBadge status={order.status} />
            </div>

            {order.status === "cancelled" ? (
              <Alert tone="warn">
                This order was cancelled{order.cancelledBy ? ` by the ${order.cancelledBy === "admin" ? "YanaBuy team" : order.cancelledBy}` : ""}
                {order.cancelReason ? `: ${order.cancelReason}` : "."}
              </Alert>
            ) : (
              <section className="rounded-card border border-line bg-white p-5">
                <OrderProgress status={order.status} />
              </section>
            )}

            {order.rider && order.status !== "delivered" && order.status !== "cancelled" && (
              <section className="flex items-center gap-3 rounded-card border border-line bg-white p-4">
                <Avatar name={order.rider.fullName} url={order.rider.avatarUrl} size={48} />
                <div className="flex-1">
                  <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Your rider</p>
                  <p className="font-bold">{order.rider.fullName}</p>
                </div>
                <a href={`tel:${order.rider.phone}`} className="rounded-full border border-line-strong px-4 py-2 text-sm font-bold text-purple hover:border-purple">
                  Call {formatLiberianPhone(order.rider.phone)}
                </a>
              </section>
            )}

            <section className="rounded-card border border-line bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <Link href={`/shop/${order.shop.slug}`} className="font-bold hover:text-purple">
                  {order.shop.name}
                </Link>
                <span className="flex items-center gap-3">
                  <MessageShopButton shopId={order.shop.id} orderId={order.id} label="Message" className="h-9 text-[13px]" />
                  <a href={`tel:${order.shop.phone}`} className="text-[13px] font-bold text-purple hover:underline">
                    Call the shop
                  </a>
                </span>
              </div>
              <ul className="flex flex-col gap-3">
                {order.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3">
                    {i.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.image} alt="" className="h-14 w-14 rounded-xl border border-line object-cover" />
                    ) : (
                      <div className="h-14 w-14 rounded-xl bg-ground" />
                    )}
                    <span className="flex-1">
                      <span className="block font-semibold">{i.name}</span>
                      {i.variantLabel && <span className="block text-[13px] font-semibold text-soft">{i.variantLabel}</span>}
                      <span className="text-sm text-muted">
                        {i.quantity} × {formatLD(i.price)}
                      </span>
                    </span>
                    <span className="font-bold">{formatLD(i.price * i.quantity)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 flex flex-col gap-1 border-t border-line pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Items</dt>
                  <dd>{formatLD(order.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Delivery</dt>
                  <dd>{order.deliveryFee ? formatLD(order.deliveryFee) : "Free"}</dd>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between font-semibold text-success">
                    <dt>Discount{order.discountCode ? ` (${order.discountCode})` : ""}</dt>
                    <dd>−{formatLD(order.discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between text-base font-extrabold">
                  <dt>Total</dt>
                  <dd>{formatLD(order.total)}</dd>
                </div>
                <p className="mt-1 text-[13px] text-soft">
                  {PAYMENT_METHOD_LABEL[order.paymentMethod]} ·{" "}
                  {order.paymentStatus === "refunded" ? "Refunded" : order.paymentStatus === "paid" ? "Paid" : order.status === "cancelled" ? "Nothing to pay" : "Pay when it arrives"}
                </p>
              </dl>
            </section>

            {order.dispute && <DisputeCard dispute={order.dispute} audience="buyer" />}
            {order.status === "delivered" && <RateItems order={order} />}

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-card border border-line bg-white p-4 text-sm">
                <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-muted">Delivering to</p>
                <p className="font-bold">{order.delivery.name}</p>
                <p>{order.delivery.address}</p>
                <p>
                  {order.delivery.area ? `${order.delivery.area}, ` : ""}
                  {order.delivery.city}
                </p>
                <p className="text-muted">{formatLiberianPhone(order.delivery.phone)}</p>
              </div>
              <div className="rounded-card border border-line bg-white p-4 text-sm">
                <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">What happened</p>
                <ol className="flex flex-col gap-1.5">
                  {order.events.map((e, i) => (
                    <li key={i}>
                      <span className="font-semibold">{EVENT_LABEL[e.status] ?? e.status}</span>
                      <span className="block text-xs text-muted">
                        {new Date(e.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </section>

            {order.status === "delivered" && !order.dispute && <ReportProblem order={order} onReported={setOrder} />}

            {order.status === "placed" && (
              <div>
                <Button variant="ghost" className="!px-0 text-danger hover:!text-danger" busy={busy} onClick={cancel}>
                  Cancel this order
                </Button>
                <p className="text-[12.5px] text-muted">You can cancel until the shop accepts it.</p>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
