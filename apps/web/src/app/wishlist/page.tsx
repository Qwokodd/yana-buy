"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatLD, type WishlistEntry } from "@yanabuy/shared";
import { Alert, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { ProductCard } from "@/components/ProductCard";
import { useWishlist } from "@/lib/wishlist";
import { api } from "@/lib/api";

export default function WishlistPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const wish = useWishlist();
  const [items, setItems] = useState<WishlistEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/wishlist");
  }, [loading, user, router]);
  useEffect(() => {
    if (!user) return;
    api.me
      .wishlist()
      .then((r) => setItems(r.items))
      .catch((err) => setError(messageOf(err)));
  }, [user]);

  // Unsaving from a card takes it off this page.
  const shown = items?.filter((i) => wish.has(i.product.id)) ?? null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-[1312px] flex-col gap-5 px-4 py-8 sm:px-8">
        <h1 className="font-display text-[28px] font-extrabold">Your wishlist</h1>
        {error && <Alert>{error}</Alert>}
        {shown === null && !error && <p className="text-muted">Loading…</p>}
        {shown?.length === 0 && (
          <div className="rounded-card border border-line bg-white px-6 py-12 text-center">
            <p className="font-display text-lg font-extrabold">Nothing saved yet</p>
            <p className="mt-1 text-sm text-muted">Tap the ♡ on anything you like. We'll tell you when it gets cheaper.</p>
            <Link href="/" className="mt-4 inline-block font-bold text-purple hover:underline">
              Start shopping
            </Link>
          </div>
        )}
        {shown && shown.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((i) => (
              <div key={i.product.id} className="flex flex-col gap-1">
                <ProductCard product={i.product} />
                {i.product.price < i.priceAtSave && (
                  <p className="rounded-full bg-success-tint px-3 py-1 text-center text-[12px] font-bold text-success">
                    {formatLD(i.priceAtSave - i.product.price)} cheaper since you saved it
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
