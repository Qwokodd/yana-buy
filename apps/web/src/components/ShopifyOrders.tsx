"use client";

import { useEffect, useState } from "react";
import { formatLD, type ShopifyOrder } from "@yanabuy/shared";
import { api } from "@/lib/api";

const STATUS: Record<string, string> = { fulfilled: "Delivered", unfulfilled: "Not delivered", partial: "Partly delivered" };

/** Orders from the old YanaBuy store on Shopify, matched by phone number. Read only. */
export function ShopifyOrders() {
  const [items, setItems] = useState<ShopifyOrder[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    api.me
      .shopifyOrders()
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);
  if (!items?.length) return null;
  return (
    <section className="mt-4 flex flex-col gap-3" aria-label="Orders from the old YanaBuy store">
      <div>
        <h2 className="font-display text-xl font-extrabold">From the old YanaBuy store</h2>
        <p className="text-sm text-muted">Orders you placed before the new app, for your records.</p>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((o) => (
          <li key={o.id} className="rounded-card border border-line bg-white">
            <button onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id} className="flex w-full items-center gap-4 p-4 text-left">
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {o.vendors ?? "YanaBuy"} <span className="font-semibold text-muted">· {o.name}</span>
                </p>
                <p className="text-sm text-soft">
                  {o.items.reduce((n, i) => n + i.quantity, 0)} items · {formatLD(o.total)} · {new Date(o.placedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <span className="rounded-full bg-ground px-3 py-1 text-[12px] font-bold text-soft">{o.cancelledAt ? "Cancelled" : (STATUS[o.fulfillmentStatus ?? ""] ?? o.fulfillmentStatus ?? "")}</span>
            </button>
            {open === o.id && (
              <ul className="flex flex-col gap-1 border-t border-line px-4 py-3 text-sm">
                {o.items.map((i, n) => (
                  <li key={n} className="flex justify-between gap-3">
                    <span>
                      {i.quantity} × {i.name}
                    </span>
                    <span>{formatLD(i.price * i.quantity)}</span>
                  </li>
                ))}
                <li className="mt-1 flex justify-between border-t border-line pt-1 font-bold">
                  <span>Total (with delivery {formatLD(o.shipping)})</span>
                  <span>{formatLD(o.total)}</span>
                </li>
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
