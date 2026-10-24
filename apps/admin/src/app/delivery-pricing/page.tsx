"use client";

import { useEffect, useState } from "react";
import {
  COUNTRIES,
  computeDeliveryFee,
  countryName,
  formatLD,
  switchDistanceUnit,
  switchWeightUnit,
  unitToGrams,
  unitToMetres,
  validatePricing,
  type Country,
  type DeliveryPricing,
  type PriceBand,
  type PriceMethod,
} from "@yanabuy/shared";
import { Alert, Badge, Button, Field, TextInput, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";

const fmt = (n: number | null, cents?: boolean) => (n === null ? "" : String(cents ? n / 100 : n));

/** A number box that keeps what the admin types, and reports the number once it reads as one. */
function Num({
  label,
  hint,
  value,
  onChange,
  cents,
  nullable,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  cents?: boolean;
  nullable?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(fmt(value, cents));
  const [bad, setBad] = useState(false);
  const read = (t: string): number | null | undefined => {
    if (!t.trim()) return nullable ? null : undefined;
    const n = Number(t.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) return undefined;
    return cents ? Math.round(n * 100) : n;
  };
  // Value changed from outside (unit switch, load): show it.
  useEffect(() => {
    if (read(text) !== value) setText(fmt(value, cents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Field label={label} hint={hint} error={bad ? (nullable ? "Enter a number, or leave empty" : "Enter a number") : undefined}>
      {(id) => (
        <TextInput
          id={id}
          inputMode="decimal"
          value={text}
          invalid={bad}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            const n = read(e.target.value);
            setBad(n === undefined);
            if (n !== undefined) onChange(n);
          }}
        />
      )}
    </Field>
  );
}

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-10 rounded-full px-4 text-sm font-bold ${value === o.value ? "bg-purple text-white" : "border border-line-strong text-soft"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Bands({ bands, unit, onChange, label }: { bands: PriceBand[]; unit: string; onChange: (b: PriceBand[]) => void; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-muted">Each band runs from the end of the one above. Past the last band, the order can't be delivered.</p>
      {bands.map((b, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <span className="pb-3 text-[13px] text-soft">
            {i === 0 ? 0 : bands[i - 1].upTo} –
          </span>
          <div className="w-28">
            <Num label={`Up to (${unit})`} value={b.upTo} onChange={(v) => onChange(bands.map((x, n) => (n === i ? { ...x, upTo: v ?? 0 } : x)))} />
          </div>
          <div className="w-28">
            <Num label={label} cents value={b.feeCents} onChange={(v) => onChange(bands.map((x, n) => (n === i ? { ...x, feeCents: v ?? 0 } : x)))} />
          </div>
          <button type="button" onClick={() => onChange(bands.filter((_, n) => n !== i))} className="pb-3 text-[13px] font-bold text-danger hover:underline" disabled={bands.length === 1}>
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const last = bands.at(-1);
          onChange([...bands, { upTo: (last?.upTo ?? 0) + 5, feeCents: last?.feeCents ?? 0 }]);
        }}
        className="self-start rounded-full border border-dashed border-purple px-4 py-2 text-[13px] font-bold text-purple hover:bg-purple-tint"
      >
        + Add a band
      </button>
    </div>
  );
}

const METHODS: { value: PriceMethod; label: string }[] = [
  { value: "rate", label: "Base fee + rate" },
  { value: "bands", label: "Fixed price bands" },
];

/** Same calculation checkout uses, fed with a road distance and a weight instead of two pins. */
function preview(p: DeliveryPricing, distance: number, weight: number, isRestaurant: boolean) {
  const R = 6371008.8;
  const straight = unitToMetres(distance, p.distance.unit) / Math.max(1, p.distance.roadFactor);
  const dropoff = { lat: ((straight / R) * 180) / Math.PI, lng: 0 };
  return computeDeliveryFee({
    pricing: p,
    pickup: { lat: 0, lng: 0 },
    dropoff,
    items: [{ qty: 1, weightGrams: Math.max(1, Math.round(unitToGrams(weight, p.weight.unit))) }],
    isRestaurant,
  });
}

export default function DeliveryPricingPage() {
  const [tab, setTab] = useState<Country>("LR");
  const [p, setP] = useState<DeliveryPricing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tryDist, setTryDist] = useState(5);
  const [tryWeight, setTryWeight] = useState(3);
  const [tryFood, setTryFood] = useState(false);

  useEffect(() => {
    setP(null);
    setError(null);
    setNotice(null);
    api.admin
      .deliveryPricing(tab)
      .then((r) => setP(r.pricing))
      .catch((err) => setError(messageOf(err)));
  }, [tab]);

  const d = p?.distance;
  const w = p?.weight;
  const setD = (patch: Partial<DeliveryPricing["distance"]>) => p && setP({ ...p, distance: { ...p.distance, ...patch } });
  const setW = (patch: Partial<DeliveryPricing["weight"]>) => p && setP({ ...p, weight: { ...p.weight, ...patch } });
  const problems = p ? validatePricing(p) : [];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!p) return;
    if (problems.length) return setError(problems.join(" · "));
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.admin.saveDeliveryPricing(tab, p);
      setP(r.pricing);
      setNotice(
        r.pricing.mode === "distance"
          ? `Saved. ${countryName(tab)} checkouts with a drop-off pin are now priced by distance${r.pricing.weight.enabled ? " and weight" : ""}.`
          : `Saved. ${countryName(tab)} still uses the area fees until you switch to "By distance".`
      );
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const result = p ? preview(p, tryDist, tryWeight, tryFood) : null;

  return (
    <AdminShell title="Fees by distance & weight" subtitle="Work out the delivery fee from how far the order travels, and how heavy it is.">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <form onSubmit={save} className="flex max-w-2xl flex-1 flex-col gap-6 rounded-[20px] border border-line bg-white p-[22px]" noValidate>
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
          {!p && !error && <p className="text-sm text-muted">Loading…</p>}
          {p && d && w && (
            <>
              <section className="flex flex-col gap-2">
                <h2 className="text-[15px] font-extrabold">How fees are worked out in {countryName(tab)}</h2>
                <Toggle
                  label="Pricing"
                  value={p.mode}
                  onChange={(mode) => setP({ ...p, mode })}
                  options={[
                    { value: "area", label: "By area (as now)" },
                    { value: "distance", label: "By distance" },
                  ]}
                />
                <p className="text-[12.5px] text-muted">
                  {p.mode === "area"
                    ? "Buyers pay the flat or area fee from Delivery fees. Nothing below is used yet."
                    : "From the shop's pin to the buyer's drop-off pin. Orders without a pin still pay the area / flat fee. Free delivery from (on Delivery fees) still applies."}
                </p>
              </section>

              <section className="flex flex-col gap-3">
                <h2 className="text-[15px] font-extrabold">Distance</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <Toggle
                    label="Distance unit"
                    value={d.unit}
                    onChange={(u) => setP({ ...p, distance: switchDistanceUnit(d, u) })}
                    options={[
                      { value: "km", label: "Kilometres" },
                      { value: "mi", label: "Miles" },
                    ]}
                  />
                  <Toggle label="Distance pricing" value={d.method} onChange={(method) => setD({ method })} options={METHODS} />
                </div>
                {d.method === "rate" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Num label="Base fee ($)" hint="Charged on every order." cents value={d.baseCents} onChange={(v) => setD({ baseCents: v ?? 0 })} />
                    <Num label={`Included distance (${d.unit})`} hint="Covered by the base fee." value={d.included} onChange={(v) => setD({ included: v ?? 0 })} />
                    <Num label={`Price per ${d.unit === "km" ? "km" : "mile"} after that ($)`} cents value={d.rateCents} onChange={(v) => setD({ rateCents: v ?? 0 })} />
                    <Num label={`Furthest delivery (${d.unit})`} hint="Leave empty for no limit." nullable value={d.maxDistance} onChange={(v) => setD({ maxDistance: v })} />
                  </div>
                ) : (
                  <Bands bands={d.bands} unit={d.unit} label="Fee ($)" onChange={(bands) => setD({ bands })} />
                )}
                <div className="max-w-[240px]">
                  <Num label="Road factor" hint="Roads are longer than a straight line. 1.3 = 30% longer." value={d.roadFactor} onChange={(v) => setD({ roadFactor: v ?? 1 })} />
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[15px] font-extrabold">Weight</h2>
                  <label className="flex items-center gap-2 text-[13px] font-semibold">
                    <input type="checkbox" checked={w.enabled} onChange={(e) => setW({ enabled: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--c-purple))]" />
                    Add a charge for heavy orders
                  </label>
                </div>
                {w.enabled && (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <Toggle
                        label="Weight unit"
                        value={w.unit}
                        onChange={(u) => setP({ ...p, weight: switchWeightUnit(w, u) })}
                        options={[
                          { value: "kg", label: "Kilograms" },
                          { value: "lb", label: "Pounds" },
                        ]}
                      />
                      <Toggle label="Weight pricing" value={w.method} onChange={(method) => setW({ method })} options={METHODS} />
                    </div>
                    {w.method === "rate" ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Num label={`Included weight (${w.unit})`} hint="Carried at no extra cost." value={w.included} onChange={(v) => setW({ included: v ?? 0 })} />
                        <Num label={`Extra per ${w.unit} after that ($)`} cents value={w.rateCents} onChange={(v) => setW({ rateCents: v ?? 0 })} />
                        <Num label={`Heaviest order (${w.unit})`} hint="Leave empty for no limit." nullable value={w.maxWeight} onChange={(v) => setW({ maxWeight: v })} />
                      </div>
                    ) : (
                      <Bands bands={w.bands} unit={w.unit} label="Extra ($)" onChange={(bands) => setW({ bands })} />
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Num label={`Weight of items with none set (${w.unit})`} hint="Sellers can add a weight to each product." value={w.defaultItemWeight} onChange={(v) => setW({ defaultItemWeight: v ?? 0 })} />
                      <Num label={`Needs a keke or car over (${w.unit})`} hint="Leave empty to switch off." nullable value={w.heavyOver} onChange={(v) => setW({ heavyOver: v })} />
                    </div>
                    <label className="flex items-center gap-2 text-[13px] font-semibold">
                      <input type="checkbox" checked={w.applyToRestaurants} onChange={(e) => setW({ applyToRestaurants: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--c-purple))]" />
                      Charge for weight on restaurant orders too
                    </label>
                  </>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <h2 className="text-[15px] font-extrabold">Limits</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Num label="Lowest fee ($)" cents value={p.minFeeCents} onChange={(v) => setP({ ...p, minFeeCents: v ?? 0 })} />
                  <Num label="Highest fee ($)" hint="Empty = no cap." cents nullable value={p.maxFeeCents} onChange={(v) => setP({ ...p, maxFeeCents: v })} />
                  <Num label="Round up to (cents)" hint="10 → $2.35 becomes $2.40." value={p.roundToCents} onChange={(v) => setP({ ...p, roundToCents: Math.round(v ?? 1) })} />
                </div>
              </section>

              {problems.length > 0 && <Alert tone="warn">{problems.join(" · ")}</Alert>}
            </>
          )}
          {notice && <Alert tone="success">{notice}</Alert>}
          {error && <Alert>{error}</Alert>}
          {p && (
            <div>
              <Button type="submit" busy={busy} disabled={problems.length > 0}>
                Save {countryName(tab)} pricing
              </Button>
            </div>
          )}
        </form>

        {p && result && (
          <aside className="flex w-full flex-col gap-3 rounded-[20px] border border-line bg-white p-[22px] lg:sticky lg:top-6 lg:w-[320px]">
            <h2 className="text-[15px] font-extrabold">Try it</h2>
            <p className="-mt-2 text-[12.5px] text-muted">Uses the settings on the left, before saving.</p>
            <Num label={`Road distance (${p.distance.unit})`} value={tryDist} onChange={(v) => setTryDist(v ?? 0)} />
            {p.weight.enabled && <Num label={`Order weight (${p.weight.unit})`} value={tryWeight} onChange={(v) => setTryWeight(v ?? 0)} />}
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              <input type="checkbox" checked={tryFood} onChange={(e) => setTryFood(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--c-purple))]" />
              Restaurant order
            </label>
            {result.ok ? (
              <div className="flex flex-col gap-1 rounded-2xl bg-purple-tint p-4 text-[13px]">
                <div className="flex justify-between">
                  <span>Distance ({result.billedDistance} {result.distanceUnit})</span>
                  <span>{formatLD(result.distanceFeeCents)}</span>
                </div>
                {p.weight.enabled && (
                  <div className="flex justify-between">
                    <span>Weight ({result.billedWeight} {result.weightUnit})</span>
                    <span>{formatLD(result.weightFeeCents)}</span>
                  </div>
                )}
                <div className="mt-1 flex justify-between border-t border-line pt-2 text-[15px] font-extrabold">
                  <span>Buyer pays</span>
                  <span>{formatLD(result.feeCents)}</span>
                </div>
                {result.feeCents !== result.subtotalCents && <p className="text-[12px] text-muted">Rounded / kept within the lowest and highest fee.</p>}
                {result.heavy && (
                  <div className="mt-1">
                    <Badge tone="warn">Needs a keke or car</Badge>
                  </div>
                )}
              </div>
            ) : (
              <Alert tone="warn">{result.reason === "too_far" ? "Too far — this order couldn't be delivered." : "Too heavy — this order couldn't be delivered."}</Alert>
            )}
          </aside>
        )}
      </div>
    </AdminShell>
  );
}
