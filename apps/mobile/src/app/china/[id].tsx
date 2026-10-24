import { useCallback, useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { ApiError, formatLD, formatLiberianPhone, PAYMENT_METHOD_LABEL, type PaymentMethod, type SourcingRequest } from "@yanabuy/shared";
import { BackBar } from "@/components/Products";
import { SOURCING_EVENT, SourcingPill, SourcingProgress } from "@/components/SourcingBits";
import { Button, Card, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, font } from "@/lib/theme";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ChinaRequestScreen() {
  const { id, sent } = useLocalSearchParams<{ id: string; sent?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [r, setR] = useState<SourcingRequest | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.sourcing
      .get(id)
      .then((res) => {
        setR(res.request);
        setMethods(res.payMethods);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load it"));
  }, [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  function cancel() {
    const go = async () => {
      setBusy(true);
      try {
        setR((await api.sourcing.cancel(id)).request);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't cancel");
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === "web") {
      if (globalThis.confirm?.("Cancel this request?")) go();
    } else Alert.alert("Cancel this request?", undefined, [{ text: "Keep it", style: "cancel" }, { text: "Cancel request", style: "destructive", onPress: go }]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + 8 }}>
        <BackBar title={r ? `China request ${r.number}` : "China request"} onBack={() => (router.canGoBack() ? router.back() : router.replace("/china"))} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 32, gap: 12 }} keyboardShouldPersistTaps="handled">
        {error && <Notice>{error}</Notice>}
        {r && (
          <>
            {sent && r.status === "pending" && <Notice tone="success">Request sent! We&apos;ll send you a price, usually within 1–2 days.</Notice>}
            <SourcingPill status={r.status} />
            {["accepted", "ordered", "shipped", "arrived", "delivered"].includes(r.status) && (
              <Card style={{ gap: 8 }}>
                <SourcingProgress status={r.status} />
                {r.quoteDays && r.status !== "delivered" && (
                  <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted, textAlign: "center" }}>Usually about {r.quoteDays} days in total.</Text>
                )}
              </Card>
            )}
            {r.status === "rejected" && <Notice>{`We couldn't source this one${r.rejectReason ? `: ${r.rejectReason}` : "."}`}</Notice>}
            {r.status === "quoted" && r.quotePrice !== null && <QuoteCard request={r} methods={methods} onAccepted={setR} />}

            <Card style={{ gap: 8 }}>
              <Text style={{ fontFamily: font.regular, fontSize: 15, color: colors.ink, lineHeight: 21 }}>{r.description}</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>
                {r.quantity} {r.quantity === 1 ? "piece" : "pieces"}
                {r.budget ? ` · your budget: ${r.budget}` : ""}
              </Text>
              {r.link && (
                <Pressable onPress={() => Linking.openURL(r.link!).catch(() => {})}>
                  <Text numberOfLines={2} style={{ fontFamily: font.semibold, fontSize: 13, color: colors.purple }}>
                    {r.link} ↗
                  </Text>
                </Pressable>
              )}
              {r.images.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {r.images.map((u, i) => (
                    <Image key={u + i} source={{ uri: u }} style={{ width: 64, height: 64, borderRadius: 10 }} />
                  ))}
                </View>
              )}
              {r.quotePrice !== null && r.status !== "quoted" && (
                <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.ink }}>
                  Price <Text style={{ fontFamily: font.bold }}>{formatLD(r.quotePrice)}</Text>
                  {r.paymentMethod ? ` · ${r.paymentStatus === "paid" ? `paid (${PAYMENT_METHOD_LABEL[r.paymentMethod]})` : "pay cash on delivery"}` : ""}
                </Text>
              )}
            </Card>

            <Card style={{ gap: 8 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 11, letterSpacing: 0.6, color: colors.muted }}>WHAT HAPPENED</Text>
              {r.events.map((e, i) => (
                <View key={i}>
                  <Text style={{ fontFamily: font.semibold, fontSize: 13.5, color: colors.ink }}>
                    {SOURCING_EVENT[e.status] ?? e.status}
                    {e.note ? <Text style={{ fontFamily: font.regular, color: colors.textSoft }}> — {e.note}</Text> : null}
                  </Text>
                  <Text style={{ fontFamily: font.regular, fontSize: 12, color: colors.muted }}>{when(e.createdAt)}</Text>
                </View>
              ))}
            </Card>

            {(r.status === "pending" || r.status === "quoted") && <Button title="Cancel this request" variant="ghost" onPress={cancel} busy={busy} />}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFields(({ [k]: _gone, ...rest }) => rest);
  };

  async function accept() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const res = await api.sourcing.accept(r.id, { delivery: { ...form, note: null }, paymentMethod: method, paymentPhone: method !== "cod" && payPhone.trim() ? payPhone : undefined });
      if (res.payment) return router.push({ pathname: "/pay/[id]", params: { id: res.payment.id } });
      onAccepted(res.request);
    } catch (err) {
      const fe = err instanceof ApiError && err.fields ? err.fields : {};
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(fe)) flat[k.replace("delivery.", "")] = v;
      setFields(flat);
      setError(Object.keys(flat).length ? "Please fix the fields marked in red." : err instanceof Error ? err.message : "Couldn't accept");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 10, borderWidth: 2, borderColor: colors.amber }}>
      <Text style={{ fontFamily: font.bold, fontSize: 11, letterSpacing: 0.6, color: colors.muted }}>YOUR PRICE</Text>
      <Text style={{ fontFamily: font.display, fontSize: 30, color: colors.price }}>{formatLD(r.quotePrice!)}</Text>
      <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>
        For {r.quantity} {r.quantity === 1 ? "piece" : "pieces"}, delivered to you · about {r.quoteDays} days
      </Text>
      {r.quoteNote && <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.ink }}>{r.quoteNote}</Text>}
      {!accepting ? (
        <Button title="Accept this price" onPress={() => setAccepting(true)} />
      ) : (
        <>
          <Field label="Name" value={form.name} onChangeText={set("name")} error={fields.name} />
          <Field label="Phone" value={form.phone} onChangeText={set("phone")} error={fields.phone} keyboardType="phone-pad" />
          <Field label="City or town" value={form.city} onChangeText={set("city")} error={fields.city} placeholder="Monrovia" />
          <Field label="Address and landmark" value={form.address} onChangeText={set("address")} error={fields.address} multiline style={{ height: 70, paddingTop: 12, textAlignVertical: "top" }} />
          <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>How will you pay?</Text>
          {methods.map((m) => {
            const on = method === m;
            return (
              <Pressable
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setMethod(m)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 2, borderColor: on ? colors.purple : colors.line, borderRadius: 14, padding: 12 }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? colors.purple : colors.lineStrong, alignItems: "center", justifyContent: "center" }}>
                  {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.purple }} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>{m === "cod" ? "Pay on delivery" : PAYMENT_METHOD_LABEL[m]}</Text>
                  <Text style={{ fontFamily: font.regular, fontSize: 12, color: colors.muted }}>{m === "cod" ? "Pay cash when it arrives" : "Pay now with your PIN"}</Text>
                </View>
              </Pressable>
            );
          })}
          {method === "mtn_momo" && (
            <Field label="MTN number to pay from" value={payPhone} onChangeText={setPayPhone} error={fields.paymentPhone} keyboardType="phone-pad" hint="Leave empty to use the phone above." />
          )}
          {error && <Notice>{error}</Notice>}
          <Button title={method === "cod" ? "Confirm order" : `Pay ${formatLD(r.quotePrice!)}`} onPress={accept} busy={busy} />
        </>
      )}
    </Card>
  );
}
