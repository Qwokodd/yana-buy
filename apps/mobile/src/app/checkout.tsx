import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ApiError, CITIES, deliveryDetailLabel, formatLD, formatLiberianPhone, FULFILMENT_LABEL, payLabel, type Booking, type Fulfilment, type GeoPoint, type PaymentMethod, type Quote } from "@yanabuy/shared";
import { BackBar } from "@/components/Products";
import { DeliveryPin } from "@/components/DeliveryPin";
import { Button, Card, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { useMode } from "@/lib/mode";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { colors, font } from "@/lib/theme";

const FULFIL_HINT: Record<Fulfilment, string> = {
  delivery: "Menu price + delivery fee by distance",
  eat_in: "Menu price only · eat at the restaurant",
  pickup: "Menu price only · collect it yourself",
};

/** The next half-hour times from 30 min from now, for "when will you arrive?" (Liberia = UTC). */
function arrivalTimes(count = 16): string[] {
  const step = 30 * 60_000;
  const first = Math.ceil((Date.now() + 30 * 60_000) / step) * step;
  return Array.from({ length: count }, (_, i) => new Date(first + i * step).toISOString());
}
const timeLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toISOString().slice(0, 10) === iso.slice(0, 10);
  return `${today ? "Today" : d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })} ${iso.slice(11, 16)}`;
};

function Chip({ on, label, sub, onPress }: { on: boolean; label: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: on ? colors.purple : colors.lineStrong, backgroundColor: on ? colors.purple : "#fff" }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? "#fff" : colors.ink }}>{label}</Text>
      {sub ? <Text style={{ fontFamily: font.regular, fontSize: 12, color: on ? "rgba(255,255,255,0.85)" : colors.muted }}>{sub}</Text> : null}
    </Pressable>
  );
}

export default function Checkout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const cart = useCart();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [form, setForm] = useState({ name: user?.fullName ?? "", phone: user ? formatLiberianPhone(user.phone) : "", city: user?.city ?? "", address: "", note: "" });
  const [method, setMethod] = useState<PaymentMethod>("cod");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
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
  const [times] = useState(arrivalTimes);
  const [arriveAt, setArriveAt] = useState<string | null>(null);
  const [partySize, setPartySize] = useState("2");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const delivering = fulfilment === "delivery";

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!cart.items.length) return;
    api.orders
      .quote(cart.items, { areaId, code, lat: pin?.lat ?? null, lng: pin?.lng ?? null, fulfilment })
      .then((res) => {
        setQuote(res.quote);
        if (!res.quote.fulfilments.includes(fulfilment)) setFulfilment("delivery");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't check prices"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(cart.items), areaId, code, pin?.lat, pin?.lng, fulfilment]);

  // Eat in: pay at the restaurant. Keep the chosen way of paying one that's allowed.
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

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFields(({ [k]: _gone, ...rest }) => rest);
  };

  async function place() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.orders.place({
        items: cart.items,
        delivery: delivering
          ? { ...form, note: form.note || null, areaId, lat: pin?.lat ?? null, lng: pin?.lng ?? null }
          : { name: form.name, phone: form.phone, city: "", address: "", note: form.note || null },
        fulfilment,
        arriveAt: !delivering && !bookingId ? arriveAt : null,
        partySize: fulfilment === "eat_in" && !bookingId ? Number(partySize) || null : null,
        bookingId: fulfilment === "eat_in" ? bookingId : null,
        code,
        paymentMethod: method,
        paymentPhone: method !== "cod" && payPhone.trim() ? payPhone : undefined,
      });
      // Mobile money: keep the cart until the payment goes through.
      if (res.payment) return router.replace({ pathname: "/pay/[id]", params: { id: res.payment.id } });
      cart.clear();
      if (res.orders.length === 1) router.replace({ pathname: "/order/[id]", params: { id: res.orders[0].id, placed: "1" } });
      else router.replace({ pathname: "/orders", params: { placed: String(res.orders.length) } });
    } catch (err) {
      const fe = err instanceof ApiError && err.fields ? err.fields : {};
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(fe)) flat[k.replace("delivery.", "")] = v;
      setFields(flat);
      setError(Object.keys(flat).length && !fe.cart ? "Please fix the fields marked in red." : err instanceof Error ? err.message : "Couldn't place the order");
      if (fe.cart) api.orders.quote(cart.items, { areaId, code, lat: pin?.lat ?? null, lng: pin?.lng ?? null, fulfilment }).then((r) => setQuote(r.quote));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + 8 }}>
        <BackBar title="Checkout" onBack={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        {quote && quote.fulfilments.length > 1 && (
          <Card style={{ gap: 10 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>How do you want it?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {quote.fulfilments.map((f) => (
                <Chip key={f} on={fulfilment === f} label={FULFILMENT_LABEL[f]} sub={FULFIL_HINT[f]} onPress={() => setFulfilment(f)} />
              ))}
            </View>
          </Card>
        )}
        {quote?.fulfilmentProblem ? <Notice>{quote.fulfilmentProblem}</Notice> : null}

        {!delivering && (
          <Card style={{ gap: 14 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>{fulfilment === "eat_in" ? "Your visit" : "Your pickup"}</Text>
            {quote?.shops[0] ? (
              <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>
                At {quote.shops[0].shop.name}, {quote.shops[0].shop.city}. {fulfilment === "eat_in" ? "They'll have your food ready when you arrive." : "Come and collect it when it's ready."}
              </Text>
            ) : null}
            <Field label="Name" value={form.name} onChangeText={set("name")} error={fields.name} autoComplete="name" />
            <Field label="Phone the restaurant can call" value={form.phone} onChangeText={set("phone")} error={fields.phone} keyboardType="phone-pad" />
            {fulfilment === "eat_in" && myBookings.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>Table booking (optional)</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <Chip on={!bookingId} label="No booking" sub="Just set a time" onPress={() => setBookingId(null)} />
                  {myBookings.map((b) => (
                    <Chip key={b.id} on={bookingId === b.id} label={`${b.number} · ${timeLabel(b.startsAt)}`} sub={`${b.partySize} people · ${b.status}`} onPress={() => setBookingId(b.id)} />
                  ))}
                </View>
                {fields.bookingId ? <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{fields.bookingId}</Text> : null}
              </View>
            )}
            {!bookingId && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>{fulfilment === "eat_in" ? "When will you arrive?" : "When will you collect it?"}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {fulfilment === "pickup" && <Chip on={!arriveAt} label="When it's ready" onPress={() => setArriveAt(null)} />}
                  {times.map((t) => (
                    <Chip key={t} on={arriveAt === t} label={timeLabel(t)} onPress={() => {
                      setArriveAt(t);
                      setFields(({ arriveAt: _gone, ...rest }) => rest);
                    }} />
                  ))}
                </ScrollView>
                {fields.arriveAt ? <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{fields.arriveAt}</Text> : null}
              </View>
            )}
            {fulfilment === "eat_in" && !bookingId && (
              <Field label="How many people?" value={partySize} onChangeText={setPartySize} error={fields.partySize} keyboardType="number-pad" maxLength={2} />
            )}
            {fulfilment === "eat_in" && quote?.shops[0] ? (
              <Pressable onPress={() => router.push({ pathname: "/book", params: { slug: quote.shops[0].shop.slug } })}>
                <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>Want a table held? Book a table first →</Text>
              </Pressable>
            ) : null}
            <Field label="Note for the restaurant (optional)" value={form.note} onChangeText={set("note")} maxLength={300} />
          </Card>
        )}

        {delivering && (
        <Card style={{ gap: 14 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Where should we deliver?</Text>
          <DeliveryPin
            forOther={forOther}
            onForOther={(other) => {
              setForOther(other);
              setForm((f) =>
                other
                  ? { ...f, name: "", phone: "", address: "" }
                  : { ...f, name: user?.fullName ?? "", phone: user ? formatLiberianPhone(user.phone) : "", city: user?.city ?? f.city }
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
          <Field label={forOther ? "Their name" : "Name"} value={form.name} onChangeText={set("name")} error={fields.name} autoComplete="name" />
          <Field label={forOther ? "Their phone (the rider calls this)" : "Phone the rider can call"} value={form.phone} onChangeText={set("phone")} error={fields.phone} keyboardType="phone-pad" />
          {!!quote?.areas.length && (
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>Delivery area</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {quote.areas.map((a) => {
                  const on = areaId === a.id;
                  return (
                    <Pressable
                      key={a.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        setAreaId(a.id);
                        setFields(({ areaId: _gone, ...rest }) => rest);
                      }}
                      style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: on ? colors.purple : fields.areaId ? colors.danger : colors.lineStrong, backgroundColor: on ? colors.purple : "#fff" }}
                    >
                      <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? "#fff" : colors.ink }}>{a.name}</Text>
                      <Text style={{ fontFamily: font.regular, fontSize: 12, color: on ? "rgba(255,255,255,0.85)" : colors.muted }}>{a.fee ? formatLD(a.fee) : "Free"}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {fields.areaId ? <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{fields.areaId}</Text> : null}
            </View>
          )}
          <Field label="City or town" value={form.city} onChangeText={set("city")} error={fields.city} placeholder={CITIES[quote?.country ?? "LR"][0]} />
          <Field
            label="Address and landmark"
            value={form.address}
            onChangeText={set("address")}
            error={fields.address}
            multiline
            placeholder="e.g. 12 Randall Street, blue gate opposite the church"
            style={{ height: 80, paddingTop: 12, textAlignVertical: "top" }}
          />
          <Field label="Note for the shop or rider (optional)" value={form.note} onChangeText={set("note")} maxLength={300} />
        </Card>
        )}

        <Card style={{ gap: 10 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>How will you pay?</Text>
          {(quote?.paymentMethods ?? []).map((m) => {
            const on = method === m.method;
            return (
              <Pressable
                key={m.method}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: !m.enabled }}
                disabled={!m.enabled}
                onPress={() => setMethod(m.method)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 2, borderColor: on ? colors.purple : colors.line, padding: 14, opacity: m.enabled ? 1 : 0.5 }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? colors.purple : colors.lineStrong, alignItems: "center", justifyContent: "center" }}>
                  {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.purple }} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 14.5, color: colors.ink }}>{payLabel(m.method, fulfilment)}</Text>
                  <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>{m.method === "cod" ? "Pay at the restaurant" : fulfilment === "eat_in" ? "Eat-in orders are paid at the restaurant" : m.method === "mtn_momo" && m.enabled ? "Approve on your phone with your MoMo PIN" : "Coming soon"}</Text>
                </View>
              </Pressable>
            );
          })}
          {quote && !quote.paymentMethods.some((m) => m.enabled) && (
            <Text style={{ fontFamily: font.semibold, fontSize: 13, color: colors.danger }}>Online payment isn&apos;t switched on yet, so orders can&apos;t be placed right now. Please try again soon.</Text>
          )}
          {method === "mtn_momo" && (
            <Field
              label="MTN number to pay from"
              value={payPhone}
              onChangeText={(v) => {
                setPayPhone(v);
                setFields(({ paymentPhone: _gone, ...rest }) => rest);
              }}
              error={fields.paymentPhone}
              keyboardType="phone-pad"
              placeholder={form.phone || "0880 000 000"}
              hint="Leave empty to use the phone above. You'll get a prompt to approve with your PIN."
            />
          )}
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Your order</Text>
          {!quote ? (
            <Text style={{ fontFamily: font.regular, color: colors.muted }}>Checking prices…</Text>
          ) : (
            <>
              {quote.shops.map((s) => (
                <View key={s.shop.id} style={{ gap: 3, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>{s.shop.name}</Text>
                  {quote.lines
                    .filter((l) => l.product?.shop.id === s.shop.id)
                    .map((l) => (
                      <View key={`${l.productId}:${l.variantId ?? ""}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                        <Text numberOfLines={1} style={{ flex: 1, fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>
                          {l.quantity} × {l.product!.name}
                          {l.variantLabel ? ` (${l.variantLabel})` : ""}
                        </Text>
                        <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>{formatLD(l.lineTotal)}</Text>
                      </View>
                    ))}
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted }}>
                      {delivering ? `Delivery${s.deliveryDetail ? ` (${deliveryDetailLabel(s.deliveryDetail)})` : ""}` : FULFILMENT_LABEL[fulfilment]}
                    </Text>
                    <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted }}>{!delivering ? "No delivery fee" : s.deliveryProblem ? "—" : s.deliveryFee ? formatLD(s.deliveryFee) : "Free"}</Text>
                  </View>
                  {s.deliveryProblem ? <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{s.deliveryProblem}</Text> : null}
                </View>
              ))}
              {quote.discount > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.success }}>Discount ({quote.discountCode})</Text>
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.success }}>−{formatLD(quote.discount)}</Text>
                </View>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: font.extrabold, fontSize: 16, color: colors.ink }}>Total</Text>
                <Text style={{ fontFamily: font.extrabold, fontSize: 16, color: colors.ink }}>{formatLD(quote.total)}</Text>
              </View>
              {quote.shops.length > 1 && (
                <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>Each shop sends its part separately — {quote.shops.length} deliveries.</Text>
              )}
            </>
          )}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <Field label="Discount code" value={codeInput} onChangeText={setCodeInput} autoCapitalize="characters" autoCorrect={false} maxLength={30} error={code ? (quote?.discountProblem ?? fields.code) : undefined} />
            </View>
            <Button
              title={code ? "Remove" : "Apply"}
              variant="outline"
              disabled={!code && !codeInput.trim()}
              onPress={() => {
                if (code) {
                  setCode(null);
                  setCodeInput("");
                } else setCode(codeInput.trim());
              }}
            />
          </View>
          {code && quote?.discountCode ? <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.success }}>{`${quote.discountCode} applied — you save ${formatLD(quote.discount)}`}</Text> : null}
          {delivering && quote && quote.areas.length > 0 && !quote.areaId && quote.shops.some((s) => !s.deliveryDetail) ? <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.warn }}>Choose your delivery area above to see the exact delivery fee.</Text> : null}
          {error && <Notice>{error}</Notice>}
          {quote && !quote.ok && !quote.fulfilmentProblem && !quote.shops.some((s) => s.deliveryProblem) && <Notice>Something in your cart changed — go back to the cart to check it.</Notice>}
          <Button title={`${method === "cod" ? "Place order" : "Pay now"}${quote ? ` · ${formatLD(quote.total)}` : ""}`} onPress={place} busy={busy} disabled={!quote?.ok} style={{ marginTop: 6 }} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
