"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatLD, type Quote } from "@yanabuy/shared";
import { Alert, Button, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { useCart } from "@/lib/cart";
import { api } from "@/lib/api";

export default function CartPage() {
  const cart = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(cart.items);

  // Ask the server for today's prices whenever the cart changes.
  useEffect(() => {
    if (!cart.items.length) {
      setQuote(null);
      return;
    }
    let live = true;
    api.orders
      .quote(cart.items)
      .then((res) => live && (setQuote(res.quote), setError(null)))
      .catch((err) => live && setError(messageOf(err)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const empty = cart.items.length === 0;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-5 px-4 py-8 sm:px-8">
        <h1 className="font-display text-[28px] font-extrabold">Your cart</h1>
        {error && <Alert>{error}</Alert>}

        {empty ? (
          <div className="rounded-card border border-line bg-white px-6 py-14 text-center">
            <p className="font-display text-lg font-extrabold">Your cart is empty</p>
            <p className="mt-1 text-sm text-muted">Find something you like and press “Add to cart”.</p>
            <Link href="/" className="mt-5 inline-flex h-11 items-center rounded-full bg-purple px-6 text-sm font-bold text-white hover:bg-ink">
              Start shopping
            </Link>
          </div>
        ) : !quote ? (
          <p className="text-muted">Checking prices…</p>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-4">
              {quote.shops.map((s) => (
                <section key={s.shop.id} className="rounded-card border border-line bg-white" aria-label={s.shop.name}>
                  <header className="flex items-center justify-between border-b border-line px-5 py-3">
                    <Link href={`/shop/${s.shop.slug}`} className="font-bold hover:text-purple">
                      {s.shop.name}
                    </Link>
                    <span className="text-[12.5px] text-muted">{s.shop.city} · delivery {s.deliveryFee ? formatLD(s.deliveryFee) : "free"}</span>
                  </header>
                  <ul>
                    {quote.lines
                      .filter((l) => l.product?.shop.id === s.shop.id && !l.problem)
                      .map((l) => (
                        <Line key={`${l.productId}:${l.variantId ?? ""}`} line={l} />
                      ))}
                  </ul>
                </section>
              ))}
              {quote.lines.some((l) => l.problem) && (
                <section className="rounded-card border border-danger/40 bg-white" aria-label="Needs your attention">
                  <header className="border-b border-line px-5 py-3 font-bold text-danger">Needs your attention</header>
                  <ul>
                    {quote.lines
                      .filter((l) => l.problem)
                      .map((l) => (
                        <Line key={`${l.productId}:${l.variantId ?? ""}`} line={l} />
                      ))}
                  </ul>
                </section>
              )}
            </div>

            <aside className="flex flex-col gap-3 rounded-card border border-line bg-white p-5 lg:sticky lg:top-4">
              <h2 className="font-display text-lg font-extrabold">Summary</h2>
              <dl className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Items</dt>
                  <dd>{formatLD(quote.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Delivery{quote.shops.length > 1 ? ` (${quote.shops.length} shops)` : ""}</dt>
                  <dd>{quote.deliveryFees ? formatLD(quote.deliveryFees) : "Free"}</dd>
                </div>
                <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-extrabold">
                  <dt>Total</dt>
                  <dd>{formatLD(quote.total)}</dd>
                </div>
              </dl>
              {!quote.ok && <p className="text-[12.5px] font-semibold text-danger">Fix the items marked above to continue.</p>}
              <Button size="lg" disabled={!quote.ok} onClick={() => router.push(user ? "/checkout" : "/login?next=/checkout")}>
                {user ? "Checkout" : "Log in to checkout"}
              </Button>
              <p className="text-center text-[12px] text-muted">Pay cash when your order arrives.</p>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}

function Line({ line: l }: { line: Quote["lines"][number] }) {
  const cart = useCart();
  const max = Math.min(99, l.available ?? 99);
  return (
    <li className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-4 first:border-t-0">
      {l.product?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={l.product.image} alt="" className="h-16 w-16 rounded-xl border border-line object-cover" />
      ) : (
        <div className="h-16 w-16 rounded-xl bg-ground" />
      )}
      <div className="min-w-0 flex-1">
        {l.product ? (
          <Link href={`/p/${l.productId}`} className="font-semibold hover:text-purple">
            {l.product.name}
          </Link>
        ) : (
          <span className="font-semibold text-muted">An item that's gone</span>
        )}
        {l.variantLabel && <p className="text-[13px] font-semibold text-soft">{l.variantLabel}</p>}
        {l.product && <p className="text-sm text-soft">{formatLD(l.unitPrice || l.product.price)} each</p>}
        {l.problem && <p className="text-[13px] font-bold text-danger">{l.problem}</p>}
      </div>
      {l.product && l.available !== 0 && (
        <div className="flex items-center rounded-full border border-line-strong" aria-label={`Quantity of ${l.product.name}`}>
          <button onClick={() => cart.setQuantity(l.productId, l.quantity - 1, l.variantId)} aria-label="Fewer" className="h-9 w-9 font-bold text-purple">
            −
          </button>
          <span className="w-8 text-center text-sm font-bold">{l.quantity}</span>
          <button onClick={() => cart.setQuantity(l.productId, l.quantity + 1, l.variantId)} aria-label="More" className="h-9 w-9 font-bold text-purple disabled:opacity-30" disabled={l.quantity >= max}>
            +
          </button>
        </div>
      )}
      {l.problem?.startsWith("Only") && (
        <button onClick={() => cart.setQuantity(l.productId, l.available ?? 1, l.variantId)} className="text-[13px] font-bold text-purple hover:underline">
          Take {l.available}
        </button>
      )}
      <span className="w-24 text-right font-bold">{l.product && !l.problem ? formatLD(l.lineTotal) : ""}</span>
      <button onClick={() => cart.remove(l.productId, l.variantId)} className="text-[13px] font-bold text-danger hover:underline">
        Remove
      </button>
    </li>
  );
}
