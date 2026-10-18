"use client";

import { useCallback, useEffect, useState } from "react";
import { formatLD, formatLiberianPhone, PAYOUT_METHOD_LABEL, type Payout } from "@yanabuy/shared";
import { Alert, Badge, Button, TextInput, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { PillTabs, Tile } from "@/components/bits";
import { api } from "@/lib/api";
import { whenTime } from "@/lib/labels";

type Tab = "requested" | "paid" | "rejected";

export default function PayoutsPage() {
  const [tab, setTab] = useState<Tab>("requested");
  const [items, setItems] = useState<Payout[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setItems(null);
    api.admin
      .payouts(tab)
      .then((res) => setItems(res.items))
      .catch((err) => setError(messageOf(err)));
  }, [tab]);
  useEffect(load, [load]);

  const total = (items ?? []).reduce((n, p) => n + p.amount, 0);

  return (
    <AdminShell title="Payouts" subtitle="Sellers asking for their money. Send it by mobile money, then record the transaction ID here.">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PillTabs
          label="Show"
          tabs={[
            { value: "requested", label: "Waiting" },
            { value: "paid", label: "Paid" },
            { value: "rejected", label: "Refused" },
          ]}
          value={tab}
          onChange={(v) => {
            setTab(v);
            setNotice(null);
          }}
        />
        {tab === "requested" && items && items.length > 0 && (
          <span className="text-sm font-semibold text-soft">
            {items.length} waiting · {formatLD(total)} to send
          </span>
        )}
      </div>
      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      <div className="flex max-w-4xl flex-col gap-3">
        {items === null && !error && <p className="text-sm text-muted">Loading…</p>}
        {items?.length === 0 && (
          <div className="rounded-card border border-line bg-white px-6 py-12 text-center text-sm text-muted">
            {tab === "requested" ? "No payouts waiting." : "Nothing here yet."}
          </div>
        )}
        {items?.map((p) => (
          <PayoutRow
            key={p.id}
            payout={p}
            onDone={(msg) => {
              setNotice(msg);
              setItems((prev) => (prev ?? []).filter((x) => x.id !== p.id));
            }}
          />
        ))}
      </div>
    </AdminShell>
  );
}

function PayoutRow({ payout: p, onDone }: { payout: Payout; onDone: (msg: string) => void }) {
  const [mode, setMode] = useState<"idle" | "pay" | "refuse">("idle");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "pay") {
        await api.admin.markPayoutPaid(p.id, text);
        onDone(`${p.number} marked as paid — ${formatLD(p.amount)} to ${p.shop.name}.`);
      } else {
        await api.admin.rejectPayout(p.id, text);
        onDone(`${p.number} refused. ${formatLD(p.amount)} is back in ${p.shop.name}'s balance.`);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-5" aria-label={`Payout ${p.number}`}>
      <div className="flex flex-wrap items-center gap-4">
        <Tile name={p.shop.name} url={p.shop.logoUrl} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {p.shop.name} <span className="font-semibold text-muted">· {p.number}</span>
          </p>
          <p className="text-[13px] text-muted">Asked {whenTime(p.createdAt)}</p>
        </div>
        <p className="font-display text-2xl font-extrabold">{formatLD(p.amount)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl bg-ground px-4 py-3 text-sm">
        <span>
          <span className="text-muted">Send by </span>
          <strong>{PAYOUT_METHOD_LABEL[p.method]}</strong>
        </span>
        <span>
          <span className="text-muted">to </span>
          <strong className="font-mono">{formatLiberianPhone(p.accountPhone)}</strong>
        </span>
        <span>
          <span className="text-muted">name </span>
          <strong>{p.accountName}</strong>
        </span>
      </div>
      {p.status === "paid" && (
        <p className="text-sm">
          <Badge tone="success">Paid</Badge> {p.reviewedAt ? whenTime(p.reviewedAt) : ""} · transaction <span className="font-mono">{p.reference}</span>
        </p>
      )}
      {p.status === "rejected" && (
        <p className="text-sm">
          <Badge tone="danger">Refused</Badge> {p.reason}
        </p>
      )}
      {p.status === "requested" &&
        (mode === "idle" ? (
          <div className="flex gap-2">
            <Button variant="success" onClick={() => setMode("pay")}>
              I've sent it — record payment
            </Button>
            <Button variant="ghost" className="text-danger hover:!text-danger" onClick={() => setMode("refuse")}>
              Refuse
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor={`t-${p.id}`} className="text-[13px] font-bold">
              {mode === "pay" ? "Mobile money transaction ID" : "Why? (the seller sees this — the money goes back to their balance)"}
            </label>
            <TextInput id={`t-${p.id}`} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "pay" ? "e.g. MP240927.1234.A56789" : "e.g. The MTN number is wrong"} />
            {error && <Alert>{error}</Alert>}
            <div className="flex gap-2">
              <Button variant={mode === "pay" ? "success" : "danger"} busy={busy} disabled={text.trim().length < 3} onClick={submit}>
                {mode === "pay" ? "Mark as paid" : "Refuse payout"}
              </Button>
              <Button variant="ghost" onClick={() => setMode("idle")}>
                Cancel
              </Button>
            </div>
          </div>
        ))}
    </section>
  );
}
