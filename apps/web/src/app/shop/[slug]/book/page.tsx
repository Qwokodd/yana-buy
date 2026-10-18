"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Product, ProductCard, PublicShop } from "@yanabuy/shared";
import { Alert, messageOf } from "@yanabuy/web-kit";
import { formatLD } from "@yanabuy/shared";
import { SiteHeader } from "@/components/SiteHeader";
import { BookingForm } from "@/components/BookingForm";
import { api } from "@/lib/api";

export default function BookPage() {
  const { slug } = useParams<{ slug: string }>();
  const [shop, setShop] = useState<PublicShop | null>(null);
  const [service, setService] = useState<Product | null | undefined>(undefined);
  const [services, setServices] = useState<ProductCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.public
      .shop(slug)
      .then((r) => {
        setShop(r.shop);
        document.title = `Book · ${r.shop.name}`;
      })
      .catch((err) => setError(messageOf(err)));
    const id = new URLSearchParams(window.location.search).get("product");
    if (id)
      api.public
        .product(id)
        .then((r) => setService(r.product.bookable ? r.product : null))
        .catch(() => setService(null));
    else setService(null);
  }, [slug]);

  // A shop with services but none picked: list them to choose from.
  useEffect(() => {
    if (!shop || shop.kind === "restaurant" || service) return;
    api.public
      .products({ shop: slug, bookable: true })
      .then((r) => setServices(r.items))
      .catch(() => {});
  }, [shop, service, slug]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8 sm:px-8">
        <Link href={`/shop/${slug}`} className="text-[13px] font-bold text-purple hover:underline">
          ← {shop?.name ?? "Back to the shop"}
        </Link>
        <h1 className="font-display text-[28px] font-extrabold">{shop?.kind === "restaurant" ? "Book a table" : "Book an appointment"}</h1>
        {error && <Alert>{error}</Alert>}
        {shop && service !== undefined && (shop.kind === "restaurant" || service) && <BookingForm shop={shop} service={service ?? null} />}
        {shop && shop.kind !== "restaurant" && service === null && (
          <section className="flex flex-col gap-2 rounded-card border border-line bg-white p-5">
            <p className="font-bold">Which service?</p>
            {services.length === 0 && <p className="text-sm text-muted">This shop has no services to book yet.</p>}
            {services.map((p) => (
              <button
                key={p.id}
                onClick={() => api.public.product(p.id).then((r) => setService(r.product))}
                className="flex justify-between rounded-2xl border border-line px-4 py-3 text-left text-sm hover:border-purple"
              >
                <span className="font-semibold">{p.name}</span>
                <span className="text-muted">{formatLD(p.price)}</span>
              </button>
            ))}
          </section>
        )}
      </main>
    </>
  );
}
