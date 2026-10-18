"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CITIES, formatLD, formatLiberianPhone, PAYMENT_METHOD_LABEL, type PaymentMethod, type Quote } from "@yanabuy/shared";
import { Alert, Button, Field, TextInput, fieldErrorsOf, inputClass, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { useCart } from "@/lib/cart";
import { api } from "@/lib/api";

const PAY_HINT: Record<PaymentMethod, (enabled: boolean) => string> = {
  cod: () => "Pay the rider in cash when your order arrives.",
  mtn_momo: (on) => (on ? "Approve the payment on your phone with your MoMo PIN." : "Coming soon"),
  orange_money: () => "Coming soon",
  card: () => "Coming soon",
};

export default function CheckoutPage() {
  const { user, loading } = useAuth();
  const cart = useCart();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", city: "", address: "", note: "" });
  const [method, setMethod] = useState<PaymentMethod>("cod");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);
  const [payPhone, setPayPhone] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [lastArea, setLastArea] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/checkout");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    setForm((f) => ({ ...f, name: user.fullName, phone: formatLiberianPhone(user.phone), city: user.city ?? "" }));
    api.orders
      .lastDelivery()
      .then((res) => {
        const d = res.delivery;
        if (d) {
          setForm({ name: d.name, phone: formatLiberianPhone(d.phone), city: d.city, address: d.address, note: "" });
          setLastArea(d.area ?? null);
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (placing) return;
    if (!cart.items.length) return;
    api.orders
      .quote(cart.items, { areaId, code })
      .then((res) => setQuote(res.quote))
      .catch((err) => setError(messageOf(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(cart.items), areaId, code]);

  // Pick the area used last time, once the areas are known.
  useEffect(() => {
    if (!areaId && lastArea && quote?.areas.length) {
      const match = quote.areas.find((a) => a.name === lastArea);
      if (match) setAreaId(match.id);
    }
  }, [quote, lastArea, areaId]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    // Typing in a box clears its old error.
    setFields(({ [k]: _gone, ...rest }) => rest);
  };

  async function place(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      setPlacing(true);
      const res = await api.orders.place({
        items: cart.items,
        delivery: { ...form, note: form.note || null, areaId },
        code,
        paymentMethod: method,
        paymentPhone: method !== "cod" && payPhone.trim() ? payPhone : undefined,
      });
      // Mobile money: keep the cart until the payment goes through.
      if (res.payment) return router.replace(`/pay/${res.payment.id}`);
      cart.clear();
      router.replace(res.orders.length === 1 ? `/orders/${res.orders[0].id}?placed=1` : `/orders?placed=${res.orders.length}`);
    } catch (err) {
      setPlacing(false);
      const fe = fieldErrorsOf(err);
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(fe)) flat[k.replace("delivery.", "")] = v;
      setFields(flat);
      setError(Object.keys(flat).length && !fe.cart ? "Please fix the fields marked in red." : messageOf(err));
      if (fe.cart) api.orders.quote(cart.items, { areaId, code }).then((r) => setQuote(r.quote));
    } finally {
      setBusy(false);
    }
  }

  if (!cart.items.length && !placing) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="font-display text-xl font-extrabold">Your cart is empty</p>
          <Link href="/" className="mt-4 inline-block font-bold text-purple hover:underline">
            Start shopping
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-5 px-4 py-8 sm:px-8">
        <div>
          <Link href="/cart" className="text-[13px] font-bold text-purple hover:underline">
            ← Back to cart
          </Link>
          <h1 className="font-display text-[28px] font-extrabold">Checkout</h1>
        </div>

        <form onSubmit={place} noValidate className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-4 rounded-card border border-line bg-white p-6">
              <h2 className="font-display text-lg font-extrabold">Where should we deliver?</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" error={fields.name}>
                  {(id) => <TextInput id={id} value={form.name} onChange={set("name")} invalid={!!fields.name} autoComplete="name" />}
                </Field>
                <Field label="Phone the rider can call" error={fields.phone}>
                  {(id) => <TextInput id={id} type="tel" value={form.phone} onChange={set("phone")} invalid={!!fields.phone} autoComplete="tel" />}
                </Field>
              </div>
              {!!quote?.areas.length && (
                <Field label="Delivery area" error={fields.areaId} hint="The delivery fee depends on your area.">
                  {(id) => (
                    <select
                      id={id}
                      value={areaId ?? ""}
                      onChange={(e) => {
                        setAreaId(e.target.value || null);
                        setFields(({ areaId: _gone, ...rest }) => rest);
                      }}
                      aria-invalid={!!fields.areaId || undefined}
                      className={inputClass}
                    >
                      <option value="">Choose your area…</option>
                      {quote.areas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} — {a.fee ? formatLD(a.fee) : "free"}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              )}
              <Field label="City or town" error={fields.city}>
                {(id) => (
                  <>
                    <TextInput id={id} value={form.city} onChange={set("city")} list="checkout-cities" invalid={!!fields.city} placeholder={CITIES[quote?.country ?? "LR"][0]} />
                    <datalist id="checkout-cities">
                      {CITIES[quote?.country ?? "LR"].map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
              <Field label="Address and landmark" error={fields.address} hint="Street, house colour, nearby landmark — anything that helps the rider find you.">
                {(id) => (
                  <textarea id={id} rows={2} value={form.address} onChange={set("address")} aria-invalid={!!fields.address || undefined} className={`${inputClass} h-auto resize-none py-3`} placeholder="e.g. 12 Randall Street, blue gate opposite the church" />
                )}
              </Field>
              <Field label="Note for the shop or rider (optional)" error={fields.note}>
                {(id) => <TextInput id={id} value={form.note} onChange={set("note")} maxLength={300} placeholder="e.g. Call when you're outside" />}
              </Field>
            </section>

            <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-6">
              <h2 className="font-display text-lg font-extrabold">How will you pay?</h2>
              {(quote?.paymentMethods ?? [{ method: "cod" as PaymentMethod, enabled: true }]).map((m) => (
                <label
                  key={m.method}
                  className={`flex items-center gap-3 rounded-2xl border-2 p-4 ${!m.enabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"} ${method === m.method ? "border-purple bg-purple-tint/40" : "border-line"}`}
                >
                  <input type="radio" name="pay" value={m.method} checked={method === m.method} disabled={!m.enabled} onChange={() => setMethod(m.method)} className="h-4 w-4 accent-[rgb(var(--c-purple))]" />
                  <span className="flex-1">
                    <span className="block font-bold">{PAYMENT_METHOD_LABEL[m.method]}</span>
                    <span className="text-[13px] text-muted">{PAY_HINT[m.method](m.enabled)}</span>
                  </span>
                </label>
              ))}
              {method === "mtn_momo" && (
                <Field label="MTN number to pay from" error={fields.paymentPhone} hint="Leave empty to use the phone number above. You'll get a prompt on this phone to approve with your PIN.">
                  {(id) => (
                    <TextInput
                      id={id}
                      type="tel"
                      value={payPhone}
                      onChange={(e) => {
                        setPayPhone(e.target.value);
                        setFields(({ paymentPhone: _gone, ...rest }) => rest);
                      }}
                      invalid={!!fields.paymentPhone}
                      placeholder={form.phone || "0880 000 000"}
                    />
                  )}
                </Field>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-3 rounded-card border border-line bg-white p-5 lg:sticky lg:top-4">
            <h2 className="font-display text-lg font-extrabold">Your order</h2>
            {!quote ? (
              <p className="text-sm text-muted">Checking prices…</p>
            ) : (
              <>
                {quote.shops.map((s) => (
                  <div key={s.shop.id} className="border-b border-line pb-3 text-sm">
                    <p className="font-bold">{s.shop.name}</p>
                    {quote.lines
                      .filter((l) => l.product?.shop.id === s.shop.id)
                      .map((l) => (
                        <p key={`${l.productId}:${l.variantId ?? ""}`} className="flex justify-between gap-2 text-soft">
                          <span className="truncate">
                            {l.quantity} × {l.product!.name}
                            {l.variantLabel ? ` (${l.variantLabel})` : ""}
                          </span>
                          <span>{formatLD(l.lineTotal)}</span>
                        </p>
                      ))}
                    <p className="flex justify-between text-muted">
                      <span>Delivery</span>
                      <span>{s.deliveryFee ? formatLD(s.deliveryFee) : "Free"}</span>
                    </p>
                  </div>
                ))}
                {quote.discount > 0 && (
                  <p className="flex justify-between text-sm font-bold text-success">
                    <span>Discount ({quote.discountCode})</span>
                    <span>−{formatLD(quote.discount)}</span>
                  </p>
                )}
                <p className="flex justify-between text-base font-extrabold">
                  <span>Total</span>
                  <span>{formatLD(quote.total)}</span>
                </p>
                {quote.areas.length > 0 && !quote.areaId && <p className="text-[12.5px] font-semibold text-warn">Choose your delivery area to see the exact delivery fee.</p>}
                {quote.shops.length > 1 && <p className="text-[12.5px] text-muted">Each shop sends its part separately, so you'll get {quote.shops.length} deliveries.</p>}
              </>
            )}
            <div className="flex flex-col gap-1.5 border-t border-line pt-3">
              <div className="flex gap-2">
                <TextInput
                  aria-label="Discount code"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setCode(codeInput.trim() || null);
                    }
                  }}
                  placeholder="Discount code"
                  className="font-mono uppercase"
                  maxLength={30}
                />
                {code ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setCode(null);
                      setCodeInput("");
                    }}
                  >
                    Remove
                  </Button>
                ) : (
                  <Button type="button" variant="outline" disabled={!codeInput.trim()} onClick={() => setCode(codeInput.trim())}>
                    Apply
                  </Button>
                )}
              </div>
              {code && quote?.discountProblem && <p className="text-[12.5px] font-semibold text-danger">{quote.discountProblem}</p>}
              {code && quote?.discountCode && <p className="text-[12.5px] font-semibold text-success">{quote.discountCode} applied — you save {formatLD(quote.discount)}</p>}
              {fields.code && !quote?.discountProblem && <p className="text-[12.5px] font-semibold text-danger">{fields.code}</p>}
            </div>
            {error && <Alert>{error}</Alert>}
            {quote && !quote.ok && (
              <Link href="/cart" className="text-sm font-bold text-danger underline">
                Something in your cart changed — check it
              </Link>
            )}
            <Button type="submit" size="lg" busy={busy} disabled={!quote?.ok}>
              {method === "cod" ? "Place order" : "Pay now"}{quote ? ` · ${formatLD(quote.total)}` : ""}
            </Button>
          </aside>
        </form>
      </main>
    </>
  );
}
