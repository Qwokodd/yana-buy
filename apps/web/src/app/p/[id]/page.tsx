"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { useCallback, useEffect, useState } from "react";
import { BUY_WORDS, defaultPick, findVariant, formatLD, formatLiberianPhone, pickValue, SHOP_KIND_LABEL, valueState, type Product, type ProductCard } from "@yanabuy/shared";
import { messageOf } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { discount, ProductGrid } from "@/components/ProductCard";
import { ShopLogo } from "@/components/ShopTile";
import { RatingLine, ReviewsSection } from "@/components/Reviews";
import { MessageShopButton } from "@/components/MessageShop";
import { HeartButton } from "@/components/Heart";
import { CountryNotice } from "@/components/CountryNotice";
import { api } from "@/lib/api";
import { useMode } from "@/lib/mode";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const { foodHow } = useMode();
  const [product, setProduct] = useState<Product | null>(null);
  const [more, setMore] = useState<ProductCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [picked, setPicked] = useState<(string | null)[]>([]);
  const cart = useCart();
  const router = useRouter();
  const loadReviews = useCallback((page: number) => api.public.productReviews(id, page), [id]);

  useEffect(() => {
    setProduct(null);
    setPhoto(0);
    api.public
      .product(id)
      .then((res) => {
        setProduct(res.product);
        setPicked(defaultPick(res.product));
        setMore(res.more);
        document.title = `${res.product.name} · ${res.product.shop.name}`;
      })
      .catch((err) => setError(messageOf(err)));
  }, [id, foodHow]);

  if (error) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="font-display text-2xl font-extrabold">{error}</p>
          <p className="mt-2 text-sm text-muted">The shop may have sold it or taken it down.</p>
          <Link href="/search" className="mt-5 inline-flex h-11 items-center rounded-full bg-purple px-6 text-sm font-bold text-white">
            Look for something similar
          </Link>
        </main>
      </>
    );
  }

  if (!product) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto grid max-w-[1180px] gap-8 px-4 py-8 sm:px-8 lg:grid-cols-2" aria-hidden="true">
          <div className="aspect-square animate-pulse rounded-sheet bg-white" />
          <div className="flex flex-col gap-3">
            <div className="h-8 w-3/4 animate-pulse rounded bg-white" />
            <div className="h-6 w-1/3 animate-pulse rounded bg-white" />
          </div>
        </main>
      </>
    );
  }

  // With options, price and stock follow the colour/size picked.
  const variant = findVariant(product, picked);
  const hasOptions = product.variants.length > 0;
  const price = variant?.price ?? product.price;
  const compareAt = variant ? variant.compareAtPrice : product.compareAtPrice;
  const stock = variant ? variant.stock : hasOptions ? 0 : product.stock;
  const inStock = hasOptions ? !!variant && (stock === null || stock > 0) : product.inStock;
  const off = discount(price, compareAt);
  const main = (photo === 0 && variant?.image) || product.images[photo] || product.image;
  const few = stock !== null && stock > 0 && stock <= 5;
  const maxQty = Math.min(99, stock ?? 99);
  const addToCart = () => cart.add(product.id, Math.min(qty, maxQty), variant?.id ?? null);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-[1180px] flex-col gap-10 px-4 py-8 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-[13px] text-muted">
          <Link href="/" className="hover:text-purple">
            Home
          </Link>
          {product.category && (
            <>
              {" / "}
              <Link href={`/search?category=${product.category.slug}&mode=${product.kind}`} className="hover:text-purple">
                {product.category.name}
              </Link>
            </>
          )}
        </nav>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="relative aspect-square overflow-hidden rounded-sheet border border-line bg-white">
              {main && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={main} alt={product.name} className="h-full w-full object-contain" />
              )}
              {off && <span className="absolute left-4 top-4 rounded-full bg-price px-3 py-1 text-sm font-extrabold text-white">-{off}%</span>}
            </div>
            {product.images.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {product.images.map((src, i) => (
                  <button
                    key={src + i}
                    onClick={() => setPhoto(i)}
                    aria-label={`Photo ${i + 1}`}
                    aria-current={i === photo ? "true" : undefined}
                    className={`h-[72px] w-[72px] overflow-hidden rounded-xl border-2 bg-white ${i === photo ? "border-purple" : "border-line hover:border-line-strong"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-5">
            <CountryNotice country={product.shop.country} what="product" />
            <div>
              <div className="flex items-start justify-between gap-3">
                <h1 className="font-display text-[30px] font-extrabold leading-tight">{product.name}</h1>
                <HeartButton productId={product.id} name={product.name} size="lg" />
              </div>
              {product.ratingCount > 0 && (
                <a href="#reviews" className="mt-1 inline-block text-sm hover:underline">
                  <RatingLine rating={product.rating} count={product.ratingCount} />
                </a>
              )}
              <p className="mt-3 flex flex-wrap items-baseline gap-2">
                <span className="font-display text-[32px] font-extrabold text-price">{formatLD(price)}</span>
                {off && compareAt && (
                  <>
                    <span className="text-lg text-muted line-through">{formatLD(compareAt)}</span>
                    <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[12.5px] font-extrabold text-price">
                      You save {formatLD(compareAt - price)}
                    </span>
                  </>
                )}
              </p>
              <p className={`mt-1 text-sm font-bold ${!inStock ? "text-danger" : few ? "text-warn" : "text-success"}`}>
                {hasOptions && !variant
                  ? "Choose an option"
                  : !inStock
                    ? hasOptions
                      ? "This choice is sold out"
                      : "Sold out"
                    : few
                      ? `Only ${stock} left`
                      : product.kind === "food"
                        ? "Available to order"
                        : "In stock"}
              </p>
            </div>

            {(product.shipsFromChina || product.deliveryDays) && (
              <p className="rounded-xl bg-amber-tint px-4 py-3 text-sm font-semibold text-ink">
                {product.shipsFromChina ? "🇨🇳 Ships from China" : "Delivery time"}
                {product.deliveryDays ? ` — arrives in about ${product.deliveryDays} days` : " — takes longer to arrive"}
              </p>
            )}
            {hasOptions && (
              <div className="flex flex-col gap-4">
                {product.options.map((o, oi) => (
                  <fieldset key={o.name}>
                    <legend className="mb-2 text-sm font-bold text-soft">
                      {o.name}: <span className="text-ink">{picked[oi] ?? "choose"}</span>
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {o.values.map((value) => {
                        const state = valueState(product, picked, oi, value);
                        const on = picked[oi]?.toLowerCase() === value.toLowerCase();
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={on}
                            onClick={() => {
                              setPicked(pickValue(product, picked, oi, value));
                              setPhoto(0);
                              setAdded(false);
                            }}
                            className={`min-h-10 rounded-full border-2 px-4 text-sm font-bold ${
                              on ? "border-purple bg-purple text-white" : "border-line-strong bg-white text-ink hover:border-purple"
                            } ${state === "soldout" ? "opacity-50 line-through" : state === "none" ? "opacity-50" : ""}`}
                            title={state === "soldout" ? "Sold out" : state === "none" ? "Not available with your other choices" : undefined}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}
            {product.bookable && (
              <Link href={`/shop/${product.shop.slug}/book?product=${product.id}`} className="flex h-[52px] items-center justify-center rounded-full bg-amber text-[15px] font-bold text-ink hover:brightness-95">
                📅 Book a time · {product.durationMinutes ?? 60} min
              </Link>
            )}
            <div className="flex flex-col gap-3 rounded-card border border-line bg-white p-4">
              {product.bookable ? (
                <p className="text-sm text-soft">This is a service — book a time above and pay {product.shop.name} at your appointment.</p>
              ) : inStock ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-soft">Quantity</span>
                    <div className="flex items-center rounded-full border border-line-strong">
                      <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Fewer" className="h-10 w-10 text-lg font-bold text-purple disabled:opacity-40" disabled={qty <= 1}>
                        −
                      </button>
                      <span className="w-8 text-center font-bold" aria-live="polite">
                        {qty}
                      </span>
                      <button
                        onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                        aria-label="More"
                        className="h-10 w-10 text-lg font-bold text-purple disabled:opacity-40"
                        disabled={qty >= maxQty}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        addToCart();
                        setAdded(true);
                      }}
                      className="h-[52px] flex-1 rounded-full bg-purple text-[15px] font-bold text-white hover:bg-ink"
                    >
                      {BUY_WORDS[product.kind].add}
                    </button>
                    <button
                      onClick={() => {
                        addToCart();
                        router.push("/cart");
                      }}
                      className={`h-[52px] flex-1 rounded-full text-[15px] font-bold text-ink hover:brightness-95 ${product.kind === "food" ? "bg-orange" : "bg-amber"}`}
                    >
                      {BUY_WORDS[product.kind].now}
                    </button>
                  </div>
                  {added && (
                    <p className="rounded-xl bg-success-tint px-3 py-2 text-sm font-semibold text-success" role="status">
                      {BUY_WORDS[product.kind].added}.{" "}
                      <Link href="/cart" className="underline">
                        {BUY_WORDS[product.kind].go}
                      </Link>
                    </p>
                  )}
                  <p className="text-[12.5px] text-muted">
                    {product.kind === "food"
                      ? foodHow === "eat_in"
                        ? "Eat in: the restaurant's own price, paid at the restaurant."
                        : foodHow === "pickup"
                          ? "Pickup: collect it at the restaurant."
                          : "A YanaBuy rider delivers it. You pay with mobile money when you order."
                      : "A YanaBuy rider delivers it. You pay with mobile money when you order."}
                  </p>
                </>
              ) : (
                <p className="text-sm font-semibold text-muted">
                  {hasOptions ? "This choice is sold out — try another, or ask the shop." : "Sold out for now — check back soon or call the shop."}
                </p>
              )}
              <MessageShopButton shopId={product.shop.id} productId={product.id} label="Ask the shop a question" />
              <a href={`tel:${product.shop.phone}`} className="text-center text-[13px] font-bold text-purple hover:underline">
                Or call {product.shop.name} · {formatLiberianPhone(product.shop.phone)}
              </a>
            </div>

            {product.description && (
              <section>
                <h2 className="mb-1.5 font-display text-lg font-extrabold">About this {product.kind === "food" ? "dish" : "item"}</h2>
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-soft">{product.description}</p>
              </section>
            )}

            <Link href={`/shop/${product.shop.slug}`} className="flex items-center gap-3 rounded-card border border-line bg-white p-4 hover:border-purple">
              <ShopLogo name={product.shop.name} url={product.shop.logoUrl} />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{product.shop.name}</span>
                <span className="text-[13px] text-muted">
                  {SHOP_KIND_LABEL[product.shop.kind]} · {product.shop.city}
                </span>
              </span>
              <span className="text-sm font-bold text-purple">Visit shop →</span>
            </Link>
          </div>
        </div>

        <div id="reviews">
          <ReviewsSection load={loadReviews} shopName={product.shop.name} />
        </div>

        {more.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-[22px] font-extrabold">More from {product.shop.name}</h2>
            <ProductGrid products={more} />
          </section>
        )}
      </main>
    </>
  );
}
