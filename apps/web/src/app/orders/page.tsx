"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatLD, type OrderSummary } from "@yanabuy/shared";
import { Alert, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { OrderStatusBadge } from "@/components/OrderBits";
import { ShopifyOrders } from "@/components/ShopifyOrders";
import { api } from "@/lib/api";

export default function OrdersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/orders");
  }, [loading, user, router]);

  useEffect(() => {
    setPlaced(Number(new URLSearchParams(window.location.search).get("placed")) || 0);
    if (!user) return;
    api.orders
      .list()
      .then((res) => setItems(res.items))
      .catch((err) => setError(messageOf(err)));
  }, [user]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-8">
        <h1 className="font-display text-[28px] font-extrabold">Your orders</h1>
        {placed > 1 && <Alert tone="success">Thank you! Your {placed} orders are placed — each shop will confirm its part.</Alert>}
        {error && <Alert>{error}</Alert>}
        {items === null && !error && <p className="text-muted">Loading…</p>}
        {items && items.length === 0 && (
          <div className="rounded-card border border-line bg-white px-6 py-12 text-center">
            <p className="font-display text-lg font-extrabold">No orders yet</p>
            <Link href="/" className="mt-3 inline-block font-bold text-purple hover:underline">
              Start shopping
            </Link>
          </div>
        )}
        <ul className="flex flex-col gap-3">
          {items?.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="flex items-center gap-4 rounded-card border border-line bg-white p-4 hover:border-purple">
                {o.firstImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.firstImage} alt="" className="h-16 w-16 rounded-xl border border-line object-cover" />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-ground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {o.shop.name} <span className="font-semibold text-muted">· {o.number}</span>
                  </p>
                  <p className="text-sm text-soft">
                    {o.itemCount} {o.itemCount === 1 ? "item" : "items"} · {formatLD(o.total)} ·{" "}
                    {new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <OrderStatusBadge status={o.status} />
              </Link>
            </li>
          ))}
        </ul>
        {user && <ShopifyOrders />}
      </main>
    </>
  );
}
