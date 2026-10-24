"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatLD, parseLD, type FinanceSettings, type MoneyOverview, type RiderCash } from "@yanabuy/shared";
import { Alert, Avatar, Button, Field, TextInput, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";

export default function MoneyPage() {
  const [overview, setOverview] = useState<MoneyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api.admin
      .money()
      .then((r) => setOverview(r.overview))
      .catch((err) => setError(messageOf(err)));
  }, []);
  useEffect(load, [load]);

  const card = (label: string, value: number | undefined, note: string) => (
    <div className="flex flex-col gap-1.5 rounded-card border border-line bg-white p-[18px]">
      <span className="text-[12.5px] font-semibold text-muted">{label}</span>
      <span className="font-display text-[24px] font-extrabold">{value === undefined ? "–" : formatLD(value)}</span>
      <span className="text-xs font-semibold text-muted">{note}</span>
    </div>
  );

  return (
    <AdminShell title="Money" subtitle="What came in this month, what YanaBuy earned, and what's owed.">
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {card("Sales this month", overview?.salesThisMonth, "Items delivered, what buyers paid (commission included)")}
        {card("YanaBuy commission", overview?.commissionThisMonth, `Added on top of sellers' prices · − ${overview ? formatLD(overview.discountsThisMonth) : "–"} discount codes`)}
        {card("Owed to sellers", overview?.owedToSellers, overview ? `${formatLD(overview.paidOutThisMonth)} paid out this month` : "")}
        {card("Owed to riders", overview?.owedToRiders, overview ? `${formatLD(overview.deliveryFeesThisMonth)} delivery fees this month — all go to riders` : "")}
      </div>
      <Link href="/owed" className="mt-4 flex items-center justify-between rounded-card border border-line bg-white px-5 py-4 font-bold hover:bg-[#FBF9FC]">
        <span>Sales by shop, what each shop, restaurant and rider is owed, and paying them</span>
        <span className="text-purple">Who we owe →</span>
      </Link>
      {overview && overview.payoutsWaiting.count > 0 && (
        <Link href="/payouts" className="mt-4 flex items-center justify-between rounded-card border border-amber bg-amber-tint px-5 py-4 font-bold hover:brightness-95">
          <span>
            {overview.payoutsWaiting.count} {overview.payoutsWaiting.count === 1 ? "payout is" : "payouts are"} waiting — {formatLD(overview.payoutsWaiting.amount)}
          </span>
          <span className="text-purple">Open payouts →</span>
        </Link>
      )}

      <div className="mt-6 grid items-start gap-5 xl:grid-cols-2">
        <RiderCashSection onChanged={load} />
        <FinanceSection />
      </div>
    </AdminShell>
  );
}

function RiderCashSection({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<RiderCash[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.admin
      .riderCash()
      .then((r) => setItems(r.items))
      .catch((err) => setError(messageOf(err)));
  }, []);
  useEffect(load, [load]);

  async function received(r: RiderCash) {
    if (!confirm(`Did ${r.rider.fullName} hand you ${formatLD(r.amount)}?`)) return;
    setBusy(r.rider.id);
    try {
      const res = await api.admin.cashReceived(
        r.rider.id,
        r.orders.map((o) => o.id)
      );
      setNotice(`Recorded ${formatLD(res.received)} from ${r.rider.fullName}.`);
      load();
      onChanged();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-white p-5" aria-label="Cash from riders">
      <div>
        <h2 className="font-display text-lg font-extrabold">Cash from riders</h2>
        <p className="text-[12.5px] text-muted">Cash-on-delivery money each rider is holding. Record it when they hand it in.</p>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
      {items?.map((r) => (
        <div key={r.rider.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-ground p-3">
          <Avatar name={r.rider.fullName} url={r.rider.avatarUrl} size={40} />
          <div className="min-w-0 flex-1">
            <p className="font-bold">{r.rider.fullName}</p>
            <p className="text-[12.5px] text-muted">
              {r.orders.length} {r.orders.length === 1 ? "delivery" : "deliveries"} · {r.orders.map((o) => o.number).join(", ")}
            </p>
          </div>
          <span className="font-display text-lg font-extrabold">{formatLD(r.amount)}</span>
          <Button size="sm" variant="success" busy={busy === r.rider.id} onClick={() => received(r)}>
            Cash received
          </Button>
        </div>
      ))}
      {items?.length === 0 && <p className="py-4 text-center text-sm text-muted">No cash waiting — every rider has handed in.</p>}
    </section>
  );
}

function FinanceSection() {
  const [form, setForm] = useState<{ goods: string; food: string; pickup: string; min: string; cap: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .finance()
      .then((r) => setForm({ goods: String(r.finance.goodsCommission), food: String(r.finance.foodCommission), pickup: String(r.finance.pickupCommission), min: String(r.finance.minPayout / 100), cap: String((r.finance.maxMomoSend ?? 50000) / 100) }))
      .catch((err) => setError(messageOf(err)));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const input: FinanceSettings = { goodsCommission: Number(form.goods), foodCommission: Number(form.food), pickupCommission: Number(form.pickup), minPayout: parseLD(form.min) ?? 0, maxMomoSend: form.cap.trim() === "0" ? 0 : (parseLD(form.cap) ?? 0) };
    if ([input.goodsCommission, input.foodCommission, input.pickupCommission].some((n) => !Number.isFinite(n))) return setError("Commission must be a number, e.g. 10");
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.admin.saveFinance(input);
      setNotice("Saved. Buyer prices update straight away; orders already placed keep the commission they were placed with.");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-5" noValidate aria-label="Commission">
      <div>
        <h2 className="font-display text-lg font-extrabold">Commission & payouts</h2>
        <p className="text-[12.5px] text-muted">
          Added on top of each seller&rsquo;s price, so buyers see one price and sellers get their full price. Delivery fees go to the riders.
        </p>
      </div>
      {!form ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Shops, added to price (%)">{(id) => <TextInput id={id} inputMode="decimal" value={form.goods} onChange={(e) => setForm({ ...form, goods: e.target.value })} />}</Field>
          <Field label="Restaurants — delivery (%)">{(id) => <TextInput id={id} inputMode="decimal" value={form.food} onChange={(e) => setForm({ ...form, food: e.target.value })} />}</Field>
          <Field label="Restaurants — pickup (%)" hint="Eat-in has no commission: buyers see the restaurant's own price.">
            {(id) => <TextInput id={id} inputMode="decimal" value={form.pickup} onChange={(e) => setForm({ ...form, pickup: e.target.value })} />}
          </Field>
          <Field label="Smallest payout ($)">{(id) => <TextInput id={id} inputMode="decimal" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} />}</Field>
          <Field label="Most one “Send by MoMo” can be ($)" hint="Bigger payouts must be sent by hand and recorded. 0 switches the button off.">
            {(id) => <TextInput id={id} inputMode="decimal" value={form.cap} onChange={(e) => setForm({ ...form, cap: e.target.value })} />}
          </Field>
        </div>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
      <div>
        <Button type="submit" busy={busy} disabled={!form}>
          Save
        </Button>
      </div>
    </form>
  );
}
