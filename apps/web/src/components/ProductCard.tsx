"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUY_WORDS, formatLD, type ProductCard as Card } from "@yanabuy/shared";
import { useCart } from "@/lib/cart";
import { RatingLine } from "./Reviews";
import { Countdown } from "./Countdown";
import { HeartButton } from "./Heart";

/** How much cheaper than the old price, e.g. "-25%". */
export function discount(price: number, compareAt: number | null) {
  if (!compareAt || compareAt <= price) return null;
  return Math.round((1 - price / compareAt) * 100);
}

export function ProductCard({ product: p }: { product: Card }) {
  const off = discount(p.price, p.compareAtPrice);
  return (
    <Link href={`/p/${p.id}`} className="group flex flex-col overflow-hidden rounded-card border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(46,20,64,0.08)]">
      <div className="relative aspect-square bg-ground">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">No photo</div>
        )}
        {off && <span className="absolute left-2.5 top-2.5 rounded-full bg-price px-2 py-0.5 text-[11.5px] font-extrabold text-white">-{off}%</span>}
        {p.shipsFromChina && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-ink shadow-sm">
            🇨🇳 {p.deliveryDays ? `~${p.deliveryDays} days` : "From China"}
          </span>
        )}
        <span className="absolute bottom-2.5 right-2.5 z-[1]">
          <HeartButton productId={p.id} name={p.name} />
        </span>
        {p.saleEndsAt && p.inStock && <Countdown ends={p.saleEndsAt} className="absolute bottom-2.5 left-2.5 z-[1] text-[11px]" />}
        {!p.inStock && (
          <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-1.5 text-center text-[12px] font-bold text-white">Sold out</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink group-hover:text-purple">{p.name}</p>
        <RatingLine rating={p.rating} count={p.ratingCount} className="text-[12px]" />
        <p className="mt-auto flex items-baseline gap-1.5 pt-1">
          <span className="font-display text-[17px] font-extrabold text-price">
            {p.hasOptions && <span className="mr-1 text-[12px] font-semibold text-muted">from</span>}
            {formatLD(p.price)}
          </span>
          {p.compareAtPrice && off && <span className="text-[12px] text-muted line-through">{formatLD(p.compareAtPrice)}</span>}
        </p>
        <p className="flex items-end justify-between gap-2">
          <span className="min-w-0 truncate text-[12px] text-muted">
            {p.shop.name} · {p.shop.city}
          </span>
          {p.inStock && <AddButton product={p} />}
        </p>
      </div>
    </Link>
  );
}

/**
 * Round "+" on a card: Add to cart (goods) or Add to order (food). Products with choices
 * (colour, size…) open the product page instead, so the buyer can pick one.
 */
function AddButton({ product: p }: { product: Card }) {
  const cart = useCart();
  const router = useRouter();
  const [done, setDone] = useState(false);
  const words = BUY_WORDS[p.kind];
  return (
    <button
      type="button"
      aria-label={p.hasOptions ? `Choose options for ${p.name}` : `${words.add}: ${p.name}`}
      title={p.hasOptions ? "Choose options" : done ? words.added : words.add}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (p.hasOptions) return router.push(`/p/${p.id}`);
        cart.add(p.id, 1, null);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink shadow-sm transition hover:scale-105 ${p.kind === "food" ? "bg-orange" : "bg-amber"}`}
    >
      {done ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : p.kind === "food" ? (
        // A plate with a plus: add to order
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="13" r="7.5" stroke="currentColor" strokeWidth="2" />
          <path d="M12 10v6M9 13h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 3.5h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : (
        // A cart with a plus: add to cart
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 4h2l1.6 9.6a2 2 0 0 0 2 1.7h7.6a2 2 0 0 0 2-1.6L20 8H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9.5" cy="20" r="1.4" fill="currentColor" />
          <circle cx="16.5" cy="20" r="1.4" fill="currentColor" />
          <path d="M14 3v6M11 6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

export function ProductGrid({ products }: { products: Card[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-card border border-line bg-white">
          <div className="aspect-square animate-pulse bg-ground" />
          <div className="flex flex-col gap-2 p-3.5">
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-ground" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-ground" />
          </div>
        </div>
      ))}
    </div>
  );
}
