import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ApiError, CITIES, formatLD, formatLiberianPhone, PAYMENT_METHOD_LABEL, type PaymentMethod, type Quote } from "@yanabuy/shared";
import { BackBar } from "@/components/Products";
import { Button, Card, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { colors, font } from "@/lib/theme";

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

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!cart.items.length) return;
    api.orders
      .quote(cart.items, { areaId, code })
      .then((res) => setQuote(res.quote))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't check prices"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(cart.items), areaId, code]);

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
        delivery: { ...form, note: form.note || null, areaId },
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
      if (fe.cart) api.orders.quote(cart.items, { areaId, code }).then((r) => setQuote(r.quote));
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
        <Card style={{ gap: 14 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Where should we deliver?</Text>
          <Field label="Name" value={form.name} onChangeText={set("name")} error={fields.name} autoComplete="name" />
          <Field label="Phone the rider can call" value={form.phone} onChangeText={set("phone")} error={fields.phone} keyboardType="phone-pad" />
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

        <Card style={{ gap: 10 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>How will you pay?</Text>
          {(quote?.paymentMethods ?? [{ method: "cod" as PaymentMethod, enabled: true }]).map((m) => {
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
                  <Text style={{ fontFamily: font.bold, fontSize: 14.5, color: colors.ink }}>{PAYMENT_METHOD_LABEL[m.method]}</Text>
                  <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>{m.method === "cod" ? "Pay the rider in cash when it arrives" : m.method === "mtn_momo" && m.enabled ? "Approve on your phone with your MoMo PIN" : "Coming soon"}</Text>
                </View>
              </Pressable>
            );
          })}
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
                    <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted }}>Delivery</Text>
                    <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted }}>{s.deliveryFee ? formatLD(s.deliveryFee) : "Free"}</Text>
                  </View>
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
          {quote && quote.areas.length > 0 && !quote.areaId ? <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.warn }}>Choose your delivery area above to see the exact delivery fee.</Text> : null}
          {error && <Notice>{error}</Notice>}
          {quote && !quote.ok && <Notice>Something in your cart changed — go back to the cart to check it.</Notice>}
          <Button title={`${method === "cod" ? "Place order" : "Pay now"}${quote ? ` · ${formatLD(quote.total)}` : ""}`} onPress={place} busy={busy} disabled={!quote?.ok} style={{ marginTop: 6 }} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
