"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatLD, formatLiberianPhone, PAYMENT_METHOD_LABEL, type PaymentMethod, type SourcingRequest } from "@yanabuy/shared";
import { Alert, Button, Field, TextInput, fieldErrorsOf, inputClass, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { SOURCING_EVENT, SourcingBadge, SourcingProgress } from "@/components/SourcingBits";
import { api } from "@/lib/api";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ChinaRequestPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [r, setR] = useState<SourcingRequest | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=/china/${id}`);
  }, [loading, user, router, id]);

  const load = useCallback(() => {
    api.sourcing
      .get(id)
      .then((res) => {
        setR(res.request);
        setMethods(res.payMethods);
      })
      .catch((err) => setError(messageOf(err)));
  }, [id]);

  useEffect(() => {
    if (!user) return;
    setSent(new URLSearchParams(window.location.search).has("sent"));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [user, load]);

  async function cancel() {
    if (!r || !confirm("Cancel this request?")) return;
    setBusy(true);
    try {
      setR((await api.sourcing.cancel(r.id)).request);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-8">
        <Link href="/china" className="text-[13px] font-bold text-purple hover:underline">
          ← Buy from China
        </Link>
        {error && <Alert>{error}</Alert>}
        {!r ? (
          !error && <p className="text-muted">Loading…</p>
        ) : (
          <>
            {sent && r.status === "pending" && <Alert tone="success">Request sent! We&rsquo;ll look for it and send you a price, usually within 1–2 days.</Alert>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="font-display text-[26px] font-extrabold">China request {r.number}</h1>
              <SourcingBadge status={r.status} />
            </div>

            {["accepted", "ordered", "shipped", "arrived", "delivered"].includes(r.status) && (
              <section className="rounded-card border border-line bg-white p-5">
                <SourcingProgress status={r.status} />
                {r.quoteDays && r.status !== "delivered" && <p className="mt-3 text-center text-[13px] text-muted">Usually takes about {r.quoteDays} days in total.</p>}
              </section>
            )}
            {r.status === "rejected" && <Alert tone="warn">We couldn&rsquo;t source this one{r.rejectReason ? `: ${r.rejectReason}` : "."}</Alert>}

            {r.status === "quoted" && r.quotePrice !== null && <QuoteCard request={r} methods={methods} onAccepted={setR} />}

            <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-5">
              <p className="whitespace-pre-line text-[15px]">{r.description}</p>
              <p className="text-sm text-soft">
                <strong>{r.quantity}</strong> {r.quantity === 1 ? "piece" : "pieces"}
                {r.budget && <> · your budget: {r.budget}</>}
              </p>
              {r.link && (
                <a href={r.link} target="_blank" rel="noreferrer noopener" className="break-all text-sm font-semibold text-purple hover:underline">
                  {r.link} ↗
                </a>
              )}
              {r.images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {r.images.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={u + i} src={u} alt={`Photo ${i + 1}`} className="h-20 w-20 rounded-xl border border-line object-cover" />
                  ))}
                </div>
              )}
              {r.quotePrice !== null && r.status !== "quoted" && (
                <p className="border-t border-line pt-3 text-sm">
                  Price <strong>{formatLD(r.quotePrice)}</strong>
                  {r.paymentMethod && (
                    <>
                      {" "}
                      · {r.paymentStatus === "paid" ? `paid (${PAYMENT_METHOD_LABEL[r.paymentMethod]})` : "pay cash on delivery"}
                    </>
                  )}
                </p>
              )}
              {r.delivery && (
                <p className="text-sm text-soft">
                  Delivering to {r.delivery.name}, {r.delivery.address}, {r.delivery.city} · {formatLiberianPhone(r.delivery.phone)}
                </p>
              )}
            </section>

            <section className="rounded-card border border-line bg-white p-5 text-sm">
              <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">What happened</p>
              <ol className="flex flex-col gap-2">
                {r.events.map((e, i) => (
                  <li key={i}>
                    <span className="font-semibold">{SOURCING_EVENT[e.status] ?? e.status}</span>
                    {e.note && <span className="text-soft"> — {e.note}</span>}
                    <span className="block text-xs text-muted">{when(e.createdAt)}</span>
                  </li>
                ))}
              </ol>
            </section>

            {(r.status === "pending" || r.status === "quoted") && (
              <div>
                <Button variant="ghost" className="!px-0 text-danger hover:!text-danger" busy={busy} onClick={cancel}>
                  Cancel this request
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

function QuoteCard({ request: r, methods, onAccepted }: { request: SourcingRequest; methods: PaymentMethod[]; onAccepted: (r: SourcingRequest) => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const [accepting, setAccepting] = useState(false);
  const [form, setForm] = useState({ name: user?.fullName ?? "", phone: user ? formatLiberianPhone(user.phone) : "", city: user?.city ?? "", address: "" });
  const [method, setMethod] = useState<PaymentMethod>(methods[0] ?? "mtn_momo");
  const [payPhone, setPayPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    api.orders
      .lastDelivery()
      .then((res) => {
        const d = res.delivery;
        if (d) setForm({ name: d.name, phone: formatLiberianPhone(d.phone), city: d.city, address: d.address });
      })
      .catch(() => {});
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFields(({ [k]: _gone, ...rest }) => rest);
  };

  async function accept() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const res = await api.sourcing.accept(r.id, {
        delivery: { ...form, note: null },
        paymentMethod: method,
        paymentPhone: method !== "cod" && payPhone.trim() ? payPhone : undefined,
      });
      if (res.payment) return router.push(`/pay/${res.payment.id}`);
      onAccepted(res.request);
    } catch (err) {
      const fe = fieldErrorsOf(err);
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(fe)) flat[k.replace("delivery.", "")] = v;
      setFields(flat);
      setError(Object.keys(flat).length ? "Please fix the fields marked in red." : messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border-2 border-amber bg-white p-5" aria-label="Your quote">
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Your price</p>
        <p className="font-display text-[34px] font-extrabold text-price">{formatLD(r.quotePrice!)}</p>
        <p className="text-sm text-soft">
          For {r.quantity} {r.quantity === 1 ? "piece" : "pieces"}, delivered to you · about {r.quoteDays} days
        </p>
        {r.quoteNote && <p className="mt-1 text-sm">{r.quoteNote}</p>}
      </div>
      {!accepting ? (
        <div>
          <Button size="lg" onClick={() => setAccepting(true)}>
            Accept this price
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" error={fields.name}>
              {(id) => <TextInput id={id} value={form.name} onChange={set("name")} invalid={!!fields.name} />}
            </Field>
            <Field label="Phone" error={fields.phone}>
              {(id) => <TextInput id={id} type="tel" value={form.phone} onChange={set("phone")} invalid={!!fields.phone} />}
            </Field>
          </div>
          <Field label="City or town" error={fields.city}>
            {(id) => <TextInput id={id} value={form.city} onChange={set("city")} invalid={!!fields.city} placeholder="Monrovia" />}
          </Field>
          <Field label="Address and landmark" error={fields.address}>
            {(id) => <textarea id={id} rows={2} value={form.address} onChange={set("address")} aria-invalid={!!fields.address || undefined} className={`${inputClass} h-auto resize-none py-3`} />}
          </Field>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="How will you pay?">
            <p className="text-[13px] font-bold">How will you pay?</p>
            {methods.map((m) => (
              <label key={m} className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 ${method === m ? "border-purple bg-purple-tint/40" : "border-line"}`}>
                <input type="radio" name="pay" checked={method === m} onChange={() => setMethod(m)} className="h-4 w-4 accent-[rgb(var(--c-purple))]" />
                <span>
                  <span className="block font-bold">{m === "cod" ? "Pay on delivery" : PAYMENT_METHOD_LABEL[m]}</span>
                  <span className="text-[12.5px] text-muted">{m === "cod" ? "Pay cash when it arrives in Liberia." : "Pay now — approve on your phone with your PIN."}</span>
                </span>
              </label>
            ))}
          </div>
          {method === "mtn_momo" && (
            <Field label="MTN number to pay from" error={fields.paymentPhone} hint="Leave empty to use the phone above.">
              {(id) => <TextInput id={id} type="tel" value={payPhone} onChange={(e) => setPayPhone(e.target.value)} invalid={!!fields.paymentPhone} />}
            </Field>
          )}
          {error && <Alert>{error}</Alert>}
          <div>
            <Button size="lg" busy={busy} onClick={accept}>
              {method === "cod" ? "Confirm order" : `Pay ${formatLD(r.quotePrice!)}`}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
