"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CatalogKind, Category, ProductSort, PublicShop } from "@yanabuy/shared";
import { Alert } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { GridSkeleton } from "@/components/ProductCard";
import { ProductFeed } from "@/components/ProductFeed";
import { useProductFeed } from "@/lib/feed";
import { ShopTile } from "@/components/ShopTile";
import { useMode } from "@/lib/mode";
import { api } from "@/lib/api";

interface Filters {
  q: string;
  category: string;
  sort: ProductSort;
  china: boolean;
  page: number;
}

const SORTS: { value: ProductSort; label: string }[] = [
  { value: "best", label: "Best match" },
  { value: "newest", label: "Newest" },
  { value: "top_rated", label: "Top rated" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

function readUrl(): Filters & { mode: CatalogKind | null } {
  const p = new URLSearchParams(window.location.search);
  const mode = p.get("mode");
  const sort = p.get("sort") as ProductSort | null;
  return {
    q: p.get("q") ?? "",
    category: p.get("category") ?? "",
    sort: sort && SORTS.some((s) => s.value === sort) ? sort : "best",
    china: p.get("china") === "1",
    page: Math.max(1, Number(p.get("page")) || 1),
    mode: mode === "goods" || mode === "food" ? mode : null,
  };
}

export default function SearchPage() {
  const router = useRouter();
  const { mode, setMode } = useMode();
  const [filters, setFilters] = useState<Filters | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [shops, setShops] = useState<PublicShop[]>([]);

  // Read the address once, and again when the back button changes it.
  useEffect(() => {
    const sync = () => {
      const { mode: m, ...f } = readUrl();
      if (m) setMode(m);
      setFilters(f);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The header search box navigates here with a new ?q=.
  useEffect(() => {
    const onNav = (e: Event) => {
      const q = (e as CustomEvent<{ q: string }>).detail.q;
      setFilters((f) => ({ ...(f ?? { sort: "best" as const, china: false }), q, category: "", page: 1 }));
    };
    window.addEventListener("yanabuy:search", onNav);
    return () => window.removeEventListener("yanabuy:search", onNav);
  }, []);

  useEffect(() => {
    api.public
      .categories(mode)
      .then((res) => setCategories(res.items))
      .catch(() => {});
  }, [mode]);

  useEffect(() => {
    if (!filters) return;
    if (filters.q) {
      api.public
        .shops({ q: filters.q, mode })
        .then((res) => setShops(res.items))
        .catch(() => setShops([]));
    } else setShops([]);
  }, [filters, mode]);

  function update(next: Partial<Filters>) {
    const f = { ...(filters as Filters), page: 1, ...next };
    setFilters(f);
    const qs = new URLSearchParams();
    if (f.q) qs.set("q", f.q);
    qs.set("mode", mode);
    if (f.category) qs.set("category", f.category);
    if (f.sort !== "best") qs.set("sort", f.sort);
    if (f.china) qs.set("china", "1");
    router.replace(`/search?${qs.toString()}`, { scroll: false });
  }

  const category = categories.find((c) => c.slug === filters?.category);
  const title = filters?.q ? `“${filters.q}”` : category ? category.name : mode === "goods" ? "Goods & Services" : "Food";
  // Results keep loading as you scroll — no pages.
  const feed = useProductFeed(filters ? { q: filters.q || undefined, mode, category: filters.category || undefined, sort: filters.sort, china: filters.china || undefined } : null);
  const items = feed.items;
  const error = items === null ? feed.error : null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-[1312px] flex-col gap-5 px-4 py-7 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[28px] font-extrabold">{title}</h1>
            <p className="text-sm text-muted">
              {items ? `${feed.total} ${feed.total === 1 ? "result" : "results"}` : "Searching…"}
              {filters?.q && category ? ` in ${category.name}` : ""}
            </p>
          </div>
          {mode === "goods" && (
            <button
              onClick={() => update({ china: !filters?.china })}
              aria-pressed={!!filters?.china}
              className={`ml-auto h-10 rounded-full px-4 text-[13px] font-bold ${filters?.china ? "bg-purple text-white" : "border border-line-strong bg-white text-soft"}`}
            >
              🇨🇳 From China
            </button>
          )}
          <label className="flex items-center gap-2 text-sm font-semibold text-soft">
            Sort
            <select
              value={filters?.sort ?? "best"}
              onChange={(e) => update({ sort: e.target.value as ProductSort })}
              className="h-10 rounded-full border border-line-strong bg-white px-3 text-sm font-semibold text-ink"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="no-scrollbar flex gap-2 overflow-x-auto" role="group" aria-label="Category">
          <button
            onClick={() => update({ category: "" })}
            aria-pressed={!filters?.category}
            className={`h-9 flex-shrink-0 rounded-full px-4 text-[13px] font-bold ${!filters?.category ? "bg-purple text-white" : "border border-line-strong bg-white text-soft"}`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => update({ category: c.slug })}
              aria-pressed={filters?.category === c.slug}
              className={`h-9 flex-shrink-0 rounded-full px-4 text-[13px] font-bold ${filters?.category === c.slug ? "bg-purple text-white" : "border border-line-strong bg-white text-soft"}`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {shops.length > 0 && (
          <section aria-label="Shops" className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-extrabold">{mode === "food" ? "Restaurants" : "Shops"}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shops.slice(0, 6).map((s) => (
                <ShopTile key={s.id} shop={s} />
              ))}
            </div>
          </section>
        )}

        {error && <Alert>{error}</Alert>}
        {!items && !error ? (
          <GridSkeleton count={12} />
        ) : items && items.length ? (
          <ProductFeed products={items} done={feed.done} loading={feed.loading} error={feed.error} onMore={feed.loadNext} />
        ) : items ? (
          <div className="rounded-card border border-line bg-white px-6 py-12 text-center">
            <p className="font-display text-lg font-extrabold">Nothing found</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              {filters?.q ? "Try fewer or different words" : "Nothing listed here yet"}
              {filters?.category ? ", or look in all categories." : "."}
            </p>
            {filters?.category && (
              <button onClick={() => update({ category: "" })} className="mt-4 text-sm font-bold text-purple hover:underline">
                Show all categories
              </button>
            )}
          </div>
        ) : null}

        <p className="text-center text-sm text-muted">
          Looking for something else? <Link href="/" className="font-bold text-purple hover:underline">Back to the home page</Link>
        </p>
      </main>
    </>
  );
}
