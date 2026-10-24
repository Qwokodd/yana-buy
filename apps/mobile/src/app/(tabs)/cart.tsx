import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { formatLD, type Quote, BUY_WORDS } from "@yanabuy/shared";
import { Stepper } from "@/components/OrderBits";
import { Button, Card, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { useMode } from "@/lib/mode";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { colors, font } from "@/lib/theme";

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();
  const { user } = useAuth();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(cart.items);
  const { foodHow, mode } = useMode();

  const load = useCallback(() => {
    if (!cart.items.length) return setQuote(null);
    api.orders
      // Food: priced for delivery / pickup / eat in as picked (falls back to delivery for goods, or if the restaurant doesn't offer it).
      .quote(cart.items, { fulfilment: foodHow })
      .then((res) => (res.quote.fulfilments.includes(foodHow) ? res : api.orders.quote(cart.items)))
      .then((res) => {
        setQuote(res.quote);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't check prices"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, foodHow]);
  useEffect(load, [load]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.ground }} contentContainerStyle={{ paddingTop: insets.top + 18, paddingHorizontal: 18, paddingBottom: 32, gap: 14 }}>
      <Text style={{ fontFamily: font.display, fontSize: 26, color: colors.ink }}>{BUY_WORDS[mode].yourBasket}</Text>
      {error && <Notice>{error}</Notice>}
      {!cart.items.length ? (
        <Card style={{ alignItems: "center", gap: 8, paddingVertical: 26 }}>
          <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink }}>{BUY_WORDS[mode].yourBasket} is empty</Text>
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted, textAlign: "center" }}>Find something you like and press “{BUY_WORDS[mode].add}”.</Text>
          <Button title="Start shopping" onPress={() => router.navigate("/")} style={{ marginTop: 6, alignSelf: "stretch" }} />
        </Card>
      ) : !quote ? (
        <Text style={{ fontFamily: font.regular, color: colors.muted }}>Checking prices…</Text>
      ) : (
        <>
          {quote.shops.map((s) => (
            <Card key={s.shop.id} style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>{s.shop.name}</Text>
                <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>Delivery {s.deliveryFee ? formatLD(s.deliveryFee) : "free"}</Text>
              </View>
              {quote.lines
                .filter((l) => l.product?.shop.id === s.shop.id && !l.problem)
                .map((l) => (
                  <Line key={`${l.productId}:${l.variantId ?? ""}`} line={l} />
                ))}
            </Card>
          ))}
          {quote.lines.some((l) => l.problem) && (
            <Card style={{ gap: 12, borderColor: colors.danger }}>
              <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.danger }}>Needs your attention</Text>
              {quote.lines
                .filter((l) => l.problem)
                .map((l) => (
                  <Line key={`${l.productId}:${l.variantId ?? ""}`} line={l} />
                ))}
            </Card>
          )}
          <Card style={{ gap: 6 }}>
            <Row label="Items" value={formatLD(quote.subtotal)} />
            <Row label={`Delivery${quote.shops.length > 1 ? ` (${quote.shops.length} shops)` : ""}`} value={quote.deliveryFees ? formatLD(quote.deliveryFees) : "Free"} />
            <Row label="Total" value={formatLD(quote.total)} strong />
            <Button
              title={user ? "Checkout" : "Log in to checkout"}
              disabled={!quote.ok}
              onPress={() => router.push(user ? "/checkout" : "/login")}
              style={{ marginTop: 8 }}
            />
            <Text style={{ fontFamily: font.regular, fontSize: 12, color: colors.muted, textAlign: "center" }}>Pay cash when your order arrives.</Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const style = { fontFamily: strong ? font.extrabold : font.regular, fontSize: strong ? 16 : 14, color: strong ? colors.ink : colors.textSoft };
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={style}>{label}</Text>
      <Text style={style}>{value}</Text>
    </View>
  );
}

function Line({ line: l }: { line: Quote["lines"][number] }) {
  const cart = useCart();
  const router = useRouter();
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <Pressable onPress={() => l.product && router.push({ pathname: "/product/[id]", params: { id: l.productId } })}>
        {l.product?.image ? (
          <Image source={{ uri: l.product.image }} style={{ width: 62, height: 62, borderRadius: 12 }} contentFit="cover" />
        ) : (
          <View style={{ width: 62, height: 62, borderRadius: 12, backgroundColor: colors.ground }} />
        )}
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <Text numberOfLines={2} style={{ fontFamily: font.semibold, fontSize: 14, color: colors.ink }}>
          {l.product?.name ?? "An item that's gone"}
        </Text>
        {l.variantLabel ? <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.textSoft }}>{l.variantLabel}</Text> : null}
        {l.problem ? (
          <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.danger }}>{l.problem}</Text>
        ) : (
          <Text style={{ fontFamily: font.display, fontSize: 14.5, color: colors.price }}>{formatLD(l.lineTotal)}</Text>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          {l.product && l.available !== 0 && (
            <Stepper label={l.product.name} value={l.quantity} max={Math.min(99, l.available ?? 99)} onChange={(v) => cart.setQuantity(l.productId, v, l.variantId)} />
          )}
          {l.problem?.startsWith("Only") && (
            <Pressable accessibilityRole="button" onPress={() => cart.setQuantity(l.productId, l.available ?? 1, l.variantId)}>
              <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>Take {l.available}</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${l.product?.name ?? "item"}`} onPress={() => cart.remove(l.productId, l.variantId)}>
            <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.danger }}>Remove</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
