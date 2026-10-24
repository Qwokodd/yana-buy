"use client";

import { Fragment, useEffect, useRef } from "react";
import type { Banner, ProductCard } from "@yanabuy/shared";
import { BannerStrip } from "@yanabuy/web-kit";
import { BannerLink } from "@/components/BannerLink";
import { GridSkeleton, ProductGrid } from "@/components/ProductCard";

interface Props {
  products: ProductCard[];
  /** Shown one at a time between rows of products, taking turns. */
  ads?: Banner[];
  /** Products between two ads. */
  every?: number;
  done: boolean;
  loading: boolean;
  error: string | null;
  onMore: () => void;
}

/** Products that keep coming as you scroll, with ads in between. No "Show more" button. */
export function ProductFeed({ products, ads = [], every = 12, done, loading, error, onMore }: Props) {
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || error) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onMore(), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
    // Re-observe after each page so a short page that still leaves the bottom in view loads the next one.
  }, [products.length, done, error, onMore]);

  const chunks: ProductCard[][] = [];
  for (let i = 0; i < products.length; i += every) chunks.push(products.slice(i, i + every));

  return (
    <div className="flex flex-col gap-5">
      {chunks.map((chunk, i) => {
        const ad = ads.length && chunk.length === every && (i < chunks.length - 1 || !done) ? ads[i % ads.length] : null;
        return (
          <Fragment key={i}>
            <ProductGrid products={chunk} />
            {ad && (
              <BannerLink banner={ad}>
                <BannerStrip banner={ad} className="min-h-[170px] sm:min-h-[200px]" />
              </BannerLink>
            )}
          </Fragment>
        );
      })}
      {loading && <GridSkeleton />}
      {error && (
        <div className="flex flex-col items-center gap-2 py-4 text-sm">
          <p className="text-muted">Couldn&rsquo;t load more products.</p>
          <button onClick={onMore} className="font-bold text-purple hover:underline">
            Try again
          </button>
        </div>
      )}
      {done && products.length > every && <p className="py-4 text-center text-sm text-muted">You&rsquo;ve seen everything here.</p>}
      <div ref={sentinel} aria-hidden="true" />
    </div>
  );
}
