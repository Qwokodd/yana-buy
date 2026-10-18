import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import type { Booking } from "@yanabuy/shared";
import { BookingStatusPill, bookingWhat, bookingWhen } from "@/components/BookingBits";
import { BackBar } from "@/components/Products";
import { Card, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

export default function Bookings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.bookings
        .mine()
        .then((r) => setItems(r.items))
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load bookings"));
    }, [])
  );
  const now = Date.now();
  const ahead = items?.filter((b) => (b.status === "requested" || b.status === "confirmed") && new Date(b.startsAt).getTime() >= now - 3600_000) ?? [];
  const before = items?.filter((b) => !ahead.includes(b)) ?? [];

  const row = (b: Booking) => (
    <Pressable key={b.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/booking/[id]", params: { id: b.id } })}>
      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink, flex: 1 }} numberOfLines={1}>{b.shop.name}</Text>
          <BookingStatusPill status={b.status} />
        </View>
        <Text style={{ fontFamily: font.semibold, fontSize: 14, color: colors.textSoft }}>{bookingWhat(b)}</Text>
        <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>{`${bookingWhen(b.startsAt)} · ${b.number}`}</Text>
      </Card>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title="Bookings" onBack={() => (router.canGoBack() ? router.back() : router.replace("/profile"))} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 10 }}>
        {error && <Notice>{error}</Notice>}
        {items === null && !error && <Text style={{ fontFamily: font.regular, color: colors.muted }}>Loading…</Text>}
        {items?.length === 0 && (
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 24 }}>
            No bookings yet. Book a table or an appointment from a shop's page.
          </Text>
        )}
        {ahead.length > 0 && <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink }}>Coming up</Text>}
        {ahead.map(row)}
        {before.length > 0 && <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink, marginTop: 8 }}>Earlier</Text>}
        {before.map(row)}
      </ScrollView>
    </View>
  );
}
