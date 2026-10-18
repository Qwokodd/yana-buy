import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { formatLiberianPhone, type Booking } from "@yanabuy/shared";
import { BookingStatusPill, bookingWhat, bookingWhen } from "@/components/BookingBits";
import { BackBar } from "@/components/Products";
import { Button, Card, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

export default function BookingScreen() {
  const { id, new: fresh } = useLocalSearchParams<{ id: string; new?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [b, setB] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.bookings
      .get(id)
      .then((r) => setB(r.booking))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load the booking"));
  }, [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  function cancel() {
    const go = async () => {
      setBusy(true);
      try {
        setB((await api.bookings.cancel(id, "Cancelled by the customer")).booking);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't cancel");
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === "web") {
      if (globalThis.confirm?.("Cancel this booking?")) go();
    } else Alert.alert("Cancel this booking?", undefined, [{ text: "Keep it", style: "cancel" }, { text: "Cancel booking", style: "destructive", onPress: go }]);
  }

  const open = b && (b.status === "requested" || b.status === "confirmed") && new Date(b.startsAt).getTime() > Date.now();
  const line = (label: string, value: string) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted }}>{label}</Text>
      <Text style={{ fontFamily: font.semibold, fontSize: 14, color: colors.ink, flexShrink: 1, textAlign: "right" }}>{value}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title={b ? `Booking ${b.number}` : "Booking"} onBack={() => (router.canGoBack() ? router.back() : router.replace("/bookings"))} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 12 }}>
        {error && <Notice>{error}</Notice>}
        {b && (
          <>
            {fresh && b.status === "requested" && <Notice tone="success">{`Request sent! ${b.shop.name} will confirm it — we'll let you know.`}</Notice>}
            {b.status === "confirmed" && <Notice tone="success">You're booked. See you there!</Notice>}
            {(b.status === "declined" || b.status === "cancelled") && b.statusNote && <Notice tone="info">{b.statusNote}</Notice>}
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <Text style={{ fontFamily: font.display, fontSize: 19, color: colors.ink, flex: 1 }}>{bookingWhat(b)}</Text>
                <BookingStatusPill status={b.status} />
              </View>
              {line("When", bookingWhen(b.startsAt))}
              {line("How long", `${b.durationMinutes} min`)}
              {b.partySize ? line("People", String(b.partySize)) : null}
              {line("Name", b.contactName)}
              {line("Phone", formatLiberianPhone(b.contactPhone))}
              {b.note ? line("Your note", b.note) : null}
            </Card>
            <Card style={{ gap: 8 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>{b.shop.name}</Text>
              {b.shop.address ? <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>{`📍 ${b.shop.address}`}</Text> : null}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button title="Call" variant="outline" onPress={() => Linking.openURL(`tel:${b.shop.phone}`).catch(() => {})} />
                </View>
                {b.shop.address ? (
                  <View style={{ flex: 1 }}>
                    <Button title="Directions" variant="outline" onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.shop.address)}`).catch(() => {})} />
                  </View>
                ) : null}
              </View>
              <Button title="View shop" variant="outline" onPress={() => router.push({ pathname: "/shop/[slug]", params: { slug: b.shop.slug } })} />
            </Card>
            {open && <Button title="Cancel this booking" variant="danger" busy={busy} onPress={cancel} />}
          </>
        )}
      </ScrollView>
    </View>
  );
}
