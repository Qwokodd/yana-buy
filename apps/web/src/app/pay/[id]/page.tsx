"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatLD, formatLiberianPhone, PAYMENT_METHOD_LABEL, type Payment } from "@yanabuy/shared";
import { Alert, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { useCart } from "@/lib/cart";
import { api } from "@/lib/api";

/** Waits for the buyer to approve the mobile money prompt on their phone. */
export default function PayPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const cart = useCart();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=/pay/${id}`);
  }, [loading, user, router, id]);

  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const check = async () => {
      try {
        const { payment: p } = await api.orders.payment(id);
        if (stopped) return;
        setPayment(p);
        setError(null);
        if (p.status === "successful" && !done.current) {
          done.current = true;
          if (p.sourcingId) return router.replace(`/china/${p.sourcingId}`);
          cart.clear();
          router.replace(p.orderIds.length === 1 ? `/orders/${p.orderIds[0]}?placed=1` : `/orders?placed=${p.orderIds.length}`);
          return;
        }
        if (p.status !== "pending") return;
      } catch (err) {
        if (!stopped) setError(messageOf(err));
      }
      timer = setTimeout(check, 3000);
    };
    check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  const failed = payment && (payment.status === "failed" || payment.status === "expired");

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-14 text-center">
        {!payment ? (
          error ? <Alert>{error}</Alert> : <p className="text-muted">Loading…</p>
        ) : failed ? (
          <>
            <div className="grid h-16 w-16 place-items-center rounded-full bg-danger-tint text-3xl font-extrabold text-danger" aria-hidden>
              !
            </div>
            <h1 className="font-display text-2xl font-extrabold">{payment.status === "expired" ? "The payment timed out" : "The payment didn't go through"}</h1>
            <p className="text-soft">
              {payment.status === "expired" ? "It wasn't approved within 10 minutes, so no money was taken." : "It was declined or cancelled, so no money was taken."}{" "}
              {payment.sourcingId ? "Your China request is still open, so you can try again." : "Your order was cancelled — the items are still in your cart, so you can try again."}
            </p>
            <Link href={payment.sourcingId ? `/china/${payment.sourcingId}` : "/checkout"} className="inline-flex h-12 items-center rounded-full bg-purple px-8 font-bold text-white hover:bg-ink">
              Try again
            </Link>
            {!payment.sourcingId && (
              <Link href="/cart" className="text-sm font-bold text-purple hover:underline">
                Back to cart
              </Link>
            )}
          </>
        ) : (
          <>
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-purple-tint border-t-purple" role="status" aria-label="Waiting for payment" />
            <h1 className="font-display text-2xl font-extrabold">Check your phone</h1>
            <p className="text-soft">
              We sent a payment request for <strong className="text-ink">{formatLD(payment.amount)}</strong> to{" "}
              <strong className="text-ink">{formatLiberianPhone(payment.payerPhone)}</strong> on {PAYMENT_METHOD_LABEL[payment.method]}. Enter your PIN to approve it.
            </p>
            <p className="text-[13px] text-muted">No prompt? Open your MoMo menu and check for approvals waiting. This page updates by itself.</p>
            {error && <Alert tone="warn">{error}</Alert>}
          </>
        )}
      </main>
    </>
  );
}
