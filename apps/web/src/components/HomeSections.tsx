"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { Banner, Category, ProductCard as Card } from "@yanabuy/shared";
import { BannerMedia } from "@yanabuy/web-kit";
import { api } from "@/lib/api";
import { useMode } from "@/lib/mode";
import { BannerLink } from "./BannerLink";
import { Countdown } from "./Countdown";
import { ProductCard } from "./ProductCard";

/** A titled row of cards that scrolls sideways, like "Shops to explore". */
export function CardRow({ title, more, children, label }: { title: string; more?: { href: string; text: string }; children: ReactNode; label?: string }) {
  return (
    <section className="flex flex-col gap-4" aria-label={label ?? title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[26px] font-extrabold">{title}</h2>
        {more && (
          <Link href={more.href} className="text-sm font-bold text-purple hover:underline">
            {more.text} →
          </Link>
        )}
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-1 sm:-mx-8 sm:px-8">{children}</div>
    </section>
  );
}

/** Categories (goods) or Menus (food) as picture cards. */
export function CategoryCards({ categories, mode }: { categories: Category[]; mode: "goods" | "food" }) {
  if (!categories.length) return null;
  const food = mode === "food";
  return (
    <CardRow title={food ? "Menus" : "Categories"} more={{ href: `/search?mode=${mode}`, text: food ? "All dishes" : "Everything" }}>
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/search?category=${c.slug}&mode=${mode}`}
          className="group flex w-[170px] flex-shrink-0 snap-start flex-col overflow-hidden rounded-card border border-line bg-white hover:border-purple"
        >
          <div className={`flex h-[110px] items-center justify-center ${food ? "bg-orange/15" : "bg-amber/20"}`}>
            {c.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.iconUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="font-display text-4xl font-extrabold text-purple/70" aria-hidden>
                {c.name[0]}
              </span>
            )}
          </div>
          <span className="truncate px-3.5 py-3 font-bold group-hover:text-purple">{c.name}</span>
        </Link>
      ))}
    </CardRow>
  );
}

function useProducts(query: Parameters<typeof api.public.products>[0]) {
  const { foodHow } = useMode();
  const [items, setItems] = useState<Card[] | null>(null);
  const key = JSON.stringify(query);
  useEffect(() => {
    setItems(null);
    api.public
      .products(JSON.parse(key))
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [key, foodHow]);
  return items;
}

/** Items YanaBuy picked to feature. */
export function FeaturedRow({ mode }: { mode: "goods" | "food" }) {
  const items = useProducts({ mode, featured: true });
  if (!items?.length) return null;
  return (
    <CardRow title={mode === "food" ? "Featured dishes" : "Featured"} more={{ href: `/search?mode=${mode}`, text: "See more" }}>
      {items.slice(0, 12).map((p) => (
        <div key={p.id} className="w-[200px] flex-shrink-0 snap-start">
          <ProductCard product={p} />
        </div>
      ))}
    </CardRow>
  );
}

/** Promos with countdowns: the admin's promo cards, then shops' / restaurants' flash sales (soonest to end first). */
export function PromosRow({ mode }: { mode: "goods" | "food" }) {
  const [promos, setPromos] = useState<Banner[] | null>(null);
  const flash = useProducts({ mode, flash: true });
  useEffect(() => {
    api.public
      .banners({ platform: "web", mode, placement: "promo" })
      .then((r) => setPromos(r.items))
      .catch(() => setPromos([]));
  }, [mode]);
  if (!promos?.length && !flash?.length) return null;
  return (
    <CardRow title={mode === "food" ? "Food promos" : "Promos"} label="Promos with countdowns">
      {(promos ?? []).map((b) => (
        <BannerLink key={b.id} banner={b} className="w-[300px] flex-shrink-0 snap-start">
          <div className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-white hover:border-purple">
            <div className="relative h-[150px] bg-ink">
              <BannerMedia banner={b} />
              <Countdown ends={b.endsAt} className="absolute left-3 top-3" />
              {b.kind === "ad" && (
                <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10.5px] font-extrabold uppercase text-ink">Ad</span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-4">
              <span className="font-bold group-hover:text-purple">{b.title}</span>
              {b.subtitle && <span className="line-clamp-2 text-[13px] text-muted">{b.subtitle}</span>}
              {b.buttonLabel && <span className="mt-auto pt-1 text-[13px] font-bold text-purple">{b.buttonLabel} →</span>}
            </div>
          </div>
        </BannerLink>
      ))}
      {(flash ?? []).map((p) => (
        <div key={p.id} className="w-[200px] flex-shrink-0 snap-start">
          <ProductCard product={p} />
        </div>
      ))}
    </CardRow>
  );
}
