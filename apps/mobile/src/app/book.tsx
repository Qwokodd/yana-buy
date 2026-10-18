import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ApiError, formatLD, formatLiberianPhone, type BookingSlot, type Product, type ProductCard, type PublicShop } from "@yanabuy/shared";
import { BackBar } from "@/components/Products";
import { Stepper } from "@/components/OrderBits";
import { Button, Card, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, font } from "@/lib/theme";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayLabel = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Book a table (restaurants) or an appointment (services). ?slug=<shop>&product=<service id> */
export default function Book() {
  const { slug, product: productId } = useLocalSearchParams<{ slug: string; product?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [shop, setShop] = useState<PublicShop | null>(null);
  const [service, setService] = useState<Product | null>(null);
  const [services, setServices] = useState<ProductCard[]>([]);
  const [date, setDate] = useState(iso(new Date()));
  const [slots, setSlots] = useState<BookingSlot[] | null>(null);
  const [slot, setSlot] = useState<BookingSlot | null>(null);
  const [party, setParty] = useState(2);
  const [form, setForm] = useState({ name: user?.fullName ?? "", phone: user ? formatLiberianPhone(user.phone) : "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const table = shop?.kind === "restaurant";

  useEffect(() => {
    api.public
      .shop(slug)
      .then((r) => setShop(r.shop))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load the shop"));
    if (productId)
      api.public
        .product(productId)
        .then((r) => r.product.bookable && setService(r.product))
        .catch(() => {});
  }, [slug, productId]);

  useEffect(() => {
    if (shop && shop.kind !== "restaurant" && !productId)
      api.public
        .products({ shop: slug, bookable: true })
        .then((r) => setServices(r.items))
        .catch(() => {});
  }, [shop, slug, productId]);

  const ready = !!shop?.booking && (table || !!service);
  useEffect(() => {
    if (!ready) return;
    setSlots(null);
    setSlot(null);
    api.public
      .availability(slug, date, service?.id)
      .then((r) => setSlots(r.slots))
      .catch(() => setSlots([]));
  }, [ready, slug, date, service?.id]);

  const days = useMemo(() => {
    const start = new Date(`${iso(new Date())}T00:00:00Z`);
    return Array.from({ length: Math.min(shop?.booking?.daysAhead ?? 14, 21) }, (_, i) => new Date(start.getTime() + i * 86400_000));
  }, [shop?.booking?.daysAhead]);

  async function send() {
    if (!user) return router.push("/login");
    if (!slot || !shop) return setError("Pick a time");
    setBusy(true);
    setError(null);
    try {
      const r = await api.bookings.create({
        shopId: shop.id,
        productId: service?.id ?? null,
        startsAt: slot.startsAt,
        partySize: table ? party : null,
        contactName: form.name,
        contactPhone: form.phone,
        note: form.note || null,
      });
      router.replace({ pathname: "/booking/[id]", params: { id: r.booking.id, new: "1" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't book");
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + 8 }}>
        <BackBar title={table ? "Book a table" : "Book an appointment"} onBack={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        {error && !shop && <Notice>{error}</Notice>}
        {shop && !shop.booking && <Notice tone="info">{`${shop.name} isn't taking bookings online right now. Call ${formatLiberianPhone(shop.phone)}.`}</Notice>}
        {shop?.booking && !table && !service && (
          <Card style={{ gap: 8 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>Which service?</Text>
            {services.length === 0 && <Text style={{ fontFamily: font.regular, color: colors.muted }}>No services to book yet.</Text>}
            {services.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" onPress={() => api.public.product(p.id).then((r) => setService(r.product))} style={{ flexDirection: "row", justifyContent: "space-between", borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12 }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 14, color: colors.ink, flex: 1 }}>{p.name}</Text>
                <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>{formatLD(p.price)}</Text>
              </Pressable>
            ))}
          </Card>
        )}
        {ready && shop?.booking && (
          <Card style={{ gap: 14 }}>
            <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink }}>{shop.name}</Text>
            {service && <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>{`${service.name} · ${formatLD(service.price)} · ${service.durationMinutes ?? 60} min · pay at your appointment`}</Text>}
            {shop.booking.note && <Notice tone="info">{shop.booking.note}</Notice>}
            <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>Day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {days.map((d) => {
                const v = iso(d);
                const on = v === date;
                return (
                  <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setDate(v)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, borderWidth: 2, borderColor: on ? colors.purple : colors.lineStrong, backgroundColor: on ? colors.purple : "#fff" }}>
                    <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? "#fff" : colors.ink }}>{dayLabel(d)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>Time</Text>
            {slots === null ? (
              <Text style={{ fontFamily: font.regular, color: colors.muted }}>Checking free times…</Text>
            ) : slots.length === 0 ? (
              <Text style={{ fontFamily: font.regular, color: colors.muted }}>No times this day — try another day.</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {slots.map((s) => {
                  const on = slot?.startsAt === s.startsAt;
                  const full = s.left < 1;
                  return (
                    <Pressable key={s.startsAt} accessibilityRole="button" accessibilityState={{ selected: on, disabled: full }} disabled={full} onPress={() => setSlot(s)} style={{ height: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 2, justifyContent: "center", borderColor: on ? colors.purple : colors.lineStrong, backgroundColor: on ? colors.purple : "#fff", opacity: full ? 0.4 : 1 }}>
                      <Text style={{ fontFamily: font.bold, fontSize: 14, color: on ? "#fff" : colors.ink, textDecorationLine: full ? "line-through" : "none" }}>{s.time}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {table && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.textSoft }}>People</Text>
                <Stepper label="people" value={party} max={shop.booking.maxPartySize} onChange={(v) => setParty(Math.max(1, v))} />
              </View>
            )}
            {fields.partySize ? <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{fields.partySize}</Text> : null}
            <Field label="Name for the booking" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} error={fields.contactName} />
            <Field label="Phone" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} error={fields.contactPhone} keyboardType="phone-pad" />
            <Field label="Anything they should know? (optional)" value={form.note} onChangeText={(v) => setForm({ ...form, note: v })} maxLength={300} />
            {error && <Notice>{error}</Notice>}
            <Button title={user ? (slot ? `Request · ${slot.time}` : "Pick a time") : "Log in to book"} onPress={send} busy={busy} disabled={!!user && !slot} />
            <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted, textAlign: "center" }}>{`${shop.name} confirms your booking — we'll let you know.`}</Text>
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
