"use client";

import { useEffect, useState } from "react";
import {
  DISPUTE_DAYS,
  DISPUTE_OUTCOME_LABEL,
  DISPUTE_REASON_LABEL,
  formatLD,
  type DisputeReason,
  type Order,
  type OrderDispute,
} from "@yanabuy/shared";
import { Alert, Button, Field, ImageUpload, fieldErrorsOf, inputClass, messageOf } from "@yanabuy/web-kit";
import { api } from "@/lib/api";
import { StarPicker } from "./Reviews";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Star + comment for each item of a delivered order. */
export function RateItems({ order }: { order: Order }) {
  // One rating per product, even if two colours/sizes of it were bought.
  const items = order.items.filter((i, n, all) => i.productId && all.findIndex((x) => x.productId === i.productId) === n);
  const [mine, setMine] = useState<Record<string, { rating: number; comment: string | null }>>({});

  useEffect(() => {
    api.orders
      .myReviews(order.id)
      .then((res) => setMine(Object.fromEntries(res.items.map((r) => [r.productId, { rating: r.rating, comment: r.comment }]))))
      .catch(() => {});
  }, [order.id]);

  if (!items.length) return null;
  return (
    <section className="rounded-card border border-line bg-white p-5" aria-label="Rate your items">
      <h2 className="font-display text-lg font-extrabold">How was it?</h2>
      <p className="text-[13px] text-muted">Your stars help other buyers and the shop. Only your first name and initial are shown.</p>
      <ul className="mt-2">
        {items.map((i) => (
          <RateOne key={i.id} orderId={order.id} productId={i.productId!} name={i.name} image={i.image} existing={mine[i.productId!]} />
        ))}
      </ul>
    </section>
  );
}

function RateOne({
  orderId,
  productId,
  name,
  image,
  existing,
}: {
  orderId: string;
  productId: string;
  name: string;
  image: string | null;
  existing?: { rating: number; comment: string | null };
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setRating(existing.rating);
      setComment(existing.comment ?? "");
      setSaved(true);
    }
  }, [existing]);

  async function save() {
    if (!rating) return setError("Choose 1 to 5 stars");
    setBusy(true);
    setError(null);
    try {
      await api.orders.review({ orderId, productId, rating, comment: comment.trim() || null });
      setSaved(true);
      setEditing(false);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex gap-3 border-t border-line py-4 first:border-t-0">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-14 w-14 flex-shrink-0 rounded-xl border border-line object-cover" />
      ) : (
        <div className="h-14 w-14 flex-shrink-0 rounded-xl bg-ground" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="font-semibold">{name}</p>
        {saved && !editing ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StarPicker value={rating} onChange={() => setEditing(true)} label={`Your stars for ${name}`} />
            <span className="font-semibold text-success">Thanks for your review!</span>
            <button onClick={() => setEditing(true)} className="font-bold text-purple hover:underline">
              Change
            </button>
            {comment && <p className="w-full text-soft">&ldquo;{comment}&rdquo;</p>}
          </div>
        ) : (
          <>
            <StarPicker value={rating} onChange={setRating} label={`Your stars for ${name}`} />
            <label className="sr-only" htmlFor={`c-${productId}`}>
              Your review of {name}
            </label>
            <textarea
              id={`c-${productId}`}
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              placeholder="What did you like or not like? (optional)"
              className={`${inputClass} h-auto resize-none py-2.5`}
            />
            {error && <Alert>{error}</Alert>}
            <div>
              <Button size="sm" busy={busy} onClick={save}>
                {saved ? "Save changes" : "Post review"}
              </Button>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

const REASONS = Object.keys(DISPUTE_REASON_LABEL) as DisputeReason[];

/** "Something wrong?" — the buyer reports a problem within a few days of delivery. */
export function ReportProblem({ order, onReported }: { order: Order; onReported: (o: Order) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  if (!order.disputeUntil || new Date(order.disputeUntil) < new Date()) return null;

  async function submit() {
    if (!reason) return setFields({ reason: "Choose what went wrong" });
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const res = await api.orders.reportProblem(order.id, { reason, description, photos });
      onReported(res.order);
    } catch (err) {
      setFields(fieldErrorsOf(err));
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="text-sm">
        <button onClick={() => setOpen(true)} className="font-bold text-danger hover:underline">
          Something wrong with this order? Report a problem
        </button>
        <p className="text-[12.5px] text-muted">You can report a problem until {new Date(order.disputeUntil).toLocaleDateString("en-GB", { day: "numeric", month: "long" })} ({DISPUTE_DAYS} days after delivery).</p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border-2 border-danger/25 bg-white p-5" aria-label="Report a problem">
      <div>
        <h2 className="font-display text-lg font-extrabold">Report a problem</h2>
        <p className="text-[13px] text-muted">YanaBuy will hear from you and the shop, then decide. If you&rsquo;re owed money, we send it back by mobile money.</p>
      </div>
      <div>
        <p className="mb-2 text-[13px] font-bold">What went wrong?</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What went wrong?">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => {
                setReason(r);
                setFields(({ reason: _gone, ...rest }) => rest);
              }}
              className={`h-9 rounded-full px-4 text-[13px] font-bold ${reason === r ? "bg-purple text-white" : "border border-line-strong bg-white text-soft"}`}
            >
              {DISPUTE_REASON_LABEL[r]}
            </button>
          ))}
        </div>
        {fields.reason && <p className="mt-1 text-[12.5px] font-semibold text-danger">{fields.reason}</p>}
      </div>
      <Field label="Tell us what happened" error={fields.description}>
        {(id) => (
          <textarea
            id={id}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={!!fields.description || undefined}
            maxLength={1000}
            className={`${inputClass} h-auto resize-none py-3`}
            placeholder="e.g. One of the two radios arrived with a cracked case."
          />
        )}
      </Field>
      <ImageUpload api={api} images={photos} onChange={setPhotos} max={6} label="Photos (optional)" hint="A photo of the problem helps us decide quickly." />
      {error && <Alert>{Object.keys(fields).length ? "Please fix the fields marked in red." : error}</Alert>}
      <div className="flex gap-2">
        <Button variant="danger" busy={busy} onClick={submit}>
          Send report
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

/** A reported problem, as the buyer or seller sees it. */
export function DisputeCard({ dispute: d, audience, children }: { dispute: OrderDispute; audience: "buyer" | "seller"; children?: React.ReactNode }) {
  const open = d.status === "open";
  return (
    <section className={`flex flex-col gap-3 rounded-card border-2 bg-white p-5 ${open ? "border-warn/40" : "border-line"}`} aria-label={`Problem ${d.number}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">
          {audience === "buyer" ? "Your report" : "The buyer reported a problem"} · {DISPUTE_REASON_LABEL[d.reason]}
        </h2>
        <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${open ? "bg-amber-tint text-ink" : "bg-success-tint text-success"}`}>
          {open ? "YanaBuy is looking into it" : "Decided"}
        </span>
      </div>
      <p className="whitespace-pre-line text-[14.5px]">{d.description}</p>
      {d.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {d.photos.map((u, i) => (
            <a key={u + i} href={u} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={`Photo ${i + 1}`} className="h-20 w-20 rounded-xl border border-line object-cover" />
            </a>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">
        {d.number} · reported {when(d.createdAt)}
      </p>
      {d.sellerResponse && (
        <div className="rounded-xl bg-ground px-4 py-3 text-sm">
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted">{audience === "seller" ? "Your side" : "The shop says"}</p>
          <p className="whitespace-pre-line">{d.sellerResponse}</p>
        </div>
      )}
      {children}
      {!open && d.outcome && (
        <div className="rounded-xl bg-purple-tint/50 px-4 py-3 text-sm">
          <p className="font-bold">
            YanaBuy decided: {DISPUTE_OUTCOME_LABEL[d.outcome]}
            {d.refundAmount ? ` — ${formatLD(d.refundAmount)} back to the buyer` : ""}
          </p>
          {audience === "seller" && d.sellerCharge ? <p>{formatLD(d.sellerCharge)} was taken from your balance.</p> : null}
          {audience === "buyer" && d.refundReference && <p className="text-muted">Mobile money transaction {d.refundReference}</p>}
          {d.decisionNote && <p className="mt-1">{d.decisionNote}</p>}
        </div>
      )}
    </section>
  );
}
