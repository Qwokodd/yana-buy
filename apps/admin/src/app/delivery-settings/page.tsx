"use client";

import { useEffect, useState } from "react";
import { COUNTRIES, countryName, formatLD, parseLD, PAYMENT_METHOD_LABEL, type Country, type DeliveryArea, type DeliverySettings, type PaymentMethod } from "@yanabuy/shared";
import { Alert, Badge, Button, Field, TextInput, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";

const toInput = (cents: number | null) => (cents === null ? "" : String(cents / 100));

export default function DeliverySettingsPage() {
  const [saved, setSaved] = useState<DeliverySettings | null>(null);
  const [ready, setReady] = useState<PaymentMethod[]>(["cod"]);
  const [methods, setMethods] = useState<DeliverySettings["methods"] | null>(null);
  const [tab, setTab] = useState<Country>("LR");
  const [fees, setFees] = useState<Record<Country, { fee: string; freeOver: string }>>({ LR: { fee: "", freeOver: "" }, US: { fee: "", freeOver: "" } });
  const fee = fees[tab].fee;
  const freeOver = fees[tab].freeOver;
  const setFee = (v: string) => setFees((f) => ({ ...f, [tab]: { ...f[tab], fee: v } }));
  const setFreeOver = (v: string) => setFees((f) => ({ ...f, [tab]: { ...f[tab], freeOver: v } }));
  const [areas, setAreas] = useState<(Omit<DeliveryArea, "fee"> & { fee: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .delivery()
      .then((res) => {
        setSaved(res.delivery);
        setReady(res.ready);
        setMethods(res.delivery.methods);
        const us = res.delivery.countryFees.US;
        setFees({
          LR: { fee: toInput(res.delivery.fee), freeOver: toInput(res.delivery.freeOver) },
          US: { fee: us ? toInput(us.fee) : "", freeOver: us ? toInput(us.freeOver) : "" },
        });
        setAreas(res.delivery.areas.map((a) => ({ ...a, fee: toInput(a.fee) })));
      })
      .catch((err) => setError(messageOf(err)));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!saved) return;
    const parsed = {} as Record<Country, { fee: number; freeOver: number | null } | null>;
    for (const c of COUNTRIES) {
      const f = fees[c.code];
      if (c.code !== "LR" && !f.fee.trim() && !f.freeOver.trim()) {
        parsed[c.code] = null; // not set up: uses Liberia's
        continue;
      }
      const feeCents = f.fee.trim() === "0" ? 0 : parseLD(f.fee);
      const freeCents = f.freeOver.trim() ? parseLD(f.freeOver) : null;
      if (feeCents === null) return setError(`${c.name}: enter the delivery fee in dollars, e.g. 1.50 (or 0 for free)`);
      if (f.freeOver.trim() && freeCents === null) return setError(`${c.name}: enter an amount for free delivery, or leave it empty`);
      parsed[c.code] = { fee: feeCents, freeOver: freeCents };
    }
    const cleanAreas: DeliveryArea[] = [];
    for (const a of areas) {
      if (!a.name.trim() && !a.fee.trim()) continue;
      const c = a.fee.trim() === "0" ? 0 : parseLD(a.fee);
      if (a.name.trim().length < 2) return setError(`Give every area a name (${countryName(a.country)})`);
      if (c === null) return setError(`Enter the fee for ${a.name}, e.g. 0.90`);
      cleanAreas.push({ ...a, name: a.name.trim(), fee: c });
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.admin.saveDelivery({
        ...saved,
        methods: methods ?? saved.methods,
        fee: parsed.LR!.fee,
        freeOver: parsed.LR!.freeOver,
        countryFees: parsed.US ? { US: parsed.US } : {},
        areas: cleanAreas,
      });
      setSaved(res.delivery);
      setAreas(res.delivery.areas.map((a) => ({ ...a, fee: toInput(a.fee) })));
      setNotice("Saved. New checkouts use these fees straight away.");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Delivery fees" subtitle="What shoppers pay for delivery, and how they can pay.">
      <form onSubmit={save} className="flex max-w-xl flex-col gap-5 rounded-[20px] border border-line bg-white p-[22px]" noValidate>
        {!saved && !error && <p className="text-sm text-muted">Loading…</p>}
        {saved && (
          <>
            <div className="flex gap-2" role="tablist" aria-label="Country">
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  role="tab"
                  aria-selected={tab === c.code}
                  onClick={() => setTab(c.code)}
                  className={`h-10 rounded-full px-4 text-sm font-bold ${tab === c.code ? "bg-purple text-white" : "border border-line-strong text-soft"}`}
                >
                  {c.flag} {c.name}
                </button>
              ))}
            </div>
            {tab !== "LR" && !saved.countryFees[tab] && (
              <p className="-mt-2 text-[12.5px] text-muted">Not set yet — {countryName(tab)} orders use Liberia's fee until you fill this in. Mobile money is never offered in {countryName(tab)}.</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={areas.some((a) => a.active && a.country === tab) ? "Fee when no area fits ($)" : "Delivery fee ($)"} hint="Per order. An order from two shops pays it twice.">
                {(id) => <TextInput id={id} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />}
              </Field>
              <Field label="Free delivery from ($)" hint="Leave empty to always charge.">
                {(id) => <TextInput id={id} inputMode="decimal" value={freeOver} onChange={(e) => setFreeOver(e.target.value)} placeholder="e.g. 5000" />}
              </Field>
            </div>
            {(() => {
              const now = tab === "LR" ? { fee: saved.fee, freeOver: saved.freeOver } : (saved.countryFees[tab] ?? { fee: saved.fee, freeOver: saved.freeOver });
              return (
                <p className="text-[13px] text-soft">
                  Now in {countryName(tab)}: {now.fee ? formatLD(now.fee) : "free"} per order{now.freeOver !== null ? `, free from ${formatLD(now.freeOver)}` : ""}.
                </p>
              );
            })()}

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-bold">Delivery areas in {countryName(tab)}</legend>
              <p className="-mt-1 text-[12.5px] text-muted">
                {tab === "US" ? "Cities or neighbourhoods with their own fee, e.g. Philadelphia – Southwest $8.99." : "Parts of town with their own fee, e.g. Sinkor – City Hall $0.90, Upper Caldwell $4.90."} When any area is on, buyers must pick theirs at checkout. Free delivery above still applies.
              </p>
              {areas.map((a, i) => a.country !== tab ? null : (
                <div key={a.id || `new-${i}`} className="flex flex-wrap items-center gap-2">
                  <TextInput aria-label="Area name" value={a.name} onChange={(e) => setAreas(areas.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)))} placeholder={tab === "US" ? "e.g. Brooklyn Park, MN" : "e.g. Redlight, GSA & ELWA"} className="min-w-[200px] flex-1" maxLength={60} />
                  <TextInput aria-label={`Fee for ${a.name || "this area"}`} inputMode="decimal" value={a.fee} onChange={(e) => setAreas(areas.map((x, n) => (n === i ? { ...x, fee: e.target.value } : x)))} placeholder="$" className="w-24" />
                  <label className="flex items-center gap-1.5 text-[13px] font-semibold">
                    <input type="checkbox" checked={a.active} onChange={(e) => setAreas(areas.map((x, n) => (n === i ? { ...x, active: e.target.checked } : x)))} className="h-4 w-4 accent-[rgb(var(--c-purple))]" />
                    On
                  </label>
                  <button type="button" onClick={() => setAreas(areas.filter((_, n) => n !== i))} className="text-[13px] font-bold text-danger hover:underline">
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setAreas([...areas, { id: "", name: "", fee: "", active: true, country: tab }])} className="self-start rounded-full border border-dashed border-purple px-4 py-2 text-[13px] font-bold text-purple hover:bg-purple-tint">
                + Add an area
              </button>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-bold">Ways to pay</legend>
              {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => {
                const isReady = ready.includes(m);
                return (
                  <label key={m} className={`flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm ${isReady ? "cursor-pointer" : ""}`}>
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        disabled={!isReady || m === "cod"}
                        checked={!!methods?.[m]}
                        onChange={(e) => methods && setMethods({ ...methods, [m]: e.target.checked })}
                        className="h-4 w-4 accent-[rgb(var(--c-purple))]"
                      />
                      <span className="font-semibold">{PAYMENT_METHOD_LABEL[m]}</span>
                    </span>
                    {m === "cod" ? (
                      <Badge tone="success">Always on — riders collect the cash</Badge>
                    ) : isReady ? (
                      <Badge tone="purple">Connected</Badge>
                    ) : (
                      <Badge>Not connected yet — add its merchant keys to the server settings</Badge>
                    )}
                  </label>
                );
              })}
            </fieldset>
          </>
        )}
        {notice && <Alert tone="success">{notice}</Alert>}
        {error && <Alert>{error}</Alert>}
        {saved && (
          <div>
            <Button type="submit" busy={busy}>
              Save delivery fees
            </Button>
          </div>
        )}
      </form>
    </AdminShell>
  );
}
