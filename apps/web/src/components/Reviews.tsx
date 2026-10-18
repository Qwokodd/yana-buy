"use client";

import { useCallback, useEffect, useState } from "react";
import type { RatingSummary, Review } from "@yanabuy/shared";
import { Avatar, messageOf } from "@yanabuy/web-kit";

const STAR = "M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z";

/** Read-only stars, filled up to `value` (rounded to the nearest half). */
export function Stars({ value, size = 15 }: { value: number; size?: number }) {
  const half = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex items-center gap-px" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = half >= i ? 1 : half >= i - 0.5 ? 0.5 : 0;
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <defs>
              <linearGradient id={`half-${i}-${size}`}>
                <stop offset="50%" stopColor="rgb(var(--c-amber))" />
                <stop offset="50%" stopColor="#E4DEEA" />
              </linearGradient>
            </defs>
            <path d={STAR} fill={fill === 1 ? "rgb(var(--c-amber))" : fill === 0.5 ? `url(#half-${i}-${size})` : "#E4DEEA"} />
          </svg>
        );
      })}
    </span>
  );
}

/** "★ 4.5 (12)" — or nothing when there are no reviews. */
export function RatingLine({ rating, count, className = "" }: { rating: number | null; count: number; className?: string }) {
  if (!rating || !count) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Stars value={rating} size={13} />
      <span className="font-bold text-ink">{rating.toFixed(1)}</span>
      <span className="text-muted">({count})</span>
    </span>
  );
}

/** Tap to choose 1–5 stars. */
export function StarPicker({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const WORDS = ["", "Poor", "Not great", "OK", "Good", "Excellent"];
  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label={label} className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i} star${i > 1 ? "s" : ""}`} onClick={() => onChange(i)} className="p-0.5">
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
              <path d={STAR} fill={i <= value ? "rgb(var(--c-amber))" : "#E4DEEA"} />
            </svg>
          </button>
        ))}
      </div>
      {value > 0 && <span className="text-sm font-semibold text-soft">{WORDS[value]}</span>}
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function ReviewItem({ review: r, shopName, showProduct = false }: { review: Review; shopName: string; showProduct?: boolean }) {
  return (
    <li className="flex gap-3 border-t border-line py-4 first:border-t-0">
      <Avatar name={r.buyerName} url={r.buyerAvatar} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{r.buyerName}</span>
          <Stars value={r.rating} size={13} />
          <span className="text-xs text-muted">{when(r.createdAt)}</span>
        </div>
        {showProduct && <p className="text-[12.5px] font-semibold text-muted">{r.product.name}</p>}
        {r.comment && <p className="mt-1 whitespace-pre-line text-[14.5px] text-soft">{r.comment}</p>}
        {r.sellerReply && (
          <p className="mt-2 rounded-xl bg-purple-tint/50 px-3 py-2 text-[13.5px]">
            <strong>{shopName} replied:</strong> {r.sellerReply}
          </p>
        )}
      </div>
    </li>
  );
}

/** Star breakdown + list of reviews, with "show more". */
export function ReviewsSection({
  load,
  shopName,
  showProduct = false,
  title = "Reviews",
}: {
  load: (page: number) => Promise<{ summary: RatingSummary; items: Review[]; total: number }>;
  shopName: string;
  showProduct?: boolean;
  title?: string;
}) {
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [items, setItems] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    (p: number) =>
      load(p)
        .then((res) => {
          setSummary(res.summary);
          setTotal(res.total);
          setItems((prev) => (p === 1 ? res.items : [...prev, ...res.items]));
          setPage(p);
        })
        .catch((err) => setError(messageOf(err))),
    [load]
  );
  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  if (error || !summary) return null;

  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <h2 className="font-display text-[22px] font-extrabold">
        {title} {summary.count > 0 && <span className="text-muted">({summary.count})</span>}
      </h2>
      {summary.count === 0 ? (
        <p className="rounded-card border border-line bg-white px-5 py-6 text-sm text-muted">No reviews yet. Buyers can rate items after they&rsquo;re delivered.</p>
      ) : (
        <div className="grid items-start gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2 rounded-card border border-line bg-white p-5">
            <p className="font-display text-[40px] font-extrabold leading-none">{summary.average?.toFixed(1)}</p>
            <Stars value={summary.average ?? 0} size={18} />
            <p className="text-[13px] text-muted">{summary.count} {summary.count === 1 ? "review" : "reviews"}</p>
            <ul className="mt-2 flex flex-col gap-1">
              {[5, 4, 3, 2, 1].map((s) => {
                const n = summary.stars[s - 1];
                return (
                  <li key={s} className="flex items-center gap-2 text-[12.5px]">
                    <span className="w-3 text-right font-semibold">{s}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-ground">
                      <span className="block h-full rounded-full bg-amber" style={{ width: `${(n / summary.count) * 100}%` }} />
                    </span>
                    <span className="w-6 text-muted">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-card border border-line bg-white px-5">
            <ul>
              {items.map((r) => (
                <ReviewItem key={r.id} review={r} shopName={shopName} showProduct={showProduct} />
              ))}
            </ul>
            {items.length < total && (
              <button onClick={() => fetchPage(page + 1)} className="w-full border-t border-line py-3 text-sm font-bold text-purple hover:underline">
                Show more reviews
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
