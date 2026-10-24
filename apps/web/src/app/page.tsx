"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isBrowsing, setBrowsing, workspaceFor, workspaceTitle } from "@/lib/workspace";
import type { Banner, Category, PublicShop } from "@yanabuy/shared";
import { BannerStrip, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { BannerLink } from "@/components/BannerLink";
import { HeroCarousel } from "@/components/HeroCarousel";
import { GridSkeleton } from "@/components/ProductCard";
import { ProductFeed } from "@/components/ProductFeed";
import { useProductFeed } from "@/lib/feed";
import { ShopCard } from "@/components/ShopTile";
import { useMode } from "@/lib/mode";
import { CategoryCards, FeaturedRow, PromosRow } from "@/components/HomeSections";
import { FOOD_HOW } from "@/components/FoodHowPicker";
import { useCountry } from "@/lib/country";
import { api } from "@/lib/api";

export default function HomePage() {
  const { mode, foodHow, askFoodHow } = useMode();
  const { user } = useAuth();
  const router = useRouter();
  // Sellers and riders start on their own page, unless they chose "Browse like a buyer".
  const workspace = workspaceFor(user);
  useEffect(() => {
    if (workspace && !isBrowsing()) router.replace(workspace);
  }, [workspace, router]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [shops, setShops] = useState<PublicShop[]>([]);

  useEffect(() => {
    api.public
      .categories()
      .then((res) => setCategories(res.items))
      .catch(() => {});
  }, []);

  const feed = useProductFeed({ mode, sort: "best" });
  const products = feed.items;

  useEffect(() => {
    api.public
      .shops({ mode, sort: "popular", limit: 8 })
      .then((res) => setShops(res.items))
      .catch(() => setShops([]));
  }, [mode]);

  useEffect(() => {
    setBanners(null);
    api.public
      .banners({ platform: "web", mode })
      .then((res) => setBanners(res.items))
      .catch(() => setBanners([]));
  }, [mode]);

  const cats = categories.filter((c) => c.kind === mode);
  const heroes = (banners ?? []).filter((b) => b.placement === "hero");
  const strips = (banners ?? []).filter((b) => b.placement === "strip");
  // Ads between rows of products: the strip banners, or the top ones if there are none.
  const feedAds = strips.length ? strips : heroes;
  const accentBorder = mode === "goods" ? "border-amber" : "border-orange";

  // On the way to My shop / My restaurant / My deliveries: don't flash the buyer feed first.
  if (workspace && !isBrowsing()) return <SiteHeader />;

  return (
    <>
      <SiteHeader />
      {workspace && (
        <div className="bg-amber-tint">
          <div className="mx-auto flex max-w-[1312px] flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm sm:px-8">
            <span className="text-soft">You&rsquo;re browsing like a buyer.</span>
            <button
              type="button"
              onClick={() => {
                setBrowsing(false);
                router.push(workspace);
              }}
              className="font-bold text-purple hover:underline"
            >
              ← Back to {workspaceTitle(user)}
            </button>
          </div>
        </div>
      )}
      <nav aria-label="Categories" className="border-b border-line bg-white">
        <div className="no-scrollbar mx-auto flex h-[54px] max-w-[1312px] items-center gap-7 overflow-x-auto px-4 sm:px-8">
          <span className={`flex h-full flex-shrink-0 items-center border-b-[3px] ${accentBorder} text-sm font-bold text-purple`}>All</span>
          {cats.map((c) => (
            <Link
              key={c.id}
              href={`/search?category=${c.slug}&mode=${mode}`}
              className="flex h-full flex-shrink-0 items-center gap-2 border-b-[3px] border-transparent text-sm font-semibold text-soft hover:text-ink"
            >
              {c.iconUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.iconUrl} alt="" className="h-6 w-6 rounded-md object-cover" />
              )}
              {c.name}
            </Link>
          ))}
          {mode === "goods" && (
            <Link href="/china" className="flex h-full flex-shrink-0 items-center text-sm font-bold text-purple hover:underline">
              🇨🇳 Buy from China
            </Link>
          )}
        </div>
      </nav>

      <main className="mx-auto flex max-w-[1312px] flex-col gap-7 px-4 py-7 sm:px-8">
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          {banners === null ? (
            <div className="min-h-[250px] animate-pulse rounded-sheet bg-ink/10" aria-hidden="true" />
          ) : heroes.length ? (
            <HeroCarousel banners={heroes} />
          ) : (
            <WelcomeHero mode={mode} />
          )}
          {mode === "food" ? (
            <button
              type="button"
              onClick={askFoodHow}
              className="relative flex min-h-[180px] flex-col justify-end gap-2 overflow-hidden rounded-sheet bg-orange p-7 text-left hover:brightness-95"
            >
              <div className="absolute -right-10 -top-10 h-[180px] w-[180px] rounded-full bg-amber" />
              <span className="relative text-4xl" aria-hidden>
                {FOOD_HOW.find((o) => o.value === foodHow)?.icon}
              </span>
              <span className="relative font-display text-[28px] font-extrabold leading-[1.05] text-ink">{FOOD_HOW.find((o) => o.value === foodHow)?.title}</span>
              <span className="relative text-sm font-semibold text-ink/80">{FOOD_HOW.find((o) => o.value === foodHow)?.text}</span>
              <span className="relative self-start rounded-full bg-ink px-[18px] py-2.5 text-[13.5px] font-bold text-white">Change</span>
            </button>
          ) : (
            <Link href="/china" className="relative flex min-h-[180px] flex-col justify-end gap-2 overflow-hidden rounded-sheet bg-orange p-7 hover:brightness-95">
              <div className="absolute -right-10 -top-10 h-[180px] w-[180px] rounded-full bg-amber" />
              <p className="relative font-display text-[28px] font-extrabold leading-[1.05] text-ink">
                Can&rsquo;t find it? We&rsquo;ll ship it from China.
              </p>
              <span className="relative self-start rounded-full bg-ink px-[18px] py-2.5 text-[13.5px] font-bold text-white">Get a price</span>
            </Link>
          )}
        </div>

        <CategoryCards categories={cats} mode={mode} />
        {mode === "goods" && <FeaturedRow mode={mode} />}
        <PromosRow mode={mode} />

        {mode === "goods" && (
          <Link href="/china" className="flex flex-wrap items-center gap-4 rounded-card bg-ink px-6 py-5 text-white hover:brightness-110">
            <span className="text-3xl" aria-hidden>
              🇨🇳
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-xl font-extrabold">Want something from China?</span>
              <span className="text-sm text-white/80">Send us a link or photo — we quote one price, ship it and deliver it to your door.</span>
            </span>
            <span className="rounded-full bg-amber px-5 py-2.5 text-sm font-bold text-ink">Get a price</span>
          </Link>
        )}
        {shops.length > 0 && (
          <section className="flex flex-col gap-4" aria-label={mode === "food" ? "Restaurants" : "Shops"}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[26px] font-extrabold">{mode === "food" ? "Restaurants near you" : "Shops to explore"}</h2>
              <Link href={`/shops?mode=${mode}`} className="text-sm font-bold text-purple hover:underline">
                All {mode === "food" ? "restaurants" : "shops"} →
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {shops.map((s) => (
                <ShopCard key={s.id} shop={s} />
              ))}
            </div>
          </section>
        )}

        {user?.role !== "rider" && user?.role !== "vendor" && user?.role !== "admin" && (
          <section aria-label="Work with YanaBuy" className="grid gap-4 sm:grid-cols-2">
            <Link href="/sell" className="flex items-center gap-4 rounded-card border border-line bg-white p-5 hover:border-purple">
              <span className="text-3xl" aria-hidden>
                🏪
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg font-extrabold">Sell on YanaBuy</span>
                <span className="text-sm text-muted">Open a shop or restaurant — it&rsquo;s free.</span>
              </span>
              <span className="font-bold text-purple">→</span>
            </Link>
            <Link href="/ride" className="flex items-center gap-4 rounded-card border border-line bg-white p-5 hover:border-purple">
              <span className="text-3xl" aria-hidden>
                🏍️
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg font-extrabold">Deliver with YanaBuy</span>
                <span className="text-sm text-muted">Become a rider and earn delivering orders.</span>
              </span>
              <span className="font-bold text-purple">→</span>
            </Link>
          </section>
        )}

        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[26px] font-extrabold">{mode === "goods" ? "Best deals" : "Popular right now"}</h2>
            {!!products?.length && (
              <Link href={`/search?mode=${mode}`} className="text-sm font-bold text-purple hover:underline">
                See everything →
              </Link>
            )}
          </div>
          {products === null ? (
            <GridSkeleton />
          ) : products.length ? (
            <ProductFeed products={products} ads={feedAds} done={feed.done} loading={feed.loading} error={feed.error} onMore={feed.loadNext} />
          ) : (
            <div className="rounded-card border border-line bg-white px-6 py-12 text-center">
              <p className="font-display text-lg font-extrabold">Shops are getting ready</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                Products show up here as soon as shops start listing them.
                {user ? " Want to be one of the first?" : " Create your account now so you're ready to buy — or to sell."}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                {!user && (
                  <Link href="/register" className="inline-flex h-11 items-center rounded-full bg-purple px-6 text-sm font-bold text-white hover:bg-ink">
                    Create an account
                  </Link>
                )}
                <Link href="/sell" className="inline-flex h-11 items-center rounded-full border border-line-strong px-6 text-sm font-bold text-purple hover:border-purple">
                  {mode === "goods" ? "Open a shop" : "Open a restaurant"}
                </Link>
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

/** Shown until an admin adds top banners. */
function WelcomeHero({ mode }: { mode: "goods" | "food" }) {
  const { country } = useCountry();
  return (
    <div className="relative flex min-h-[250px] items-center overflow-hidden rounded-sheet bg-ink px-8 sm:px-12">
      <div className={`absolute -right-16 -top-24 h-[340px] w-[340px] rounded-full ${mode === "goods" ? "bg-amber" : "bg-orange"}`} />
      <div className="absolute -bottom-32 right-44 h-[220px] w-[220px] rounded-full bg-purple-light" />
      <div className="relative flex max-w-[440px] flex-col gap-2.5 py-10">
        <span className="text-xs font-bold uppercase tracking-[1.2px] text-amber">Welcome to the new YanaBuy</span>
        <h1 className="font-display text-[34px] font-extrabold leading-[1.04] text-white sm:text-[40px]">
          {mode === "goods" ? (country === "US" ? "Liberian shops across the USA, in one place" : "Shop Liberian shops in one place") : "Order from local kitchens"}
        </h1>
        <p className="text-[15px] text-white/80">
          {mode === "goods"
            ? "Phones, fashion, home essentials and services — delivered to your door."
            : "Jollof, fufu, fast food and drinks from restaurants near you."}
        </p>
      </div>
    </div>
  );
}
