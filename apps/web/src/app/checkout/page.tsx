"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CITIES, deliveryDetailLabel, formatLD, formatLiberianPhone, FULFILMENT_LABEL, payLabel, type Booking, type Fulfilment, type GeoPoint, type PaymentMethod, type Quote } from "@yanabuy/shared";
import { Alert, Button, Field, TextInput, fieldErrorsOf, inputClass, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { DeliveryPin } from "@/components/DeliveryPin";
import { useCart } from "@/lib/cart";
import { api } from "@/lib/api";
import { useMode } from "@/lib/mode";

const FULFIL_HINT: Record<Fulfilment, string> = {
  delivery: "Menu price + delivery fee (worked out by distance). A rider brings it to you.",
  eat_in: "Menu price only — no delivery fee. Come and eat at the restaurant, pay there.",
  pickup: "Menu price only — no delivery fee. Come and collect it yourself.",
};

/** "2026-10-22T18:30" in Liberia time (UTC) for a datetime-local box, 30 min from now by default. */
const localInput = (d: Date) => d.toISOString().slice(0, 16);

const PAY_HINT: Record<PaymentMethod, (enabled: boolean) => string> = {
  cod: () => "Pay at the restaurant.",
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
  // Delivering to themselves at their current location (default), or to someone else / another place.
  const [forOther, setForOther] = useState(false);
  const [pin, setPin] = useState<GeoPoint | null>(null);
  // Delivery (menu + delivery fee), or eat in / pickup at the restaurant (menu price only).
  // Starts on what the buyer picked when they switched to Food (goods carts fall back to delivery).
  const { foodHow } = useMode();
  const [fulfilment, setFulfilment] = useState<Fulfilment>(foodHow);
  const [arriveAt, setArriveAt] = useState(() => localInput(new Date(Date.now() + 30 * 60_000)));
  const [partySize, setPartySize] = useState("2");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const delivering = fulfilment === "delivery";

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
        // Their own name and phone; the last address as a starting point.
        if (d) {
          setForm((f) => ({ ...f, city: d.city || f.city, address: d.address, note: "" }));
          setLastArea(d.area ?? null);
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (placing) return;
    if (!cart.items.length) return;
    api.orders
      .quote(cart.items, { areaId, code, lat: pin?.lat ?? null, lng: pin?.lng ?? null, fulfilment })
      .then((res) => {
        setQuote(res.quote);
        // The cart changed and this restaurant (or mix of shops) doesn't offer it any more.
        if (!res.quote.fulfilments.includes(fulfilment)) setFulfilment("delivery");
      })
      .catch((err) => setError(messageOf(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(cart.items), areaId, code, pin?.lat, pin?.lng, fulfilment]);

  // Eat in: pay at the restaurant. Pick the first way of paying that's allowed.
  useEffect(() => {
    if (!quote) return;
    if (!quote.paymentMethods.find((m) => m.method === method)?.enabled) setMethod(quote.paymentMethods.find((m) => m.enabled)?.method ?? "cod");
  }, [quote, method]);

  // Eat in: the buyer's upcoming table bookings at this restaurant, to attach one.
  const restaurantId = quote?.shops.length === 1 ? quote.shops[0].shop.id : null;
  useEffect(() => {
    if (fulfilment !== "eat_in" || !restaurantId) return;
    api.bookings
      .mine()
      .then((r) => setMyBookings(r.items.filter((b) => b.shop.id === restaurantId && b.kind === "table" && (b.status === "requested" || b.status === "confirmed") && new Date(b.startsAt).getTime() > Date.now() - 3600_000)))
      .catch(() => setMyBookings([]));
  }, [fulfilment, restaurantId]);

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
        delivery: delivering
          ? { ...form, note: form.note || null, areaId, lat: pin?.lat ?? null, lng: pin?.lng ?? null }
          : { name: form.name, phone: form.phone, city: "", address: "", note: form.note || null },
        fulfilment,
        // The box is Liberia time = UTC.
        arriveAt: !delivering && !bookingId && arriveAt ? new Date(`${arriveAt}:00Z`).toISOString() : null,
        partySize: fulfilment === "eat_in" && !bookingId ? Number(partySize) || null : null,
        bookingId: fulfilment === "eat_in" ? bookingId : null,
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
      if (fe.cart) api.orders.quote(cart.items, { areaId, code, lat: pin?.lat ?? null, lng: pin?.lng ?? null, fulfilment }).then((r) => setQuote(r.quote));
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
            {quote && quote.fulfilments.length > 1 && (
              <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-6">
                <h2 className="font-display text-lg font-extrabold">How do you want it?</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  {quote.fulfilments.map((f) => (
                    <label key={f} className={`flex cursor-pointer flex-col gap-1 rounded-2xl border-2 p-4 ${fulfilment === f ? "border-purple bg-purple-tint/40" : "border-line"}`}>
                      <span className="flex items-center gap-2 font-bold">
                        <input type="radio" name="fulfilment" value={f} checked={fulfilment === f} onChange={() => setFulfilment(f)} className="h-4 w-4 accent-[rgb(var(--c-purple))]" />
                        {FULFILMENT_LABEL[f]}
                      </span>
                      <span className="text-[13px] text-muted">{FULFIL_HINT[f]}</span>
                    </label>
                  ))}
                </div>
              </section>
            )}
            {quote?.fulfilmentProblem && <Alert>{quote.fulfilmentProblem}</Alert>}

            {!delivering && (
              <section className="flex flex-col gap-4 rounded-card border border-line bg-white p-6">
                <h2 className="font-display text-lg font-extrabold">{fulfilment === "eat_in" ? "Your visit" : "Your pickup"}</h2>
                {quote?.shops[0] && (
                  <p className="text-sm text-soft">
                    At <span className="font-bold">{quote.shops[0].shop.name}</span>, {quote.shops[0].shop.city}. {fulfilment === "eat_in" ? "They'll have your food ready when you arrive." : "Come and collect it when it's ready."}
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" error={fields.name}>
                    {(id) => <TextInput id={id} value={form.name} onChange={set("name")} invalid={!!fields.name} autoComplete="name" />}
                  </Field>
                  <Field label="Phone the restaurant can call" error={fields.phone}>
                    {(id) => <TextInput id={id} type="tel" value={form.phone} onChange={set("phone")} invalid={!!fields.phone} autoComplete="tel" />}
                  </Field>
                </div>
                {fulfilment === "eat_in" && myBookings.length > 0 && (
                  <Field label="Table booking (optional)" error={fields.bookingId} hint="Attach one of your table bookings here — we'll use its time and party size.">
                    {(id) => (
                      <select id={id} value={bookingId ?? ""} onChange={(e) => setBookingId(e.target.value || null)} className={inputClass}>
                        <option value="">No booking — just set a time</option>
                        {myBookings.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.number} · {new Date(b.startsAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} · {b.partySize} people ({b.status})
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                )}
                {!bookingId && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={fulfilment === "eat_in" ? "When will you arrive?" : "When will you collect it?"} error={fields.arriveAt}>
                      {(id) => <TextInput id={id} type="datetime-local" value={arriveAt} onChange={(e) => setArriveAt(e.target.value)} invalid={!!fields.arriveAt} />}
                    </Field>
                    {fulfilment === "eat_in" && (
                      <Field label="How many people?" error={fields.partySize}>
                        {(id) => <TextInput id={id} type="number" min={1} max={50} value={partySize} onChange={(e) => setPartySize(e.target.value)} invalid={!!fields.partySize} />}
                      </Field>
                    )}
                  </div>
                )}
                {fulfilment === "eat_in" && quote?.shops[0] && (
                  <p className="text-[13px] text-muted">
                    Want a table held for you?{" "}
                    <Link href={`/shop/${quote.shops[0].shop.slug}/book`} className="font-bold text-purple hover:underline">
                      Book a table
                    </Link>{" "}
                    first, then come back and pick it here.
                  </p>
                )}
                <Field label="Note for the restaurant (optional)" error={fields.note}>
                  {(id) => <TextInput id={id} value={form.note} onChange={set("note")} maxLength={300} placeholder={fulfilment === "eat_in" ? "e.g. A table by the window, please" : "e.g. Extra pepper"} />}
                </Field>
              </section>
            )}

            {delivering && (
            <section className="flex flex-col gap-4 rounded-card border border-line bg-white p-6">
              <h2 className="font-display text-lg font-extrabold">Where should we deliver?</h2>
              <DeliveryPin
                forOther={forOther}
                onForOther={(other) => {
                  setForOther(other);
                  // Someone else: their name, number and address. Back to me: mine again.
                  setForm((f) =>
                    other
                      ? { ...f, name: "", phone: "", address: "" }
                      : { ...f, name: user?.fullName ?? "", phone: formatLiberianPhone(user?.phone ?? null), city: user?.city ?? f.city }
                  );
                }}
                pin={pin}
                onPin={setPin}
                onAddress={(address) => {
                  setForm((f) => ({ ...f, address }));
                  setFields(({ address: _gone, ...rest }) => rest);
                }}
                start={user?.location ?? null}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={forOther ? "Their name" : "Name"} error={fields.name}>
                  {(id) => <TextInput id={id} value={form.name} onChange={set("name")} invalid={!!fields.name} autoComplete="name" />}
                </Field>
                <Field label={forOther ? "Their phone (the rider calls this)" : "Phone the rider can call"} error={fields.phone}>
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
            )}

            <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-6">
              <h2 className="font-display text-lg font-extrabold">How will you pay?</h2>
              {(quote?.paymentMethods ?? []).map((m) => (
                <label
                  key={m.method}
                  className={`flex items-center gap-3 rounded-2xl border-2 p-4 ${!m.enabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"} ${method === m.method ? "border-purple bg-purple-tint/40" : "border-line"}`}
                >
                  <input type="radio" name="pay" value={m.method} checked={method === m.method} disabled={!m.enabled} onChange={() => setMethod(m.method)} className="h-4 w-4 accent-[rgb(var(--c-purple))]" />
                  <span className="flex-1">
                    <span className="block font-bold">{payLabel(m.method, fulfilment)}</span>
                    <span className="text-[13px] text-muted">
                      {m.method === "cod" && !delivering
                        ? fulfilment === "eat_in"
                          ? "Pay at the restaurant when you eat."
                          : "Pay at the restaurant when you collect it."
                        : fulfilment === "eat_in" && !m.enabled
                          ? "Eat-in orders are paid at the restaurant"
                          : PAY_HINT[m.method](m.enabled)}
                    </span>
                  </span>
                </label>
              ))}
              {quote && !quote.paymentMethods.some((m) => m.enabled) && (
                <Alert tone="warn">Online payment isn&rsquo;t switched on yet, so orders can&rsquo;t be placed right now. Please try again soon.</Alert>
              )}
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
                    {!delivering ? (
                      <p className="flex justify-between text-muted">
                        <span>{FULFILMENT_LABEL[fulfilment]}</span>
                        <span>No delivery fee</span>
                      </p>
                    ) : (
                    <p className="flex justify-between text-muted">
                      <span>Delivery{s.deliveryDetail ? ` (${deliveryDetailLabel(s.deliveryDetail)})` : ""}</span>
                      <span>{s.deliveryProblem ? "—" : s.deliveryFee ? formatLD(s.deliveryFee) : "Free"}</span>
                    </p>
                    )}
                    {s.deliveryProblem && <p className="text-[12.5px] font-semibold text-danger">{s.deliveryProblem}</p>}
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
                {delivering && quote.areas.length > 0 && !quote.areaId && quote.shops.some((s) => !s.deliveryDetail) && <p className="text-[12.5px] font-semibold text-warn">Choose your delivery area to see the exact delivery fee.</p>}
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
            {quote && !quote.ok && !quote.fulfilmentProblem && !quote.shops.some((s) => s.deliveryProblem) && (
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
