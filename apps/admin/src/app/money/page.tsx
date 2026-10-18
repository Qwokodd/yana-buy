"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatLD, parseLD, type FinanceSettings, type MoneyOverview, type RiderCash, type ShopBalance, type WalletEntry } from "@yanabuy/shared";
import { Alert, Avatar, Button, Field, TextInput, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { EmptyPanel, Tile } from "@/components/bits";
import { api } from "@/lib/api";
import { whenTime } from "@/lib/labels";

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
        {card("Sales this month", overview?.salesThisMonth, "Items delivered, before commission")}
        {card("YanaBuy commission", overview?.commissionThisMonth, `+ ${overview ? formatLD(overview.deliveryFeesThisMonth) : "–"} delivery fees · − ${overview ? formatLD(overview.discountsThisMonth) : "–"} discount codes`)}
        {card("Owed to sellers", overview?.owedToSellers, overview ? `${formatLD(overview.paidOutThisMonth)} paid out this month` : "")}
        {card("Cash with riders", overview?.cashWithRiders, "Collected, not handed in yet")}
      </div>
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
      <div className="mt-5">
        <Balances onChanged={load} />
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
  const [form, setForm] = useState<{ goods: string; food: string; min: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .finance()
      .then((r) => setForm({ goods: String(r.finance.goodsCommission), food: String(r.finance.foodCommission), min: String(r.finance.minPayout / 100) }))
      .catch((err) => setError(messageOf(err)));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const input: FinanceSettings = { goodsCommission: Number(form.goods), foodCommission: Number(form.food), minPayout: parseLD(form.min) ?? 0 };
    if ([input.goodsCommission, input.foodCommission].some((n) => !Number.isFinite(n))) return setError("Commission must be a number, e.g. 10");
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.admin.saveFinance(input);
      setNotice("Saved. New commission applies to orders delivered from now on.");
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
        <p className="text-[12.5px] text-muted">YanaBuy keeps this share of the item price when an order is delivered. Delivery fees are YanaBuy's too.</p>
      </div>
      {!form ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Shops (%)">{(id) => <TextInput id={id} inputMode="decimal" value={form.goods} onChange={(e) => setForm({ ...form, goods: e.target.value })} />}</Field>
          <Field label="Restaurants (%)">{(id) => <TextInput id={id} inputMode="decimal" value={form.food} onChange={(e) => setForm({ ...form, food: e.target.value })} />}</Field>
          <Field label="Smallest payout ($)">{(id) => <TextInput id={id} inputMode="decimal" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} />}</Field>
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

function Balances({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<ShopBalance[] | null>(null);
  const [selected, setSelected] = useState<ShopBalance | null>(null);
  const load = useCallback(() => {
    api.admin
      .balances()
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
      <section className="overflow-hidden rounded-[20px] border border-line bg-white" aria-label="Seller balances">
        <div className="px-5 pt-5">
          <h2 className="font-display text-lg font-extrabold">Seller balances</h2>
          <p className="text-[12.5px] text-muted">What each shop has earned and not taken out yet.</p>
        </div>
        <table className="mt-3 w-full text-left text-[13.5px]">
          <tbody>
            {items?.map((b) => (
              <tr key={b.shop.id} onClick={() => setSelected(b)} className={`cursor-pointer border-t border-line hover:bg-[#FBF9FC] ${selected?.shop.id === b.shop.id ? "bg-purple-tint/60" : ""}`}>
                <td className="px-5 py-3">
                  <button className="flex items-center gap-2.5 text-left" onClick={() => setSelected(b)}>
                    <Tile name={b.shop.name} url={b.shop.logoUrl} size={34} />
                    <span>
                      <span className="block font-bold">{b.shop.name}</span>
                      <span className="text-xs text-muted">{b.owner}</span>
                    </span>
                  </button>
                </td>
                <td className="px-5 py-3 text-right font-bold">{formatLD(b.balance)}</td>
              </tr>
            ))}
            {items?.length === 0 && (
              <tr>
                <td className="px-5 py-8 text-center text-muted">No open shops yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      {selected ? (
        <ShopWallet
          key={selected.shop.id}
          balance={selected}
          onChanged={() => {
            load();
            onChanged();
          }}
        />
      ) : (
        <EmptyPanel>Pick a shop to see every sale and payout, or to correct its balance.</EmptyPanel>
      )}
    </div>
  );
}

const ENTRY_LABEL: Record<WalletEntry["type"], string> = { sale: "Sale", payout: "Payout", payout_returned: "Payout refused — returned", adjustment: "Correction", refund: "Refund to buyer" };

function ShopWallet({ balance, onChanged }: { balance: ShopBalance; onChanged: () => void }) {
  const [data, setData] = useState<{ balance: number; entries: WalletEntry[] } | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .shopWallet(balance.shop.id)
      .then(setData)
      .catch((err) => setError(messageOf(err)));
  }, [balance.shop.id]);

  async function adjust(e: React.FormEvent) {
    e.preventDefault();
    const neg = amount.trim().startsWith("-");
    const cents = parseLD(amount.replace("-", ""));
    if (!cents) return setError("Enter an amount, e.g. 500 or -500");
    setBusy(true);
    setError(null);
    try {
      setData(await api.admin.adjustWallet(balance.shop.id, neg ? -cents : cents, note));
      setAmount("");
      setNote("");
      onChanged();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-white p-5" aria-label={`${balance.shop.name} wallet`}>
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-extrabold">{balance.shop.name}</p>
        <p className="font-display text-xl font-extrabold">{data ? formatLD(data.balance) : "…"}</p>
      </div>
      <ul className="flex max-h-[320px] flex-col overflow-y-auto">
        {data?.entries.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 border-t border-line py-2 text-[13px] first:border-t-0">
            <span>
              <span className="block font-semibold">
                {ENTRY_LABEL[e.type]} {e.orderNumber ?? e.payoutNumber ?? ""}
              </span>
              <span className="text-xs text-muted">
                {whenTime(e.createdAt)}
                {e.note ? ` · ${e.note}` : ""}
              </span>
            </span>
            <span className={`font-bold ${e.amount < 0 ? "text-danger" : "text-success"}`}>
              {e.amount < 0 ? "−" : "+"}
              {formatLD(Math.abs(e.amount))}
            </span>
          </li>
        ))}
        {data?.entries.length === 0 && <li className="py-4 text-center text-sm text-muted">Nothing yet.</li>}
      </ul>
      <form onSubmit={adjust} className="flex flex-col gap-2 border-t border-line pt-3" noValidate>
        <p className="text-[13px] font-bold">Correct the balance</p>
        <div className="grid grid-cols-[120px_1fr] gap-2">
          <TextInput aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500 or -500" />
          <TextInput aria-label="Reason" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (the seller sees this)" />
        </div>
        {error && <Alert>{error}</Alert>}
        <div>
          <Button type="submit" size="sm" variant="outline" busy={busy} disabled={!amount.trim() || note.trim().length < 3}>
            Save correction
          </Button>
        </div>
      </form>
    </section>
  );
}
