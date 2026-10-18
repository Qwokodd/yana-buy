"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatLD, formatLiberianPhone, parseLD, PAYOUT_METHOD_LABEL, type PayoutMethod, type Wallet, type WalletEntry } from "@yanabuy/shared";
import { Alert, Badge, Button, Field, TextInput, fieldErrorsOf, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { api } from "@/lib/api";

const ENTRY: Record<WalletEntry["type"], string> = { sale: "Sale", payout: "Payout", payout_returned: "Payout refused — money back", adjustment: "Correction by YanaBuy", refund: "Refund to buyer" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function EarningsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/sell/earnings");
  }, [loading, user, router]);

  const load = useCallback(() => {
    api.shop
      .wallet()
      .then((r) => setWallet(r.wallet))
      .catch((err) => setError(messageOf(err)));
  }, []);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-8 sm:px-8">
        <div>
          <Link href="/sell" className="text-[13px] font-bold text-purple hover:underline">
            ← My shop
          </Link>
          <h1 className="font-display text-[28px] font-extrabold">Earnings</h1>
          {wallet && (
            <p className="text-sm text-muted">
              You get the item price minus YanaBuy&rsquo;s {wallet.commission}% commission when an order is delivered. Delivery fees go to the rider service.
            </p>
          )}
        </div>
        {error && <Alert>{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        {!wallet ? (
          !error && <p className="text-muted">Loading…</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-card bg-ink p-5 text-white sm:col-span-1">
                <p className="text-[13px] font-semibold text-white/70">You can take out</p>
                <p className="font-display text-[32px] font-extrabold">{formatLD(wallet.balance)}</p>
                {wallet.pendingPayouts > 0 && <p className="text-[12.5px] text-amber">{formatLD(wallet.pendingPayouts)} on its way to you</p>}
              </div>
              <div className="rounded-card border border-line bg-white p-5">
                <p className="text-[13px] font-semibold text-muted">Sold this month</p>
                <p className="font-display text-2xl font-extrabold">{formatLD(wallet.salesThisMonth)}</p>
              </div>
              <div className="rounded-card border border-line bg-white p-5">
                <p className="text-[13px] font-semibold text-muted">Earned this month</p>
                <p className="font-display text-2xl font-extrabold">{formatLD(wallet.earnedThisMonth)}</p>
              </div>
            </div>

            <div className="grid items-start gap-5 md:grid-cols-2">
              <PayoutRequest
                wallet={wallet}
                onDone={(msg) => {
                  setNotice(msg);
                  load();
                }}
              />
              <PayoutDetailsForm
                wallet={wallet}
                onSaved={() => {
                  setNotice("Mobile money details saved.");
                  load();
                }}
              />
            </div>

            {wallet.payouts.length > 0 && (
              <section className="rounded-card border border-line bg-white p-5" aria-label="Payouts">
                <h2 className="mb-2 font-display text-lg font-extrabold">Payouts</h2>
                <ul>
                  {wallet.payouts.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3 text-sm first:border-t-0">
                      <span className="flex-1">
                        <span className="block font-bold">
                          {p.number} · {formatLD(p.amount)}
                        </span>
                        <span className="text-muted">
                          {when(p.createdAt)} · {PAYOUT_METHOD_LABEL[p.method]} {formatLiberianPhone(p.accountPhone)}
                        </span>
                        {p.status === "rejected" && p.reason && <span className="block font-semibold text-danger">{p.reason}</span>}
                        {p.status === "paid" && p.reference && <span className="block text-muted">Transaction {p.reference}</span>}
                      </span>
                      <Badge tone={p.status === "paid" ? "success" : p.status === "rejected" ? "danger" : "warn"}>
                        {p.status === "paid" ? "Sent" : p.status === "rejected" ? "Refused" : "Waiting"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-card border border-line bg-white p-5" aria-label="History">
              <h2 className="mb-2 font-display text-lg font-extrabold">History</h2>
              <ul>
                {wallet.entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-sm first:border-t-0">
                    <span>
                      <span className="block font-semibold">
                        {ENTRY[e.type]} {e.orderNumber ?? e.payoutNumber ?? ""}
                      </span>
                      <span className="text-xs text-muted">
                        {when(e.createdAt)}
                        {e.note ? ` · ${e.note}` : ""}
                      </span>
                    </span>
                    <span className={`font-bold ${e.amount < 0 ? "text-danger" : "text-success"}`}>
                      {e.amount < 0 ? "−" : "+"}
                      {formatLD(Math.abs(e.amount))}
                    </span>
                  </li>
                ))}
                {wallet.entries.length === 0 && <li className="py-6 text-center text-sm text-muted">Your earnings show up here when orders are delivered.</li>}
              </ul>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function PayoutRequest({ wallet, onDone }: { wallet: Wallet; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooLow = wallet.balance < wallet.minPayout;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseLD(amount);
    if (!cents) return setError("Enter an amount in dollars");
    setBusy(true);
    setError(null);
    try {
      const { payout } = await api.shop.requestPayout(cents);
      setAmount("");
      onDone(`Payout ${payout.number} for ${formatLD(payout.amount)} is requested. YanaBuy sends it to your mobile money, usually within 2 working days.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-card border border-line bg-white p-5" noValidate aria-label="Take out money">
      <h2 className="font-display text-lg font-extrabold">Take out money</h2>
      {!wallet.payoutDetails ? (
        <p className="text-sm text-muted">Add your mobile money details first →</p>
      ) : tooLow ? (
        <p className="text-sm text-muted">You can take out money once you have at least {formatLD(wallet.minPayout)}.</p>
      ) : (
        <>
          <Field label="Amount (LD)" hint={`Between ${formatLD(wallet.minPayout)} and ${formatLD(wallet.balance)}.`}>
            {(id) => <TextInput id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(wallet.balance / 100)} />}
          </Field>
          <button type="button" onClick={() => setAmount(String(wallet.balance / 100))} className="self-start text-[13px] font-bold text-purple hover:underline">
            Take out everything ({formatLD(wallet.balance)})
          </button>
          <p className="text-[12.5px] text-muted">
            Sent to {PAYOUT_METHOD_LABEL[wallet.payoutDetails.method]} {formatLiberianPhone(wallet.payoutDetails.phone)} ({wallet.payoutDetails.name}).
          </p>
        </>
      )}
      {error && <Alert>{error}</Alert>}
      <div>
        <Button type="submit" busy={busy} disabled={!wallet.payoutDetails || tooLow}>
          Request payout
        </Button>
      </div>
    </form>
  );
}

function PayoutDetailsForm({ wallet, onSaved }: { wallet: Wallet; onSaved: () => void }) {
  const d = wallet.payoutDetails;
  const [method, setMethod] = useState<PayoutMethod>(d?.method ?? "mtn_momo");
  const [name, setName] = useState(d?.name ?? "");
  const [phone, setPhone] = useState(d ? formatLiberianPhone(d.phone) : "");
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api.shop.savePayoutDetails({ method, name, phone });
      onSaved();
    } catch (err) {
      setFields(fieldErrorsOf(err));
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-card border border-line bg-white p-5" noValidate aria-label="Mobile money details">
      <h2 className="font-display text-lg font-extrabold">Where should we send it?</h2>
      <div className="flex gap-2" role="radiogroup" aria-label="Mobile money">
        {(Object.keys(PAYOUT_METHOD_LABEL) as PayoutMethod[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            onClick={() => setMethod(m)}
            className={`h-10 flex-1 rounded-full text-[13px] font-bold ${method === m ? "bg-purple text-white" : "border border-line-strong bg-white text-soft"}`}
          >
            {PAYOUT_METHOD_LABEL[m]}
          </button>
        ))}
      </div>
      <Field label="Name on the account" error={fields.name}>
        {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} invalid={!!fields.name} />}
      </Field>
      <Field label="Mobile money number" error={fields.phone}>
        {(id) => <TextInput id={id} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!fields.phone} placeholder="0770 000 000" />}
      </Field>
      {error && !Object.keys(fields).length && <Alert>{error}</Alert>}
      <div>
        <Button type="submit" variant="outline" busy={busy}>
          Save details
        </Button>
      </div>
    </form>
  );
}
