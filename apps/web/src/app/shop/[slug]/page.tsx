"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { countryName, formatLiberianPhone, SHOP_KIND_LABEL, type ProductCard, type PublicShop } from "@yanabuy/shared";
import { messageOf } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { GridSkeleton, ProductGrid } from "@/components/ProductCard";
import { ShopLogo } from "@/components/ShopTile";
import { api } from "@/lib/api";
import { useMode } from "@/lib/mode";
import { RatingLine, ReviewsSection } from "@/components/Reviews";
import { MessageShopButton } from "@/components/MessageShop";
import { CountryNotice } from "@/components/CountryNotice";
import { AboutWork, PortfolioSection, ServicesMenu, VideosSection } from "@/components/WorkProfile";

export default function ShopPage() {
  const { slug } = useParams<{ slug: string }>();
  const { foodHow } = useMode();
  const [shop, setShop] = useState<PublicShop | null>(null);
  const [products, setProducts] = useState<ProductCard[] | null>(null);
  const [services, setServices] = useState<ProductCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const loadReviews = useCallback((page: number) => api.public.shopReviews(slug, page), [slug]);

  useEffect(() => {
    api.public
      .shop(slug)
      .then((res) => {
        setShop(res.shop);
        document.title = res.shop.name;
      })
      .catch((err) => setError(messageOf(err)));
    api.public
      .products({ shop: slug, sort: "best" })
      .then((res) => setProducts(res.items))
      .catch(() => setProducts([]));
    api.public
      .products({ shop: slug, bookable: true })
      .then((res) => setServices(res.items))
      .catch(() => setServices([]));
  }, [slug, foodHow]);
  const work = shop?.workProfile ?? null;

  if (error) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="font-display text-2xl font-extrabold">{error}</p>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <div className="relative h-[180px] overflow-hidden bg-ink sm:h-[240px]">
        {shop?.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shop.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className={`absolute -right-20 -top-24 h-[360px] w-[360px] rounded-full ${shop?.kind === "restaurant" ? "bg-orange" : "bg-amber"}`} />
        )}
      </div>
      <main className="mx-auto flex max-w-[1312px] flex-col gap-6 px-4 pb-10 sm:px-8">
        <div className="-mt-12 flex flex-wrap items-end gap-4">
          <div className="relative rounded-[22px] bg-white p-1.5 shadow-sm">
            {shop ? <ShopLogo name={shop.name} url={shop.logoUrl} size={96} /> : <div className="h-24 w-24 rounded-2xl bg-ground" />}
          </div>
          <div className="min-w-0 flex-1 pb-1 pt-12">
            <h1 className="font-display text-[28px] font-extrabold leading-tight">{shop?.name ?? "…"}</h1>
            {work?.tagline && <p className="text-[15px] font-semibold text-soft">{work.tagline}</p>}
            {shop && (
              <p className="text-sm text-muted">
                {shop.category ? (
                  <Link href={`/shops?mode=${shop.kind === "restaurant" ? "food" : "goods"}&category=${shop.category.slug}`} className="font-semibold text-soft hover:text-purple">
                    {shop.category.name}
                  </Link>
                ) : (
                  SHOP_KIND_LABEL[shop.kind]
                )}{" "}
                · {shop.productCount} {shop.kind === "restaurant" ? (shop.productCount === 1 ? "dish" : "dishes") : shop.productCount === 1 ? "item" : "items"}
              </p>
            )}
            {shop && shop.ratingCount > 0 ? (
              <a href="#reviews" className="text-sm hover:underline">
                <RatingLine rating={shop.rating} count={shop.ratingCount} />
              </a>
            ) : shop ? (
              <p className="text-sm text-muted">
                <span className="text-amber">★</span> New — no reviews yet
              </p>
            ) : null}
          </div>
          {shop?.booking && (
            <Link href={`/shop/${shop.slug}/book`} className="mb-1 inline-flex h-11 items-center rounded-full bg-amber px-5 text-sm font-bold text-ink hover:brightness-95">
              {shop.booking.kind === "table" ? "Book a table" : "Book an appointment"}
            </Link>
          )}
          {shop?.booking && (
            <Link href="/bookings" className="mb-1 inline-flex h-11 items-center rounded-full border border-line-strong bg-white px-5 text-sm font-bold text-purple hover:border-purple">
              {shop.booking.kind === "table" ? "My reservations" : "My appointments"}
            </Link>
          )}
          {shop && <MessageShopButton shopId={shop.id} className="mb-1 h-11 bg-white text-sm" />}
          {shop && (
            <a href={`tel:${shop.phone}`} className="mb-1 inline-flex h-11 items-center rounded-full border border-line-strong bg-white px-5 text-sm font-bold text-purple hover:border-purple">
              Call {formatLiberianPhone(shop.phone)}
            </a>
          )}
        </div>
        {shop && <CountryNotice country={shop.country} />}
        {shop && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>{work ? <AboutWork shop={shop} profile={work} /> : shop.description && <p className="max-w-3xl text-[15px] text-soft">{shop.description}</p>}</div>
            <section aria-label="Address and opening hours" className="flex flex-col gap-2 rounded-card border border-line bg-white p-4 text-sm">
              <p className="font-bold">📍 Where to find us</p>
              <p className="text-soft">{[shop.address, shop.city].filter((v, i, a) => v && a.indexOf(v) === i).join(", ")}</p>
              {shop.hours && <p className="text-soft">🕒 {shop.hours}</p>}
              {shop.kind === "restaurant" && (
                <p className="flex flex-wrap gap-1.5">
                  {["Delivery", ...(shop.eatIn ? ["Eat in"] : []), ...(shop.pickup ? ["Pickup"] : [])].map((w) => (
                    <span key={w} className="rounded-full bg-orange-tint px-2.5 py-0.5 text-[12px] font-bold text-ink">
                      {w}
                    </span>
                  ))}
                </p>
              )}
              <p className="text-soft">📞 {formatLiberianPhone(shop.phone)}</p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.name}, ${shop.address}, ${shop.city}, ${countryName(shop.country)}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-purple hover:underline"
              >
                Get directions →
              </a>
            </section>
          </div>
        )}

        {shop && <PortfolioSection slug={shop.slug} count={shop.portfolioCount} label={shop.kind === "restaurant" ? "Gallery" : "Our work"} />}
        {work && <VideosSection videos={work.videos} />}
        {shop && <ServicesMenu slug={shop.slug} services={services} />}
        {(!!shop?.portfolioCount || services.length > 0) && !!products?.length ? <h2 className="font-display text-xl font-extrabold">{shop?.kind === "restaurant" ? "Menu" : "Everything we offer"}</h2> : null}
        {products === null ? (
          <GridSkeleton />
        ) : products.length ? (
          <ProductGrid products={products} />
        ) : (
          <div className="rounded-card border border-line bg-white px-6 py-12 text-center text-sm text-muted">{shop?.kind === "restaurant" ? "This restaurant hasn&rsquo;t added its menu yet." : "This shop hasn&rsquo;t listed anything yet."}</div>
        )}
        {shop && (
          <div id="reviews" className="mt-4">
            <ReviewsSection load={loadReviews} shopName={shop.name} showProduct title="What buyers say" />
          </div>
        )}
      </main>
    </>
  );
}
