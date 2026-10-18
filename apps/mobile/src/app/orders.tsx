import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { formatLD, type OrderSummary, type ShopifyOrder } from "@yanabuy/shared";
import { StatusPill } from "@/components/OrderBits";
import { BackBar } from "@/components/Products";
import { Card, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

export default function Orders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { placed } = useLocalSearchParams<{ placed?: string }>();
  const [items, setItems] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [past, setPast] = useState<ShopifyOrder[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.orders
        .list()
        .then((res) => setItems(res.items))
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your orders"));
      api.me
        .shopifyOrders()
        .then((res) => setPast(res.items))
        .catch(() => {});
    }, [])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title="Your orders" onBack={() => (router.canGoBack() ? router.back() : router.replace("/profile"))} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 12 }}>
        {placed && Number(placed) > 1 && <Notice tone="success">{`Thank you! Your ${placed} orders are placed — each shop will confirm its part.`}</Notice>}
        {error && <Notice>{error}</Notice>}
        {items?.map((o) => (
          <Pressable key={o.id} accessibilityRole="link" onPress={() => router.push({ pathname: "/order/[id]", params: { id: o.id } })}>
            <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {o.firstImage ? (
                <Image source={{ uri: o.firstImage }} style={{ width: 56, height: 56, borderRadius: 12 }} contentFit="cover" />
              ) : (
                <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.ground }} />
              )}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 14.5, color: colors.ink }}>
                  {o.shop.name} <Text style={{ fontFamily: font.regular, color: colors.muted }}>· {o.number}</Text>
                </Text>
                <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.textSoft }}>
                  {o.itemCount} {o.itemCount === 1 ? "item" : "items"} · {formatLD(o.total)}
                </Text>
                <StatusPill status={o.status} />
              </View>
            </Card>
          </Pressable>
        ))}
        {items && items.length === 0 && !past.length && <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 20 }}>No orders yet.</Text>}
        {past.length > 0 && (
          <View style={{ gap: 4, marginTop: 10 }}>
            <Text accessibilityRole="header" style={{ fontFamily: font.display, fontSize: 18, color: colors.ink }}>
              From the old YanaBuy store
            </Text>
            <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>Orders you placed before the new app, for your records.</Text>
          </View>
        )}
        {past.map((o) => (
          <Pressable key={o.id} accessibilityRole="button" accessibilityState={{ expanded: open === o.id }} onPress={() => setOpen(open === o.id ? null : o.id)}>
            <Card style={{ gap: 6 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 14.5, color: colors.ink }}>
                {o.vendors ?? "YanaBuy"} <Text style={{ fontFamily: font.regular, color: colors.muted }}>· {o.name}</Text>
              </Text>
              <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.textSoft }}>
                {o.items.reduce((n, i) => n + i.quantity, 0)} items · {formatLD(o.total)} · {new Date(o.placedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {o.cancelledAt ? " · cancelled" : o.fulfillmentStatus === "fulfilled" ? " · delivered" : ""}
              </Text>
              {open === o.id &&
                o.items.map((i, n) => (
                  <Text key={n} style={{ fontFamily: font.regular, fontSize: 13, color: colors.ink }}>
                    {i.quantity} × {i.name} — {formatLD(i.price * i.quantity)}
                  </Text>
                ))}
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
