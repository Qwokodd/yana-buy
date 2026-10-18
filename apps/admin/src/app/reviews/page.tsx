"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminReview } from "@yanabuy/shared";
import { Alert, Badge, Button, TextInput, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { Pager, PillTabs, SearchBox, Stars, Tile } from "@/components/bits";
import { api } from "@/lib/api";
import { whenTime } from "@/lib/labels";

type Tab = "all" | "shown" | "hidden";

export default function ReviewsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AdminReview[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.admin
      .reviews({ q: q || undefined, hidden: tab === "all" ? undefined : tab === "hidden", page })
      .then(setData)
      .catch((err) => setError(messageOf(err)));
  }, [q, tab, page]);
  useEffect(load, [load]);

  return (
    <AdminShell title="Reviews" subtitle="What buyers say about products. Hide reviews that are rude, fake or off-topic — hidden ones don't count in the stars.">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PillTabs
          label="Show"
          tabs={[
            { value: "all", label: "All" },
            { value: "shown", label: "Showing" },
            { value: "hidden", label: "Hidden" },
          ]}
          value={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
          }}
        />
        <SearchBox
          value={query}
          onChange={setQuery}
          onSubmit={() => {
            setQ(query.trim());
            setPage(1);
          }}
          placeholder="Product, shop, buyer or words"
          label="Search reviews"
        />
      </div>
      {error && <Alert>{error}</Alert>}
      <section className="overflow-hidden rounded-[20px] border border-line bg-white" aria-label="Reviews">
        {!data && <p className="p-6 text-sm text-muted">Loading…</p>}
        {data?.items.length === 0 && <p className="px-6 py-12 text-center text-sm text-muted">No reviews found.</p>}
        <ul>
          {data?.items.map((r) => (
            <ReviewRow key={r.id} review={r} onChanged={(u) => setData((d) => d && { ...d, items: d.items.map((x) => (x.id === u.id ? u : x)) })} />
          ))}
        </ul>
        {data && <Pager page={page} pages={Math.ceil(data.total / data.pageSize)} onPage={setPage} />}
      </section>
    </AdminShell>
  );
}

function ReviewRow({ review: r, onChanged }: { review: AdminReview; onChanged: (r: AdminReview) => void }) {
  const [hiding, setHiding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ review: AdminReview }>) {
    setBusy(true);
    setError(null);
    try {
      onChanged((await action()).review);
      setHiding(false);
      setReason("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`flex gap-4 border-b border-line px-5 py-4 last:border-b-0 ${r.hidden ? "bg-ground/70" : ""}`}>
      <Tile name={r.product.name} url={r.product.image} size={52} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Stars value={r.rating} />
          <span className="text-sm font-bold">{r.product.name}</span>
          <span className="text-[13px] text-muted">· {r.shop.name}</span>
          {r.hidden && <Badge tone="danger">Hidden</Badge>}
        </div>
        {r.comment ? <p className="mt-1 whitespace-pre-line text-[14.5px]">{r.comment}</p> : <p className="mt-1 text-sm italic text-muted">No comment, just stars</p>}
        {r.sellerReply && (
          <p className="mt-1.5 rounded-xl bg-purple-tint/50 px-3 py-2 text-[13.5px]">
            <strong>{r.shop.name}:</strong> {r.sellerReply}
          </p>
        )}
        <p className="mt-1 text-xs text-muted">
          {r.buyer.fullName} · {r.orderNumber} · {whenTime(r.createdAt)}
          {r.hidden && r.hiddenReason && <> · hidden because “{r.hiddenReason}”</>}
        </p>
        {hiding && (
          <div className="mt-2 flex flex-wrap gap-2">
            <TextInput aria-label="Why hide it?" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why hide it? e.g. Rude language" className="max-w-sm" />
            <Button size="sm" variant="danger" busy={busy} disabled={reason.trim().length < 3} onClick={() => run(() => api.admin.hideReview(r.id, reason))}>
              Hide review
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setHiding(false)}>
              Cancel
            </Button>
          </div>
        )}
        {error && (
          <div className="mt-2">
            <Alert>{error}</Alert>
          </div>
        )}
      </div>
      {!hiding && (
        <div className="flex-shrink-0">
          {r.hidden ? (
            <Button size="sm" variant="outline" busy={busy} onClick={() => run(() => api.admin.unhideReview(r.id))}>
              Show again
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="text-danger hover:!text-danger" onClick={() => setHiding(true)}>
              Hide
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
