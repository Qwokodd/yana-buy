"use client";

import { useEffect, useState } from "react";
import { formatLD, parseLD, type DiscountCode, type DiscountCodeInput } from "@yanabuy/shared";
import { Alert, Badge, Button, Field, TextInput, fieldErrorsOf, inputClass, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const toMoney = (c: number | null) => (c ? String(c / 100) : "");
const toDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

function state(d: DiscountCode): { label: string; tone: "success" | "neutral" | "danger" | "warn" } {
  const now = Date.now();
  if (!d.active) return { label: "Off", tone: "neutral" };
  if (d.endsAt && new Date(d.endsAt).getTime() < now) return { label: "Expired", tone: "danger" };
  if (d.startsAt && new Date(d.startsAt).getTime() > now) return { label: `Starts ${day(d.startsAt)}`, tone: "warn" };
  if (d.usageLimit !== null && d.timesUsed >= d.usageLimit) return { label: "Used up", tone: "danger" };
  return { label: "Live", tone: "success" };
}

const what = (d: Pick<DiscountCode, "type" | "value" | "maxDiscount" | "minSubtotal" | "mode">) =>
  `${d.type === "percent" ? `${d.value}% off` : `${formatLD(d.value)} off`}${d.maxDiscount ? ` (up to ${formatLD(d.maxDiscount)})` : ""}${d.minSubtotal ? ` orders over ${formatLD(d.minSubtotal)}` : ""}${d.mode === "food" ? " · food only" : d.mode === "goods" ? " · shop items only" : ""}`;

export default function DiscountsPage() {
  const [items, setItems] = useState<DiscountCode[] | null>(null);
  const [editing, setEditing] = useState<DiscountCode | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api.admin
      .discounts()
      .then((r) => setItems(r.items))
      .catch((err) => setError(messageOf(err)));
  useEffect(() => {
    load();
  }, []);

  async function toggle(d: DiscountCode) {
    try {
      const r = await api.admin.updateDiscount(d.id, { active: !d.active });
      setItems((xs) => xs?.map((x) => (x.id === d.id ? r.discount : x)) ?? null);
    } catch (err) {
      setError(messageOf(err));
    }
  }
  async function remove(d: DiscountCode) {
    if (!window.confirm(`Delete ${d.code}?`)) return;
    try {
      await api.admin.deleteDiscount(d.id);
      setItems((xs) => xs?.filter((x) => x.id !== d.id) ?? null);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <AdminShell
      title="Discount codes"
      subtitle="Codes buyers type at checkout. YanaBuy pays the money off — sellers still earn on the full price."
      actions={<Button onClick={() => setEditing("new")}>New code</Button>}
    >
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="overflow-hidden rounded-[20px] border border-line bg-white" aria-label="Codes">
          {!items && <p className="p-6 text-sm text-muted">Loading…</p>}
          {items?.length === 0 && <p className="px-6 py-12 text-center text-sm text-muted">No codes yet. Press “New code”.</p>}
          <ul>
            {items?.map((d) => {
              const st = state(d);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[15px] font-bold">{d.code}</span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </p>
                    <p className="text-[13px] text-soft">{what(d)}</p>
                    <p className="text-xs text-muted">
                      Used {d.timesUsed}
                      {d.usageLimit ? ` of ${d.usageLimit}` : ""} times · {formatLD(d.totalDiscount)} given
                      {d.perBuyerLimit ? ` · ${d.perBuyerLimit === 1 ? "once" : `${d.perBuyerLimit} times`} per buyer` : ""}
                      {d.endsAt ? ` · until ${day(d.endsAt)}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggle(d)}>
                    {d.active ? "Switch off" : "Switch on"}
                  </Button>
                  {d.timesUsed === 0 && (
                    <Button size="sm" variant="ghost" className="text-danger hover:!text-danger" onClick={() => remove(d)}>
                      Delete
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        {editing ? (
          <Editor
            key={editing === "new" ? "new" : editing.id}
            code={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={(d, isNew) => {
              setItems((xs) => (isNew ? [d, ...(xs ?? [])] : (xs ?? []).map((x) => (x.id === d.id ? d : x))));
              setEditing(null);
              setNotice(`${d.code} is saved.`);
            }}
          />
        ) : (
          <div className="rounded-[20px] border border-dashed border-line-strong bg-white/60 p-8 text-center text-sm text-muted">Press “New code”, or Edit one.</div>
        )}
      </div>
    </AdminShell>
  );
}

function Editor({ code, onCancel, onSaved }: { code: DiscountCode | null; onCancel: () => void; onSaved: (d: DiscountCode, isNew: boolean) => void }) {
  const [f, setF] = useState({
    code: code?.code ?? "",
    description: code?.description ?? "",
    type: code?.type ?? ("percent" as const),
    value: code ? (code.type === "percent" ? String(code.value) : toMoney(code.value)) : "",
    maxDiscount: toMoney(code?.maxDiscount ?? null),
    minSubtotal: toMoney(code?.minSubtotal ?? null),
    mode: code?.mode ?? ("all" as const),
    startsAt: toDate(code?.startsAt ?? null),
    endsAt: toDate(code?.endsAt ?? null),
    usageLimit: code?.usageLimit ? String(code.usageLimit) : "",
    perBuyerLimit: code ? (code.perBuyerLimit ? String(code.perBuyerLimit) : "") : "1",
    active: code?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const whole = (s: string) => (s.trim() ? Math.round(Number(s)) : null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = f.type === "percent" ? whole(f.value) : parseLD(f.value);
    if (!value || value < 1) return setError(f.type === "percent" ? "Enter the percent, e.g. 5" : "Enter the amount, e.g. 4.00");
    const input: DiscountCodeInput = {
      code: f.code,
      description: f.description || null,
      type: f.type,
      value,
      maxDiscount: f.type === "percent" && f.maxDiscount.trim() ? parseLD(f.maxDiscount) : null,
      minSubtotal: f.minSubtotal.trim() ? parseLD(f.minSubtotal) : null,
      mode: f.mode,
      // Dates run from the start of the first day to the end of the last day (Monrovia time = UTC).
      startsAt: f.startsAt ? `${f.startsAt}T00:00:00Z` : null,
      endsAt: f.endsAt ? `${f.endsAt}T23:59:59Z` : null,
      usageLimit: whole(f.usageLimit),
      perBuyerLimit: whole(f.perBuyerLimit),
      active: f.active,
    };
    setBusy(true);
    setError(null);
    try {
      const r = code ? await api.admin.updateDiscount(code.id, input) : await api.admin.createDiscount(input);
      onSaved(r.discount, !code);
    } catch (err) {
      setFields(fieldErrorsOf(err));
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-[22px]">
      <h2 className="font-display text-lg font-extrabold">{code ? `Edit ${code.code}` : "New discount code"}</h2>
      <Field label="Code" error={fields.code} hint={code?.timesUsed ? "Already used, so the code itself can't change." : "Letters and numbers, e.g. WELCOME5. Buyers can type it in small letters too."}>
        {(id) => <TextInput id={id} value={f.code} onChange={set("code")} disabled={!!code?.timesUsed} maxLength={30} className="font-mono uppercase" />}
      </Field>
      <Field label="Note for admins (optional)" error={fields.description}>
        {(id) => <TextInput id={id} value={f.description} onChange={set("description")} maxLength={200} placeholder="e.g. Welcome code from the Facebook campaign" />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          {(id) => (
            <select id={id} value={f.type} onChange={set("type")} className={inputClass}>
              <option value="percent">Percent off</option>
              <option value="fixed">Amount off ($)</option>
            </select>
          )}
        </Field>
        <Field label={f.type === "percent" ? "Percent" : "Amount ($)"} error={fields.value}>
          {(id) => <TextInput id={id} inputMode="decimal" value={f.value} onChange={set("value")} placeholder={f.type === "percent" ? "5" : "4.00"} />}
        </Field>
        {f.type === "percent" && (
          <Field label="At most ($, optional)" error={fields.maxDiscount}>
            {(id) => <TextInput id={id} inputMode="decimal" value={f.maxDiscount} onChange={set("maxDiscount")} placeholder="e.g. 10" />}
          </Field>
        )}
        <Field label="Minimum spend ($, optional)" error={fields.minSubtotal}>
          {(id) => <TextInput id={id} inputMode="decimal" value={f.minSubtotal} onChange={set("minSubtotal")} placeholder="e.g. 15" />}
        </Field>
      </div>
      <Field label="Works on">
        {(id) => (
          <select id={id} value={f.mode} onChange={set("mode")} className={inputClass}>
            <option value="all">Everything</option>
            <option value="goods">Shop items only (Goods & Services)</option>
            <option value="food">Food only</option>
          </select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts (optional)" error={fields.startsAt}>
          {(id) => <TextInput id={id} type="date" value={f.startsAt} onChange={set("startsAt")} />}
        </Field>
        <Field label="Ends (optional)" error={fields.endsAt}>
          {(id) => <TextInput id={id} type="date" value={f.endsAt} onChange={set("endsAt")} />}
        </Field>
        <Field label="Total uses (optional)" error={fields.usageLimit}>
          {(id) => <TextInput id={id} inputMode="numeric" value={f.usageLimit} onChange={set("usageLimit")} placeholder="No limit" />}
        </Field>
        <Field label="Uses per buyer" error={fields.perBuyerLimit} hint="Empty = no limit">
          {(id) => <TextInput id={id} inputMode="numeric" value={f.perBuyerLimit} onChange={set("perBuyerLimit")} />}
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={f.active} onChange={(e) => setF((x) => ({ ...x, active: e.target.checked }))} className="h-4 w-4 accent-[rgb(var(--c-purple))]" />
        Switched on
      </label>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>
          {code ? "Save changes" : "Create code"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
