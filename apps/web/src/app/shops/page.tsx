"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicShop, ShopCategory } from "@yanabuy/shared";
import { Alert, messageOf } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { ShopCard } from "@/components/ShopTile";
import { useMode } from "@/lib/mode";
import { api } from "@/lib/api";

type Sort = "popular" | "top_rated" | "newest" | "name";
const PAGE = 24;

/** Every open shop and restaurant, by category — browse, then visit their page. */
export default function ShopsDirectory() {
  const { mode, setMode } = useMode();
  const [cats, setCats] = useState<ShopCategory[]>([]);
  const [category, setCategory] = useState<string>("");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("popular");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: PublicShop[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const food = mode === "food";

  // Reading ?category= and ?mode= from the link once.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("mode") === "food" || p.get("mode") === "goods") setMode(p.get("mode") as "food" | "goods");
    if (p.get("category")) setCategory(p.get("category")!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.public
      .shopCategories(mode)
      .then((r) => setCats(r.items))
      .catch(() => setCats([]));
  }, [mode]);

  useEffect(() => {
    let live = true;
    setData(null);
    api.public
      .shops({ mode, category: category || undefined, q: q || undefined, sort, page, limit: PAGE })
      .then((r) => live && (setData(r), setError(null)))
      .catch((err) => live && setError(messageOf(err)));
    return () => {
      live = false;
    };
  }, [mode, category, q, sort, page]);

  const pages = data ? Math.ceil(data.total / PAGE) : 1;
  const pick = (slug: string) => {
    setCategory(slug);
    setPage(1);
  };

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-[1312px] flex-col gap-5 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[30px] font-extrabold leading-tight">{food ? "Restaurants" : "Shops"}</h1>
            <p className="text-sm text-muted">{food ? "Find a place to eat, see the menu, order or book a table." : "Explore every shop on YanaBuy and visit their page."}</p>
          </div>
          <div className="flex rounded-full border border-line-strong bg-white p-1" role="tablist" aria-label="Shops or restaurants">
            {(["goods", "food"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setCategory("");
                  setPage(1);
                }}
                className={`h-9 rounded-full px-4 text-sm font-bold ${mode === m ? (m === "food" ? "bg-orange text-white" : "bg-amber text-ink") : "text-soft"}`}
              >
                {m === "food" ? "Restaurants" : "Shops"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="list" aria-label="Categories">
          <Chip on={!category} onClick={() => pick("")} label="All" />
          {cats.map((c) => (
            <Chip key={c.id} on={category === c.slug} onClick={() => pick(c.slug)} label={`${c.name} · ${c.shopCount}`} icon={c.iconUrl} />
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQ(query.trim());
            setPage(1);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={food ? "Restaurant name, area or dish type" : "Shop name, area or what they sell"}
            aria-label="Search shops"
            className="h-11 min-w-[240px] flex-1 rounded-full border border-line-strong bg-white px-5 text-sm outline-none focus:border-purple"
          />
          <button type="submit" className="h-11 rounded-full bg-purple px-5 text-sm font-bold text-white hover:bg-ink">
            Search
          </button>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as Sort);
              setPage(1);
            }}
            aria-label="Sort"
            className="h-11 rounded-full border border-line-strong bg-white px-4 text-sm font-semibold"
          >
            <option value="popular">Most items</option>
            <option value="top_rated">Top rated</option>
            <option value="newest">Newest</option>
            <option value="name">A–Z</option>
          </select>
        </form>

        {error && <Alert>{error}</Alert>}
        {data && <p className="text-[13px] text-muted">{data.total.toLocaleString("en-US")} {food ? (data.total === 1 ? "restaurant" : "restaurants") : data.total === 1 ? "shop" : "shops"}</p>}
        {!data && !error && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-[230px] animate-pulse rounded-card bg-white" />
            ))}
          </div>
        )}
        {data?.items.length === 0 && (
          <div className="rounded-card border border-line bg-white px-6 py-12 text-center">
            <p className="font-display text-lg font-extrabold">Nothing found</p>
            <p className="text-sm text-muted">Try another category or search.</p>
          </div>
        )}
        {data && data.items.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.items.map((s) => (
              <ShopCard key={s.id} shop={s} />
            ))}
          </div>
        )}
        {pages > 1 && (
          <nav className="flex items-center justify-center gap-3" aria-label="Pages">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-10 rounded-full border border-line-strong bg-white px-4 text-sm font-bold disabled:opacity-40">
              ← Previous
            </button>
            <span className="text-sm text-muted">
              Page {page} of {pages}
            </span>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="h-10 rounded-full border border-line-strong bg-white px-4 text-sm font-bold disabled:opacity-40">
              Next →
            </button>
          </nav>
        )}
        <p className="text-center text-sm text-muted">
          Want your shop here?{" "}
          <Link href="/sell" className="font-bold text-purple hover:underline">
            Sell on YanaBuy
          </Link>
        </p>
      </main>
    </>
  );
}

function Chip({ on, onClick, label, icon }: { on: boolean; onClick: () => void; label: string; icon?: string | null }) {
  return (
    <button
      role="listitem"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold ${on ? "border-purple bg-purple text-white" : "border-line-strong bg-white text-ink hover:border-purple"}`}
    >
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" className="h-5 w-5 rounded object-cover" />
      )}
      {label}
    </button>
  );
}
