"use client";

import { useCallback, useEffect, useState } from "react";
import {
  formatLD,
  parseLD,
  PAYOUT_METHOD_LABEL,
  PAYOUT_SCHEDULE_LABEL,
  type OwedPeriod,
  type PayoutSchedule,
  type RiderEarningEntry,
  type RiderEarnings,
  type ShopBalance,
  type MomoSendInfo,
  type MomoSendResult,
  type WalletEntry,
} from "@yanabuy/shared";
import { Alert, Avatar, Badge, Button, Field, TextInput, inputClass, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { EmptyPanel, PillTabs, Tile } from "@/components/bits";
import { api } from "@/lib/api";
import { when, whenTime } from "@/lib/labels";

const PERIODS: { value: OwedPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];
const SCHEDULES = Object.keys(PAYOUT_SCHEDULE_LABEL) as PayoutSchedule[];

export default function OwedPage() {
  const [tab, setTab] = useState<"shops" | "riders">("shops");
  const [period, setPeriod] = useState<OwedPeriod>("month");
  const [shops, setShops] = useState<ShopBalance[] | null>(null);
  const [riders, setRiders] = useState<RiderEarnings[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.admin
      .owedShops(period)
      .then((r) => setShops(r.items))
      .catch((err) => setError(messageOf(err)));
    api.admin
      .owedRiders(period)
      .then((r) => setRiders(r.items))
      .catch((err) => setError(messageOf(err)));
  }, [period]);
  useEffect(load, [load]);

  const shopsOwed = (shops ?? []).reduce((n, s) => n + Math.max(0, s.balance) + s.requested, 0);
  const ridersOwed = (riders ?? []).reduce((n, r) => n + Math.max(0, r.owed), 0);
  const due = (shops ?? []).filter((s) => s.due).length;

  return (
    <AdminShell
      title="Who we owe"
      subtitle="Sales by shop and restaurant, what YanaBuy owes each of them and each rider, and a record of every payment sent."
    >
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        <Stat label="Owed to shops & restaurants" value={shops ? formatLD(shopsOwed) : "–"} note={due ? `${due} due for payment now` : "Nobody due right now"} />
        <Stat label="Owed to riders" value={riders ? formatLD(ridersOwed) : "–"} note="Full delivery fee of each delivered trip" />
        <Stat
          label={`Riders' trips — ${PERIODS.find((p) => p.value === period)!.label.toLowerCase()}`}
          value={riders ? String(riders.reduce((n, r) => n + r.period.trips, 0)) : "–"}
          note={riders ? `${formatLD(riders.reduce((n, r) => n + r.period.earned, 0))} earned` : ""}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <PillTabs
          label="Who"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "shops", label: "Shops & restaurants", count: due },
            { value: "riders", label: "Riders" },
          ]}
        />
        <PillTabs label="Period" value={period} onChange={setPeriod} tabs={PERIODS} />
      </div>

      <div className="mt-4">
        {tab === "shops" ? <ShopsTab items={shops} onChanged={load} /> : <RidersTab items={riders} onChanged={load} />}
      </div>
    </AdminShell>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-line bg-white p-[18px]">
      <span className="text-[12.5px] font-semibold text-muted">{label}</span>
      <span className="font-display text-[24px] font-extrabold">{value}</span>
      <span className="text-xs font-semibold text-muted">{note}</span>
    </div>
  );
}

// ─── Shops & restaurants ───────────────────────────────────────────────────

function ShopsTab({ items, onChanged }: { items: ShopBalance[] | null; onChanged: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items?.find((s) => s.shop.id === selectedId) ?? null;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="overflow-x-auto rounded-[20px] border border-line bg-white" aria-label="Shops and restaurants">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="text-[11.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-bold">Shop</th>
              <th className="px-3 py-3 text-right font-bold">Orders</th>
              <th className="px-3 py-3 text-right font-bold">Buyers paid</th>
              <th className="px-3 py-3 text-right font-bold">Commission</th>
              <th className="px-3 py-3 text-right font-bold">Shop earned</th>
              <th className="px-3 py-3 text-right font-bold">Paid out</th>
              <th className="px-3 py-3 text-right font-bold">Owed now</th>
              <th className="px-4 py-3 font-bold">Pay</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((b) => {
              const owed = b.balance + b.requested;
              return (
                <tr
                  key={b.shop.id}
                  onClick={() => setSelectedId(b.shop.id)}
                  className={`cursor-pointer border-t border-line hover:bg-[#FBF9FC] ${selectedId === b.shop.id ? "bg-purple-tint/60" : ""}`}
                >
                  <td className="px-4 py-3">
                    <button type="button" className="flex items-center gap-2.5 text-left" onClick={() => setSelectedId(b.shop.id)}>
                      <Tile name={b.shop.name} url={b.shop.logoUrl} size={34} />
                      <span>
                        <span className="block font-bold">{b.shop.name}</span>
                        <span className="text-xs text-muted">
                          {b.shop.kind === "restaurant" ? "Restaurant" : "Shop"} · {b.owner}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right">{b.period.orders}</td>
                  <td className="px-3 py-3 text-right">{formatLD(b.period.sales)}</td>
                  <td className="px-3 py-3 text-right text-purple">{formatLD(b.period.commission)}</td>
                  <td className="px-3 py-3 text-right">{formatLD(b.period.earned)}</td>
                  <td className="px-3 py-3 text-right">{formatLD(b.period.paidOut)}</td>
                  <td className={`px-3 py-3 text-right font-bold ${owed < 0 ? "text-danger" : ""}`}>
                    {owed < 0 ? `They owe ${formatLD(-owed)}` : formatLD(owed)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-col items-start gap-1">
                      <span className="text-xs text-muted">{PAYOUT_SCHEDULE_LABEL[b.schedule]}</span>
                      {b.requested > 0 ? <Badge tone="warn">Asked for {formatLD(b.requested)}</Badge> : b.due ? <Badge tone="warn">Due now</Badge> : null}
                    </span>
                  </td>
                </tr>
              );
            })}
            {items?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-muted">
                  No open shops or restaurants yet.
                </td>
              </tr>
            )}
            {!items && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      {selected ? (
        <ShopPanel key={selected.shop.id} b={selected} onChanged={onChanged} />
      ) : (
        <EmptyPanel>Pick a shop or restaurant to set how often it&rsquo;s paid, record a payment, or see every sale and payout.</EmptyPanel>
      )}
    </div>
  );
}

const ENTRY_LABEL: Record<WalletEntry["type"], string> = {
  sale: "Sale",
  payout: "Paid out",
  payout_returned: "Payout refused — returned",
  adjustment: "Correction",
  refund: "Refund to buyer",
};

/** Loaded once per page: is "Send by MoMo" set up, and what's the most one send can be? */
let momoInfo: Promise<MomoSendInfo> | null = null;
function useMomoInfo() {
  const [info, setInfo] = useState<MomoSendInfo | null>(null);
  useEffect(() => {
    momoInfo ??= api.admin.momoSendInfo();
    momoInfo.then(setInfo).catch(() => {
      momoInfo = null;
    });
  }, []);
  return info;
}

/** Send money straight from YanaBuy's MTN wallet; it's recorded by itself. */
function MomoSend({
  to,
  owed,
  blocked,
  send,
  onDone,
}: {
  to: { name: string; phone: string } | null;
  owed: number;
  /** Why it can't be used for this person (e.g. they're paid by Orange Money). */
  blocked?: string | null;
  send: (cents: number) => Promise<MomoSendResult>;
  onDone: () => void;
}) {
  const info = useMomoInfo();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MomoSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (info && owed > 0) setAmount(String(Math.min(owed, info.cap || owed) / 100));
  }, [info, owed]);

  if (!info) return null;
  if (!info.configured)
    return <p className="text-xs text-muted">Send by MoMo isn&rsquo;t set up yet — add the MTN Disbursements keys to the server settings to pay from here.</p>;
  if (info.cap <= 0) return <p className="text-xs text-muted">Send by MoMo is switched off (limit $0 in Money → Commission &amp; payouts).</p>;
  const test = info.environment === "sandbox";

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!to) return;
    const cents = parseLD(amount);
    setResult(null);
    if (!cents) return setError("Enter the amount to send, e.g. 150");
    if (cents > owed) return setError(`They're owed ${formatLD(owed)} — you can't send more than that`);
    if (cents > info!.cap) return setError(`That's over the ${formatLD(info!.cap)} limit for one send. Send it by hand and record it below.`);
    const warn = test ? "\n\n(Test mode — MTN sandbox, no real money.)" : "\n\nThis sends REAL money from YanaBuy's MTN wallet.";
    if (!confirm(`Send ${formatLD(cents)} by MTN MoMo to ${to.name} (${to.phone})?${warn}`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await send(cents);
      setResult(r);
      if (r.status !== "failed") setAmount("");
      onDone();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={go} className="flex flex-col gap-3 rounded-2xl border border-line p-4" noValidate>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-bold">Send by MTN MoMo</p>
        {test && <Badge>Test mode</Badge>}
      </div>
      {blocked ? (
        <p className="text-[13px] text-muted">{blocked}</p>
      ) : (
        <>
          <p className="text-[13px]">
            Sends straight from YanaBuy&rsquo;s MTN wallet to <strong>{to?.name}</strong> · {to?.phone} and records it with MTN&rsquo;s transaction ID. Up to {formatLD(info.cap)} at a time.
          </p>
          <div className="flex gap-2">
            <TextInput aria-label="Amount to send ($)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount $" className="max-w-[140px]" />
            <Button type="submit" size="sm" busy={busy} disabled={!to || owed <= 0}>
              Send by MoMo
            </Button>
          </div>
        </>
      )}
      {result && <Alert tone={result.status === "successful" ? "success" : result.status === "pending" ? "warn" : undefined}>{result.message}</Alert>}
      {error && <Alert>{error}</Alert>}
    </form>
  );
}

function ShopPanel({ b, onChanged }: { b: ShopBalance; onChanged: () => void }) {
  const [wallet, setWallet] = useState<{ balance: number; entries: WalletEntry[] } | null>(null);
  const [schedule, setSchedule] = useState<PayoutSchedule>(b.schedule);
  const [amount, setAmount] = useState(b.balance > 0 ? String(b.balance / 100) : "");
  const [reference, setReference] = useState("");
  const [fix, setFix] = useState({ amount: "", note: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWallet = useCallback(() => {
    api.admin
      .shopWallet(b.shop.id)
      .then(setWallet)
      .catch((err) => setError(messageOf(err)));
  }, [b.shop.id]);
  useEffect(loadWallet, [loadWallet]);

  async function run(what: string, fn: () => Promise<void>) {
    setBusy(what);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  const saveSchedule = (next: PayoutSchedule) =>
    run("schedule", async () => {
      setSchedule(next);
      await api.admin.setPayoutSchedule(b.shop.id, next);
      setNotice(`${b.shop.name} is now paid: ${PAYOUT_SCHEDULE_LABEL[next].toLowerCase()}.`);
      onChanged();
    });

  const pay = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseLD(amount);
    if (!cents) return setError("Enter the amount you sent, e.g. 150");
    if (reference.trim().length < 3) return setError("Enter the mobile money transaction ID");
    if (!confirm(`Record ${formatLD(cents)} sent to ${b.payoutDetails?.name} (${b.payoutDetails?.phone})?`)) return;
    void run("pay", async () => {
      await api.admin.payShop(b.shop.id, cents, reference.trim());
      setNotice(`Recorded ${formatLD(cents)} paid to ${b.shop.name}. They've been told.`);
      setReference("");
      setAmount("");
      loadWallet();
      onChanged();
    });
  };

  const correct = (e: React.FormEvent) => {
    e.preventDefault();
    const neg = fix.amount.trim().startsWith("-");
    const cents = parseLD(fix.amount.replace("-", ""));
    if (!cents) return setError("Enter an amount, e.g. 500 or -500");
    void run("fix", async () => {
      setWallet(await api.admin.adjustWallet(b.shop.id, neg ? -cents : cents, fix.note));
      setFix({ amount: "", note: "" });
      onChanged();
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-5" aria-label={`${b.shop.name} payments`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-extrabold">{b.shop.name}</p>
          <p className="text-xs text-muted">Last paid: {b.lastPaidAt ? when(b.lastPaidAt) : "never"}</p>
        </div>
        <div className="text-right">
          <p className="text-[11.5px] font-semibold text-muted">Owed now</p>
          <p className={`font-display text-xl font-extrabold ${b.balance < 0 ? "text-danger" : ""}`}>{formatLD(wallet?.balance ?? b.balance)}</p>
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <Field label="How often we pay them">
        {(id) => (
          <select id={id} className={inputClass} value={schedule} disabled={busy === "schedule"} onChange={(e) => saveSchedule(e.target.value as PayoutSchedule)}>
            {SCHEDULES.map((s) => (
              <option key={s} value={s}>
                {PAYOUT_SCHEDULE_LABEL[s]}
              </option>
            ))}
          </select>
        )}
      </Field>

      {b.requested > 0 && (
        <Alert tone="warn">
          {b.shop.name} asked for a payout of {formatLD(b.requested)}. Handle it on the Payouts page (it&rsquo;s already taken off what they&rsquo;re owed here).
        </Alert>
      )}

      <MomoSend
        to={b.payoutDetails ? { name: b.payoutDetails.name, phone: b.payoutDetails.phone } : null}
        owed={wallet?.balance ?? b.balance}
        blocked={
          !b.payoutDetails
            ? "No mobile money details yet — ask them to add them under Earnings in the app."
            : b.payoutDetails.method !== "mtn_momo"
              ? "They get paid by Orange Money — send it by hand and record it below."
              : null
        }
        send={(cents) => api.admin.sendShopMomo(b.shop.id, cents)}
        onDone={() => {
          loadWallet();
          onChanged();
        }}
      />

      <form onSubmit={pay} className="flex flex-col gap-3 rounded-2xl bg-ground p-4" noValidate>
        <p className="text-[13px] font-bold">Record a payment</p>
        {b.payoutDetails ? (
          <p className="text-[13px]">
            Send to <strong>{b.payoutDetails.name}</strong> · {b.payoutDetails.phone} ({PAYOUT_METHOD_LABEL[b.payoutDetails.method]})
          </p>
        ) : (
          <p className="text-[13px] text-danger">No mobile money details yet — ask them to add them under Earnings in the app.</p>
        )}
        <div className="grid grid-cols-[120px_1fr] gap-2">
          <TextInput aria-label="Amount sent ($)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount $" />
          <TextInput aria-label="Transaction ID" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="MoMo transaction ID" />
        </div>
        <p className="text-xs text-muted">Paid by hand instead? Send the money from YanaBuy&rsquo;s mobile money first, then record it here with the transaction ID.</p>
        <div>
          <Button type="submit" size="sm" busy={busy === "pay"} disabled={!b.payoutDetails || b.balance <= 0}>
            Record payment
          </Button>
        </div>
      </form>

      <div>
        <p className="mb-1 text-[13px] font-bold">Sales and payments</p>
        <ul className="flex max-h-[300px] flex-col overflow-y-auto">
          {wallet?.entries.map((e) => (
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
          {wallet?.entries.length === 0 && <li className="py-4 text-center text-sm text-muted">Nothing yet.</li>}
        </ul>
      </div>

      <form onSubmit={correct} className="flex flex-col gap-2 border-t border-line pt-3" noValidate>
        <p className="text-[13px] font-bold">Correct the balance</p>
        <div className="grid grid-cols-[120px_1fr] gap-2">
          <TextInput aria-label="Amount" value={fix.amount} onChange={(e) => setFix({ ...fix, amount: e.target.value })} placeholder="500 or -500" />
          <TextInput aria-label="Reason" value={fix.note} onChange={(e) => setFix({ ...fix, note: e.target.value })} placeholder="Reason (the seller sees this)" />
        </div>
        <div>
          <Button type="submit" size="sm" variant="outline" busy={busy === "fix"} disabled={!fix.amount.trim() || fix.note.trim().length < 3}>
            Save correction
          </Button>
        </div>
      </form>
    </section>
  );
}

// ─── Riders ────────────────────────────────────────────────────────────────

function RidersTab({ items, onChanged }: { items: RiderEarnings[] | null; onChanged: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items?.find((r) => r.rider.id === selectedId) ?? null;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="overflow-x-auto rounded-[20px] border border-line bg-white" aria-label="Riders">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="text-[11.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-bold">Rider</th>
              <th className="px-3 py-3 text-right font-bold">Today</th>
              <th className="px-3 py-3 text-right font-bold">Trips</th>
              <th className="px-3 py-3 text-right font-bold">Earned</th>
              <th className="px-3 py-3 text-right font-bold">Paid out</th>
              <th className="px-4 py-3 text-right font-bold">Owed now</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((r) => (
              <tr
                key={r.rider.id}
                onClick={() => setSelectedId(r.rider.id)}
                className={`cursor-pointer border-t border-line hover:bg-[#FBF9FC] ${selectedId === r.rider.id ? "bg-purple-tint/60" : ""}`}
              >
                <td className="px-4 py-3">
                  <button type="button" className="flex items-center gap-2.5 text-left" onClick={() => setSelectedId(r.rider.id)}>
                    <Avatar name={r.rider.fullName} url={r.rider.avatarUrl} size={34} />
                    <span>
                      <span className="block font-bold">{r.rider.fullName}</span>
                      <span className="text-xs text-muted">{r.rider.phone ?? "No phone"}</span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-3 text-right">
                  {r.today.trips} {r.today.trips === 1 ? "trip" : "trips"} · {formatLD(r.today.earned)}
                </td>
                <td className="px-3 py-3 text-right">{r.period.trips}</td>
                <td className="px-3 py-3 text-right">{formatLD(r.period.earned)}</td>
                <td className="px-3 py-3 text-right">{formatLD(r.period.paidOut)}</td>
                <td className="px-4 py-3 text-right font-bold">{formatLD(r.owed)}</td>
              </tr>
            ))}
            {items?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted">
                  No riders yet.
                </td>
              </tr>
            )}
            {!items && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      {selected ? (
        <RiderPanel key={selected.rider.id} r={selected} onChanged={onChanged} />
      ) : (
        <EmptyPanel>Pick a rider to see each trip and record the delivery pay you sent them.</EmptyPanel>
      )}
    </div>
  );
}

const RIDER_ENTRY_LABEL: Record<RiderEarningEntry["type"], string> = { trip: "Trip", payout: "Paid", adjustment: "Correction" };

function RiderPanel({ r, onChanged }: { r: RiderEarnings; onChanged: () => void }) {
  const [data, setData] = useState<{ owed: number; entries: RiderEarningEntry[] } | null>(null);
  const [amount, setAmount] = useState(r.owed > 0 ? String(r.owed / 100) : "");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .riderEarnings(r.rider.id)
      .then(setData)
      .catch((err) => setError(messageOf(err)));
  }, [r.rider.id]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseLD(amount);
    if (!cents) return setError("Enter the amount you sent, e.g. 25");
    if (reference.trim().length < 3) return setError("Enter the mobile money transaction ID");
    if (!confirm(`Record ${formatLD(cents)} sent to ${r.rider.fullName} (${r.rider.phone ?? "no phone"})?`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setData(await api.admin.payRider(r.rider.id, cents, reference.trim()));
      setNotice(`Recorded ${formatLD(cents)} paid to ${r.rider.fullName}. They've been told.`);
      setAmount("");
      setReference("");
      onChanged();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const owed = data?.owed ?? r.owed;
  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-5" aria-label={`${r.rider.fullName} pay`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-extrabold">{r.rider.fullName}</p>
          <p className="text-xs text-muted">Last paid: {r.lastPaidAt ? when(r.lastPaidAt) : "never"}</p>
        </div>
        <div className="text-right">
          <p className="text-[11.5px] font-semibold text-muted">Owed now</p>
          <p className="font-display text-xl font-extrabold">{formatLD(owed)}</p>
        </div>
      </div>
      <p className="text-[13px] text-soft">
        Today: {r.today.trips} {r.today.trips === 1 ? "trip" : "trips"}, {formatLD(r.today.earned)} earned.
      </p>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <MomoSend
        to={r.rider.phone ? { name: r.rider.fullName, phone: r.rider.phone } : null}
        owed={owed}
        blocked={r.rider.phone ? null : "They have no phone number on their account — pay by hand and record it below."}
        send={(cents) => api.admin.sendRiderMomo(r.rider.id, cents)}
        onDone={() => {
          api.admin.riderEarnings(r.rider.id).then(setData).catch(() => {});
          onChanged();
        }}
      />

      <form onSubmit={pay} className="flex flex-col gap-3 rounded-2xl bg-ground p-4" noValidate>
        <p className="text-[13px] font-bold">Record a payment</p>
        <p className="text-[13px]">Send to {r.rider.phone ?? "their phone number"} (the number they log in with), unless they gave you another.</p>
        <div className="grid grid-cols-[120px_1fr] gap-2">
          <TextInput aria-label="Amount sent ($)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount $" />
          <TextInput aria-label="Transaction ID" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="MoMo transaction ID" />
        </div>
        <div>
          <Button type="submit" size="sm" busy={busy} disabled={owed <= 0}>
            Record payment
          </Button>
        </div>
      </form>

      <div>
        <p className="mb-1 text-[13px] font-bold">Trips and payments</p>
        <ul className="flex max-h-[340px] flex-col overflow-y-auto">
          {data?.entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 border-t border-line py-2 text-[13px] first:border-t-0">
              <span>
                <span className="block font-semibold">
                  {RIDER_ENTRY_LABEL[e.type]} {e.orderNumber ?? ""}
                </span>
                <span className="text-xs text-muted">
                  {whenTime(e.createdAt)}
                  {e.reference ? ` · ${e.reference}` : ""}
                </span>
              </span>
              <span className={`font-bold ${e.amount < 0 ? "text-danger" : "text-success"}`}>
                {e.amount < 0 ? "−" : "+"}
                {formatLD(Math.abs(e.amount))}
              </span>
            </li>
          ))}
          {data?.entries.length === 0 && <li className="py-4 text-center text-sm text-muted">No trips yet.</li>}
        </ul>
      </div>
    </section>
  );
}
