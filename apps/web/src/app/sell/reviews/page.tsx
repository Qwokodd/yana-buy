"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RatingSummary, Review } from "@yanabuy/shared";
import { Alert, Avatar, Button, inputClass, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { Stars } from "@/components/Reviews";
import { api } from "@/lib/api";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function SellerReviewsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<{ summary: RatingSummary; items: Review[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/sell/reviews");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    api.shop
      .reviews()
      .then(setData)
      .catch((err) => setError(messageOf(err)));
  }, [user]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 sm:px-8">
        <div>
          <Link href="/sell" className="text-[13px] font-bold text-purple hover:underline">
            ← My shop
          </Link>
          <h1 className="font-display text-[28px] font-extrabold">Reviews</h1>
          <p className="text-sm text-muted">What buyers say after delivery. A short, friendly reply shows other buyers you care.</p>
        </div>
        {error && <Alert>{error}</Alert>}
        {data && (
          <div className="flex items-center gap-4 rounded-card border border-line bg-white p-5">
            <p className="font-display text-[40px] font-extrabold leading-none">{data.summary.average?.toFixed(1) ?? "–"}</p>
            <div>
              <Stars value={data.summary.average ?? 0} size={18} />
              <p className="text-sm text-muted">
                {data.summary.count} {data.summary.count === 1 ? "review" : "reviews"}
              </p>
            </div>
          </div>
        )}
        {data?.items.length === 0 && <p className="rounded-card border border-line bg-white px-5 py-10 text-center text-sm text-muted">No reviews yet. They appear here after buyers rate delivered orders.</p>}
        <ul className="flex flex-col gap-3">
          {data?.items.map((r) => (
            <ReviewCard key={r.id} review={r} onChanged={(u) => setData((d) => d && { ...d, items: d.items.map((x) => (x.id === u.id ? u : x)) })} />
          ))}
        </ul>
      </main>
    </>
  );
}

function ReviewCard({ review: r, onChanged }: { review: Review; onChanged: (r: Review) => void }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState(r.sellerReply ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onChanged((await api.shop.replyToReview(r.id, text)).review);
      setReplying(false);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex gap-3 rounded-card border border-line bg-white p-4" aria-label={`Review by ${r.buyerName}`}>
      <Avatar name={r.buyerName} url={r.buyerAvatar} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{r.buyerName}</span>
          <Stars value={r.rating} size={14} />
          <span className="text-xs text-muted">{when(r.createdAt)}</span>
        </div>
        <Link href={`/p/${r.product.id}`} className="text-[12.5px] font-semibold text-muted hover:text-purple">
          {r.product.name}
        </Link>
        {r.comment && <p className="mt-1 whitespace-pre-line text-[14.5px]">{r.comment}</p>}
        {r.sellerReply && !replying && (
          <p className="mt-2 rounded-xl bg-purple-tint/50 px-3 py-2 text-[13.5px]">
            <strong>Your reply:</strong> {r.sellerReply}
          </p>
        )}
        {replying ? (
          <div className="mt-2 flex flex-col gap-2">
            <label htmlFor={`reply-${r.id}`} className="sr-only">
              Your reply
            </label>
            <textarea id={`reply-${r.id}`} rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} className={`${inputClass} h-auto resize-none py-2.5`} placeholder="e.g. Thank you! Come again." />
            {error && <Alert>{error}</Alert>}
            <div className="flex gap-2">
              <Button size="sm" busy={busy} disabled={text.trim().length < 2} onClick={save}>
                Post reply
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setReplying(true)} className="mt-2 text-sm font-bold text-purple hover:underline">
            {r.sellerReply ? "Change reply" : "Reply"}
          </button>
        )}
      </div>
    </li>
  );
}
