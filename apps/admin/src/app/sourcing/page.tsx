"use client";

import { useCallback, useEffect, useState } from "react";
import {
  formatLD,
  formatLiberianPhone,
  parseLD,
  PAYMENT_METHOD_LABEL,
  SOURCING_STATUS_LABEL,
  type SourcingRequest,
  type SourcingStatus,
} from "@yanabuy/shared";
import { Alert, Avatar, Badge, Button, Field, TextInput, fieldErrorsOf, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { EmptyPanel, PhotoRow, PillTabs } from "@/components/bits";
import { api } from "@/lib/api";
import { whenTime } from "@/lib/labels";

type Tab = "open" | "done" | "all";

const TONE: Record<SourcingStatus, "warn" | "purple" | "success" | "neutral" | "danger"> = {
  pending: "warn",
  quoted: "neutral",
  accepted: "warn",
  ordered: "purple",
  shipped: "purple",
  arrived: "purple",
  delivered: "success",
  rejected: "danger",
  cancelled: "neutral",
};

/** What YanaBuy has to do next. */
const TODO: Partial<Record<SourcingStatus, string>> = {
  pending: "Send a quote",
  accepted: "Order it from China",
  ordered: "Mark shipped when it leaves",
  shipped: "Mark arrived when it lands",
  arrived: "Deliver to the buyer",
};

export default function SourcingPage() {
  const [tab, setTab] = useState<Tab>("open");
  const [items, setItems] = useState<SourcingRequest[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.admin
      .sourcing(tab)
      .then((res) => {
        setItems(res.items);
        setOpenId((cur) => (cur && res.items.some((r) => r.id === cur) ? cur : (res.items[0]?.id ?? null)));
      })
      .catch((err) => setError(messageOf(err)));
  }, [tab]);
  useEffect(load, [load]);

  const open = items?.find((r) => r.id === openId) ?? null;

  return (
    <AdminShell title="China sourcing" subtitle="Buyers asking YanaBuy to buy something from China. Quote a landed price, then track it to their door.">
      <div className="mb-5">
        <PillTabs
          label="Show"
          tabs={[
            { value: "open", label: "In progress" },
            { value: "done", label: "Finished" },
            { value: "all", label: "All" },
          ]}
          value={tab}
          onChange={(v) => {
            setTab(v);
            setItems(null);
          }}
        />
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <section className="overflow-hidden rounded-[20px] border border-line bg-white" aria-label="Requests">
          {items === null && <p className="p-6 text-sm text-muted">Loading…</p>}
          {items?.length === 0 && <p className="px-6 py-12 text-center text-sm text-muted">{tab === "open" ? "No China requests in progress." : "Nothing here yet."}</p>}
          <ul>
            {items?.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setOpenId(r.id)}
                  aria-current={r.id === openId ? "true" : undefined}
                  className={`flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 ${r.id === openId ? "bg-purple-tint/50" : "hover:bg-ground"}`}
                >
                  {r.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.images[0]} alt="" className="h-12 w-12 flex-shrink-0 rounded-xl border border-line object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-purple-tint text-lg" aria-hidden>
                      🇨🇳
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {r.number} · {r.description}
                    </span>
                    <span className="block text-xs text-muted">
                      {r.buyer?.fullName} · {r.quantity} pcs · {whenTime(r.createdAt)}
                    </span>
                    {TODO[r.status] && <span className="block text-xs font-bold text-warn">{TODO[r.status]}</span>}
                  </span>
                  <Badge tone={TONE[r.status]}>{SOURCING_STATUS_LABEL[r.status]}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </section>
        {open ? (
          <RequestPanel
            key={open.id}
            request={open}
            onChanged={(u) => setItems((prev) => (prev ?? []).map((r) => (r.id === u.id ? u : r)))}
          />
        ) : (
          items && items.length > 0 && <EmptyPanel>Pick a request to see it.</EmptyPanel>
        )}
      </div>
    </AdminShell>
  );
}

const EVENT: Record<string, string> = {
  pending: "Request received",
  quoted: "Quote sent",
  accepted: "Buyer accepted",
  ordered: "Ordered from China",
  shipped: "Shipped to Liberia",
  arrived: "Arrived in Liberia",
  delivered: "Delivered",
  rejected: "Turned down",
  cancelled: "Buyer cancelled",
  payment_failed: "Buyer's payment failed",
};

const NEXT: Partial<Record<SourcingStatus, { to: SourcingStatus; label: string; noteLabel: string; placeholder: string }>> = {
  accepted: { to: "ordered", label: "Ordered from China", noteLabel: "Supplier order number (optional)", placeholder: "e.g. 1688 order 2398…" },
  ordered: { to: "shipped", label: "Shipped to Liberia", noteLabel: "Tracking / shipping note (optional)", placeholder: "e.g. Air freight, tracking YT2398…" },
  shipped: { to: "arrived", label: "Arrived in Liberia", noteLabel: "Note (optional)", placeholder: "e.g. At the Monrovia office" },
  arrived: { to: "delivered", label: "Delivered to the buyer", noteLabel: "Note (optional)", placeholder: "" },
};

function RequestPanel({ request: r, onChanged }: { request: SourcingRequest; onChanged: (r: SourcingRequest) => void }) {
  const [price, setPrice] = useState(r.quotePrice ? String(r.quotePrice / 100) : "");
  const [days, setDays] = useState(r.quoteDays ? String(r.quoteDays) : "30");
  const [quoteNote, setQuoteNote] = useState(r.quoteNote ?? "");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<{ request: SourcingRequest }>, done: string) {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const res = await action();
      onChanged(res.request);
      setNotice(done);
      setNote("");
      setRejecting(false);
    } catch (err) {
      setFields(fieldErrorsOf(err));
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const canQuote = r.status === "pending" || r.status === "quoted";
  const next = NEXT[r.status];

  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-[22px]" aria-label={`Request ${r.number}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-extrabold">{r.number}</p>
          <p className="text-[12.5px] text-muted">Asked {whenTime(r.createdAt)}</p>
        </div>
        <Badge tone={TONE[r.status]}>{SOURCING_STATUS_LABEL[r.status]}</Badge>
      </div>

      {r.buyer && (
        <div className="flex items-center gap-3 rounded-2xl bg-ground p-3">
          <Avatar name={r.buyer.fullName} url={r.buyer.avatarUrl} size={40} />
          <div className="min-w-0 flex-1">
            <p className="font-bold">{r.buyer.fullName}</p>
            <p className="text-[13px] text-muted">{formatLiberianPhone(r.buyer.phone)}</p>
          </div>
          <a href={`tel:${r.buyer.phone}`} className="text-[13px] font-bold text-purple hover:underline">
            Call
          </a>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="whitespace-pre-line text-[15px]">{r.description}</p>
        <p className="text-sm text-soft">
          <strong>{r.quantity}</strong> {r.quantity === 1 ? "piece" : "pieces"}
          {r.budget && <> · budget: {r.budget}</>}
        </p>
        {r.link && (
          <a href={r.link} target="_blank" rel="noreferrer noopener" className="break-all text-sm font-semibold text-purple hover:underline">
            {r.link} ↗
          </a>
        )}
        <PhotoRow urls={r.images} />
      </div>

      {r.quotePrice !== null && (
        <div className="rounded-2xl border border-line p-3 text-sm">
          <p>
            Quote: <strong>{formatLD(r.quotePrice)}</strong> · about {r.quoteDays} days
            {r.quotedAt && <span className="text-muted"> · sent {whenTime(r.quotedAt)}</span>}
          </p>
          {r.quoteNote && <p className="text-muted">{r.quoteNote}</p>}
          {r.paymentMethod && (
            <p className="mt-1">
              {PAYMENT_METHOD_LABEL[r.paymentMethod]} ·{" "}
              {r.paymentStatus === "paid" ? <strong className="text-success">paid</strong> : <span className="text-warn">not paid yet</span>}
            </p>
          )}
        </div>
      )}

      {r.delivery && (
        <div className="rounded-2xl bg-ground p-3 text-sm">
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Deliver to</p>
          <p className="font-bold">
            {r.delivery.name} · {formatLiberianPhone(r.delivery.phone)}
          </p>
          <p>
            {r.delivery.address}, {r.delivery.city}
          </p>
        </div>
      )}

      {r.rejectReason && r.status === "rejected" && <Alert>Turned down: {r.rejectReason}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && !Object.keys(fields).length && <Alert>{error}</Alert>}

      {canQuote && !rejecting && (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-purple/25 p-4">
          <p className="font-bold">{r.status === "quoted" ? "Change the quote" : "Send a quote"}</p>
          <p className="text-[12.5px] text-muted">The landed price for everything — item, China shipping to Liberia, customs and YanaBuy&rsquo;s margin.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Total price ($)" error={fields.price}>
              {(id) => <TextInput id={id} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} invalid={!!fields.price} placeholder="e.g. 17500" />}
            </Field>
            <Field label="Days to deliver" error={fields.days}>
              {(id) => <TextInput id={id} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} invalid={!!fields.days} />}
            </Field>
          </div>
          <Field label="Note to the buyer (optional)">
            {(id) => <TextInput id={id} value={quoteNote} onChange={(e) => setQuoteNote(e.target.value)} placeholder="e.g. Includes shipping to Monrovia. Blue colour only." />}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              busy={busy}
              onClick={() =>
                run(
                  () => api.admin.quoteSourcing(r.id, { price: parseLD(price) ?? 0, days: Number(days) || 0, note: quoteNote || null }),
                  "Quote sent. The buyer sees it on their request and can accept it."
                )
              }
            >
              {r.status === "quoted" ? "Update quote" : "Send quote"}
            </Button>
            <Button variant="ghost" className="text-danger hover:!text-danger" onClick={() => setRejecting(true)}>
              Can&rsquo;t source it
            </Button>
          </div>
        </div>
      )}

      {canQuote && rejecting && (
        <div className="flex flex-col gap-2 rounded-2xl border border-danger/30 p-4">
          <Field label="Why not? (the buyer sees this)" error={fields.reason}>
            {(id) => <TextInput id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The supplier doesn't ship batteries abroad" />}
          </Field>
          <div className="flex gap-2">
            <Button variant="danger" busy={busy} disabled={reason.trim().length < 3} onClick={() => run(() => api.admin.rejectSourcing(r.id, reason), "Request turned down.")}>
              Turn down
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {next && (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-purple/25 p-4">
          <p className="font-bold">Next step: {next.label}</p>
          <Field label={next.noteLabel}>
            {(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder={next.placeholder} />}
          </Field>
          <div>
            <Button busy={busy} onClick={() => run(() => api.admin.moveSourcing(r.id, next.to, note || null), `Marked as “${SOURCING_STATUS_LABEL[next.to]}”.`)}>
              {next.to === "delivered" && r.paymentStatus !== "paid" ? "Delivered — cash collected" : `Mark “${next.label}”`}
            </Button>
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">Timeline</p>
        <ol className="flex flex-col gap-2 border-l-2 border-line pl-4">
          {r.events.map((e, i) => (
            <li key={i} className="text-sm">
              <strong>{EVENT[e.status] ?? e.status}</strong>
              <span className="text-muted"> · {whenTime(e.createdAt)}</span>
              {e.note && <p className="text-soft">{e.note}</p>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
