"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  DISPUTE_OUTCOME_LABEL,
  DISPUTE_REASON_LABEL,
  formatLD,
  formatLiberianPhone,
  parseLD,
  PAYMENT_METHOD_LABEL,
  type AdminDispute,
  type DisputeOutcome,
  type Order,
} from "@yanabuy/shared";
import { Alert, Avatar, Badge, Button, Field, TextInput, fieldErrorsOf, inputClass, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { EmptyPanel, PhotoRow, PillTabs, Tile } from "@/components/bits";
import { api } from "@/lib/api";
import { whenTime } from "@/lib/labels";

type Tab = "open" | "resolved" | "all";

export default function DisputesPage() {
  const [tab, setTab] = useState<Tab>("open");
  const [items, setItems] = useState<AdminDispute[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.admin
      .disputes(tab)
      .then((res) => {
        setItems(res.items);
        setOpenId((cur) => (cur && res.items.some((d) => d.id === cur) ? cur : (res.items[0]?.id ?? null)));
      })
      .catch((err) => setError(messageOf(err)));
  }, [tab]);
  useEffect(load, [load]);

  return (
    <AdminShell title="Disputes" subtitle="Buyers reporting a problem with a delivered order. Hear both sides, then decide.">
      <div className="mb-5">
        <PillTabs
          label="Show"
          tabs={[
            { value: "open", label: "Open" },
            { value: "resolved", label: "Decided" },
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
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section className="overflow-hidden rounded-[20px] border border-line bg-white" aria-label="Disputes">
          {items === null && <p className="p-6 text-sm text-muted">Loading…</p>}
          {items?.length === 0 && <p className="px-6 py-12 text-center text-sm text-muted">{tab === "open" ? "No open disputes. 🎉" : "Nothing here yet."}</p>}
          <ul>
            {items?.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => setOpenId(d.id)}
                  aria-current={d.id === openId ? "true" : undefined}
                  className={`flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 ${d.id === openId ? "bg-purple-tint/50" : "hover:bg-ground"}`}
                >
                  <Tile name={d.order.shop.name} url={d.order.shop.logoUrl} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {d.number} · {DISPUTE_REASON_LABEL[d.reason]}
                    </span>
                    <span className="block text-xs text-muted">
                      {d.buyer.fullName} → {d.order.shop.name} · {d.order.number} · {whenTime(d.createdAt)}
                    </span>
                    {d.status === "open" && !d.sellerResponse && <span className="block text-xs font-semibold text-warn">Seller hasn&rsquo;t answered yet</span>}
                  </span>
                  {d.status === "open" ? <Badge tone="warn">Open</Badge> : <Badge tone={d.outcome === "no_refund" ? "neutral" : "success"}>{DISPUTE_OUTCOME_LABEL[d.outcome!]}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </section>
        {openId ? (
          <DisputePanel key={openId} id={openId} onChanged={(u) => setItems((prev) => (prev ?? []).map((d) => (d.id === u.id ? u : d)))} />
        ) : (
          items && items.length > 0 && <EmptyPanel>Pick a dispute to see it.</EmptyPanel>
        )}
      </div>
    </AdminShell>
  );
}

function DisputePanel({ id, onChanged }: { id: string; onChanged: (d: AdminDispute) => void }) {
  const [d, setD] = useState<AdminDispute | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .dispute(id)
      .then((res) => {
        setD(res.dispute);
        setOrder(res.order);
      })
      .catch((err) => setError(messageOf(err)));
  }, [id]);

  if (!d || !order) return <div className="rounded-[20px] border border-line bg-white p-6 text-sm text-muted">{error ?? "Loading…"}</div>;

  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-[22px]" aria-label={`Dispute ${d.number}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-extrabold">
            {d.number} · {DISPUTE_REASON_LABEL[d.reason]}
          </p>
          <p className="text-[12.5px] text-muted">
            Reported {whenTime(d.createdAt)} · order {order.number} delivered {order.deliveredAt ? whenTime(order.deliveredAt) : ""}
          </p>
        </div>
        {d.status === "open" ? <Badge tone="warn">Open</Badge> : <Badge tone="success">Decided</Badge>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Person label="Buyer" name={d.buyer.fullName} phone={d.buyer.phone} avatar={d.buyer.avatarUrl} />
        <Person label="Shop" name={order.shop.name} phone={order.shop.phone} avatar={order.shop.logoUrl} />
      </div>

      <div className="rounded-2xl border border-line p-4">
        <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-muted">What the buyer says</p>
        <p className="whitespace-pre-line text-[15px]">{d.description}</p>
        <div className="mt-3">
          <PhotoRow urls={d.photos} />
        </div>
      </div>

      <div className={`rounded-2xl p-4 ${d.sellerResponse ? "border border-line" : "bg-ground"}`}>
        <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-muted">What the seller says</p>
        {d.sellerResponse ? (
          <>
            <p className="whitespace-pre-line text-[15px]">{d.sellerResponse}</p>
            <p className="mt-1 text-xs text-muted">{d.sellerRespondedAt && whenTime(d.sellerRespondedAt)}</p>
          </>
        ) : (
          <p className="text-sm text-muted">No answer yet. The seller sees this problem on the order in their Shop orders.</p>
        )}
      </div>

      <div className="rounded-2xl bg-ground p-4 text-sm">
        <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">The order</p>
        <ul className="flex flex-col gap-1">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-2">
              <span>
                {i.quantity} × {i.name}{i.variantLabel ? ` (${i.variantLabel})` : ""}
              </span>
              <span>{formatLD(i.price * i.quantity)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-2 text-muted">
            <span>Delivery</span>
            <span>{formatLD(order.deliveryFee)}</span>
          </li>
          <li className="flex justify-between gap-2 font-extrabold">
            <span>Total</span>
            <span>{formatLD(order.total)}</span>
          </li>
        </ul>
        <p className="mt-2 text-muted">
          {PAYMENT_METHOD_LABEL[order.paymentMethod]} · {order.paymentStatus} · rider {order.rider?.fullName ?? "—"}
        </p>
        <Link href={`/chats?q=${encodeURIComponent(d.buyer.fullName)}`} className="mt-2 inline-block font-bold text-purple hover:underline">
          Look for their chat →
        </Link>
      </div>

      {d.status === "open" ? (
        <Decision
          dispute={d}
          order={order}
          onDone={(u) => {
            setD(u);
            onChanged(u);
          }}
        />
      ) : (
        <div className="rounded-2xl border-2 border-success/30 p-4 text-sm">
          <p className="font-bold">
            {DISPUTE_OUTCOME_LABEL[d.outcome!]}
            {d.refundAmount ? ` · ${formatLD(d.refundAmount)} back to the buyer` : ""}
            {d.sellerCharge ? ` · ${formatLD(d.sellerCharge)} from the seller` : ""}
          </p>
          {d.refundReference && <p className="text-muted">Transaction {d.refundReference}</p>}
          <p className="mt-1">{d.decisionNote}</p>
          <p className="text-xs text-muted">{d.resolvedAt && whenTime(d.resolvedAt)}</p>
        </div>
      )}
    </section>
  );
}

function Person({ label, name, phone, avatar }: { label: string; name: string; phone: string; avatar: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-ground p-3">
      <Avatar name={name} url={avatar} size={36} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
        <p className="truncate font-bold">{name}</p>
        <a href={`tel:${phone}`} className="text-[13px] text-purple hover:underline">
          {formatLiberianPhone(phone)}
        </a>
      </div>
    </div>
  );
}

function Decision({ dispute: d, order, onDone }: { dispute: AdminDispute; order: Order; onDone: (d: AdminDispute) => void }) {
  const [outcome, setOutcome] = useState<DisputeOutcome | null>(null);
  const [refund, setRefund] = useState("");
  const [charge, setCharge] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const clear = (k: string) => setFields(({ [k]: _gone, ...rest }) => rest);

  function pick(o: DisputeOutcome) {
    setOutcome(o);
    setFields({});
    if (o === "refund_full") {
      setRefund(String(order.total / 100));
      setCharge(String(order.subtotal / 100));
    } else if (o === "no_refund") {
      setRefund("0");
      setCharge("0");
    } else {
      setRefund("");
      setCharge("");
    }
  }

  async function submit() {
    if (!outcome) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const res = await api.admin.resolveDispute(d.id, {
        outcome,
        refundAmount: parseLD(refund) ?? 0,
        sellerCharge: parseLD(charge) ?? 0,
        refundReference: reference || null,
        note,
      });
      onDone(res.dispute);
    } catch (err) {
      setFields(fieldErrorsOf(err));
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-purple/25 p-4">
      <p className="font-bold">Your decision</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Decision">
        {(["refund_full", "refund_partial", "no_refund"] as const).map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={outcome === o}
            onClick={() => pick(o)}
            className={`h-10 rounded-full px-4 text-[13px] font-bold ${outcome === o ? "bg-purple text-white" : "border border-line-strong bg-white text-soft"}`}
          >
            {DISPUTE_OUTCOME_LABEL[o]}
          </button>
        ))}
      </div>
      {outcome && outcome !== "no_refund" && (
        <>
          <p className="text-[12.5px] text-muted">
            Send the money back to the buyer by mobile money first ({formatLiberianPhone(d.buyer.phone)}), then record it here. You can take some or all of it from the
            seller&rsquo;s balance (at most the item total, {formatLD(order.subtotal)}).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Refund to the buyer ($)" error={fields.refundAmount}>
              {(id) => (
                <TextInput id={id} inputMode="decimal" value={refund} onChange={(e) => { setRefund(e.target.value); clear("refundAmount"); }} readOnly={outcome === "refund_full"} invalid={!!fields.refundAmount} />
              )}
            </Field>
            <Field label="Take from the seller ($)" error={fields.sellerCharge} hint="0 if YanaBuy pays it">
              {(id) => <TextInput id={id} inputMode="decimal" value={charge} onChange={(e) => { setCharge(e.target.value); clear("sellerCharge"); }} invalid={!!fields.sellerCharge} />}
            </Field>
          </div>
          <Field label="Refund transaction ID" error={fields.refundReference}>
            {(id) => <TextInput id={id} value={reference} onChange={(e) => { setReference(e.target.value); clear("refundReference"); }} invalid={!!fields.refundReference} placeholder="e.g. MP260927.1010.A1" />}
          </Field>
        </>
      )}
      {outcome && (
        <Field label="Explain the decision (the buyer and seller see this)" error={fields.note}>
          {(id) => (
            <textarea
              id={id}
              rows={3}
              value={note}
              onChange={(e) => { setNote(e.target.value); clear("note"); }}
              aria-invalid={!!fields.note || undefined}
              className={`${inputClass} h-auto resize-none py-3`}
              placeholder="e.g. The photo shows the case was cracked on arrival, so we refunded one radio."
            />
          )}
        </Field>
      )}
      {error && (!Object.keys(fields).length ? <Alert>{error}</Alert> : <Alert>Please fix the fields marked in red.</Alert>)}
      {outcome && (
        <div>
          <Button busy={busy} onClick={submit}>
            Decide — {DISPUTE_OUTCOME_LABEL[outcome].toLowerCase()}
          </Button>
        </div>
      )}
    </div>
  );
}
