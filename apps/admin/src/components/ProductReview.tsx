"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatLD, formatLiberianPhone, type AdminProduct, type ProductStatus, variantLabel } from "@yanabuy/shared";
import { Alert, Badge, Button, Field, messageOf } from "@yanabuy/web-kit";
import { api } from "@/lib/api";
import { when, whenTime } from "@/lib/labels";
import { EmptyPanel, Pager, PillTabs, SearchBox, Tile } from "./bits";

type StatusTab = "all" | ProductStatus;

const TONE: Record<ProductStatus, "warn" | "success" | "neutral" | "danger"> = {
  pending: "warn",
  approved: "success",
  rejected: "neutral",
  removed: "danger",
};
const WORD: Record<ProductStatus, string> = { pending: "Waiting", approved: "Live", rejected: "Sent back", removed: "Removed" };

export function ProductStatusBadge({ product }: { product: Pick<AdminProduct, "status" | "hidden"> }) {
  if (product.status === "approved" && product.hidden) return <Badge>Paused by seller</Badge>;
  return <Badge tone={TONE[product.status]}>{WORD[product.status]}</Badge>;
}

const TABS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Waiting" },
  { value: "approved", label: "Live" },
  { value: "rejected", label: "Sent back" },
  { value: "removed", label: "Removed" },
];

/** Products list with a review panel. `queue` shows only waiting products, oldest first. */
export function ProductsBrowser({ queue = false, onCount }: { queue?: boolean; onCount?: (n: number) => void }) {
  const [status, setStatus] = useState<StatusTab>(queue ? "pending" : "all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("product") ?? (!queue ? params.get("id") : null);
    if (id) setSelectedId(id);
  }, [queue]);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .products({ status: status === "all" ? undefined : status, q: search || undefined, page })
      .then((res) => {
        setRows(res.items);
        setTotal(res.total);
        setError(null);
        if (queue) {
          onCount?.(res.total);
          setSelectedId((cur) => cur ?? res.items[0]?.id ?? null);
        }
      })
      .catch((err) => setError(messageOf(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search, page, queue]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / 25));

  function changed(p: AdminProduct, done: string) {
    if (queue && p.status !== "pending") {
      setFlash(done);
      const rest = rows.filter((r) => r.id !== p.id);
      setRows(rest);
      const left = Math.max(0, total - 1);
      setTotal(left);
      onCount?.(left);
      return rest[0]?.id ?? null;
    }
    setRows((prev) => prev.map((r) => (r.id === p.id ? p : r)));
    return p.id;
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {!queue && (
          <PillTabs
            label="Status"
            tabs={TABS}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
        )}
        <SearchBox
          label="Search products"
          value={query}
          onChange={setQuery}
          onSubmit={() => {
            setSearch(query.trim());
            setPage(1);
          }}
          placeholder="Product, shop or seller"
        />
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="overflow-hidden rounded-card border border-line bg-white">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-[#FBF9FC] text-[11.5px] font-bold uppercase tracking-[0.6px] text-muted">
              <tr>
                <th className="px-[18px] py-3">Product</th>
                <th className="px-3 py-3">Shop</th>
                <th className="px-3 py-3">Price</th>
                <th className="px-3 py-3">Sent</th>
                {!queue && <th className="px-3 py-3">Status</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`cursor-pointer border-t border-[#F0EAF2] hover:bg-[#FBF9FC] ${selectedId === p.id ? "bg-purple-tint/60" : ""}`}
                >
                  <td className="px-[18px] py-3">
                    <button className="flex items-center gap-2.5 text-left" onClick={() => setSelectedId(p.id)}>
                      <Tile name={p.name} url={p.image} size={40} />
                      <span className="min-w-0">
                        <span className="block font-bold">
                          {p.name}
                          {p.featured && <span className="ml-1.5 text-amber" aria-label="Featured">★</span>}
                        </span>
                        <span className="text-xs text-muted">{p.category?.name ?? "No category"}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <span className="block font-semibold">{p.shop.name}</span>
                    <span className="text-xs text-muted">{p.shop.ownerName}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold">
                    {p.hasOptions ? "from " : ""}
                    {formatLD(p.price)}
                  </td>
                  <td className="px-3 py-3 text-muted">{when(p.submittedAt)}</td>
                  {!queue && (
                    <td className="px-3 py-3">
                      <ProductStatusBadge product={p} />
                    </td>
                  )}
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted">
                    {queue ? "No products waiting — you're all caught up." : `No products here${search ? ` matching “${search}”` : ""}.`}
                  </td>
                </tr>
              )}
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager page={page} pages={pages} onPage={setPage} />
        </div>

        <div className="flex flex-col gap-3">
          {flash && <Alert tone="success">{flash}</Alert>}
          {selectedId ? (
            <ProductPanel key={selectedId} id={selectedId} onChanged={(p, done) => setSelectedId(changed(p, done))} />
          ) : (
            <EmptyPanel>{queue ? "New products from sellers show up here for you to check." : "Pick a product to see its photos and details."}</EmptyPanel>
          )}
        </div>
      </div>
    </>
  );
}

const QUICK_REASONS = [
  "Please add clearer photos",
  "The photos don't match the product",
  "Please describe the product properly",
  "This isn't allowed on YanaBuy",
];

function ProductPanel({ id, onChanged }: { id: string; onChanged: (p: AdminProduct, done: string) => void }) {
  const [p, setP] = useState<AdminProduct | null>(null);
  const [photo, setPhoto] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"idle" | "reject" | "remove">("idle");

  useEffect(() => {
    api.admin
      .product(id)
      .then((res) => setP(res.product))
      .catch((err) => setError(messageOf(err)));
  }, [id]);

  async function run(action: () => Promise<{ product: AdminProduct }>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await action();
      setP(res.product);
      setNotice(done);
      setReason("");
      setMode("idle");
      onChanged(res.product, done);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (!p) return <div className="rounded-[20px] border border-line bg-white p-6 text-sm text-muted">{error ?? "Loading…"}</div>;

  const main = p.images[Math.min(photo, p.images.length - 1)];

  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-[22px]" aria-label={`${p.name} details`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-extrabold leading-tight">{p.name}</p>
          <p className="text-[12.5px] text-muted">
            {p.category?.name ?? "No category"} · sent {whenTime(p.submittedAt)}
          </p>
        </div>
        <ProductStatusBadge product={p} />
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
      {p.statusReason && (p.status === "rejected" || p.status === "removed") && (
        <Alert tone="warn">
          {p.status === "rejected" ? "Sent back" : "Removed"}
          {p.reviewedBy ? ` by ${p.reviewedBy.fullName}` : ""}: {p.statusReason}
        </Alert>
      )}

      {main && (
        <div className="flex flex-col gap-2">
          <a href={main} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-2xl border border-line bg-ground">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={main} alt={`${p.name} photo ${photo + 1}`} className="h-full w-full object-contain" />
          </a>
          {p.images.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {p.images.map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  onClick={() => setPhoto(i)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-current={i === photo ? "true" : undefined}
                  className={`h-14 w-14 overflow-hidden rounded-lg border-2 ${i === photo ? "border-purple" : "border-line"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-baseline gap-2">
        {p.hasOptions && <span className="text-sm font-semibold text-muted">from</span>}
        <span className="font-display text-2xl font-extrabold text-price">{formatLD(p.price)}</span>
        {p.compareAtPrice && <span className="text-sm text-muted line-through">{formatLD(p.compareAtPrice)}</span>}
        <span className="ml-auto text-[12.5px] text-muted">{p.stock === null ? "Stock not counted" : `${p.stock} in stock`}</span>
      </div>
      {p.variants.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <p className="bg-ground px-3 py-2 text-[12.5px] font-bold text-soft">
            {p.options.map((o) => `${o.name}: ${o.values.join(", ")}`).join(" · ")}
          </p>
          <table className="w-full text-[13px]">
            <tbody>
              {p.variants.map((v) => (
                <tr key={v.id} className="border-t border-line">
                  <td className="px-3 py-1.5 font-semibold">{variantLabel(v.values)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {formatLD(v.price)}
                    {v.compareAtPrice ? <span className="ml-1 text-muted line-through">{formatLD(v.compareAtPrice)}</span> : null}
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted">{v.stock === null ? "—" : v.stock === 0 ? "sold out" : `${v.stock} left`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(p.shipsFromChina || p.deliveryDays) && (
        <p className="text-[13px] font-semibold text-soft">
          {p.shipsFromChina ? "🇨🇳 Ships from China" : "Delivery time"}
          {p.deliveryDays ? ` · about ${p.deliveryDays} days` : ""}
        </p>
      )}
      {p.description && <p className="whitespace-pre-line text-[13.5px] text-soft">{p.description}</p>}

      <Link href={`/vendors?id=${p.shop.id}`} className="flex items-center gap-3 rounded-2xl bg-ground p-3 hover:ring-1 hover:ring-purple">
        <Tile name={p.shop.name} url={p.shop.logoUrl} size={36} />
        <span className="min-w-0 flex-1 text-[13px]">
          <span className="block font-bold">{p.shop.name}</span>
          <span className="text-muted">
            {p.shop.ownerName} · {formatLiberianPhone(p.shop.phone)}
          </span>
        </span>
        {p.shop.status !== "approved" && <Badge tone="danger">Shop {p.shop.status}</Badge>}
      </Link>

      {mode !== "idle" ? (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          {mode === "reject" && (
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setReason(q)}
                  className="rounded-full border border-line-strong px-3 py-1 text-[12px] font-semibold text-soft hover:border-purple hover:text-purple"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <Field label={mode === "reject" ? "What should they fix? (the seller sees this)" : "Why is it being removed? (the seller sees this)"}>
            {(fid) => (
              <textarea
                id={fid}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={mode === "reject" ? "e.g. The photo is too dark" : "e.g. Fake branded goods"}
                className="resize-none rounded-[12px] border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-purple"
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              busy={busy}
              disabled={reason.trim().length < 3}
              onClick={() =>
                mode === "reject"
                  ? run(() => api.admin.rejectProduct(p.id, reason), `“${p.name}” sent back to ${p.shop.ownerName}.`)
                  : run(() => api.admin.removeProduct(p.id, reason), `“${p.name}” is removed from the shop.`)
              }
            >
              {mode === "reject" ? "Send back" : "Remove product"}
            </Button>
            <Button variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          {p.status === "pending" && (
            <div className="flex gap-2">
              <Button variant="success" className="flex-1" busy={busy} onClick={() => run(() => api.admin.approveProduct(p.id), `“${p.name}” is live.`)}>
                Approve
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setMode("reject")} disabled={busy}>
                Ask for changes
              </Button>
            </div>
          )}
          {p.status === "approved" && (
            <Button
              variant={p.featured ? "outline" : "accent"}
              busy={busy}
              onClick={() =>
                run(
                  () => api.admin.featureProduct(p.id, !p.featured),
                  p.featured ? `“${p.name}” is no longer featured.` : `“${p.name}” is featured on the home page.`
                )
              }
            >
              {p.featured ? "Stop featuring" : "★ Feature on the home page"}
            </Button>
          )}
          {p.status === "removed" ? (
            <Button variant="success" busy={busy} onClick={() => run(() => api.admin.restoreProduct(p.id), `“${p.name}” is back on sale.`)}>
              Put back on sale
            </Button>
          ) : (
            <Button variant="ghost" className="text-danger hover:!text-danger" onClick={() => setMode("remove")} disabled={busy}>
              Remove this product
            </Button>
          )}
          {p.status === "rejected" && <p className="text-[12.5px] text-muted">Waiting for the seller to fix it.</p>}
        </div>
      )}
    </section>
  );
}
