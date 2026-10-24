import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { deliveryDetailLabel, formatLD, formatLiberianPhone, FULFILMENT_LABEL, orderStatusLabel, payLabel, type Order } from "@yanabuy/shared";
import { EVENT_LABEL, FulfilmentPill, Progress, StatusPill } from "@/components/OrderBits";
import { BackBar } from "@/components/Products";
import { Avatar, Button, Card, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";
import { DisputeBox, MessageShopButton } from "@/components/Trust";
import { RateItems, ReportProblem } from "@/components/OrderTrust";
import { OrderMap } from "@/components/OrderMap";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function OrderScreen() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.orders
      .get(id)
      .then((res) => setOrder(res.order))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load the order"));
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
        setOrder((await api.orders.cancel(id, "Cancelled by the buyer")).order);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't cancel");
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === "web") {
      if (globalThis.confirm?.("Cancel this order?")) go();
    } else Alert.alert("Cancel this order?", undefined, [{ text: "Keep it", style: "cancel" }, { text: "Cancel order", style: "destructive", onPress: go }]);
  }

  const call = (phone: string) => Linking.openURL(`tel:${phone}`).catch(() => {});

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title={order ? `Order ${order.number}` : "Order"} onBack={() => (router.canGoBack() ? router.back() : router.replace("/orders"))} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 12 }}>
        {error && <Notice>{error}</Notice>}
        {!order ? (
          !error && <Text style={{ fontFamily: font.regular, color: colors.muted }}>Loading…</Text>
        ) : (
          <>
            {placed && order.status === "placed" && <Notice tone="success">{`Thank you! Your order is placed. ${order.shop.name} will confirm it soon.`}</Notice>}
            <View style={{ flexDirection: "row", gap: 6 }}>
              <StatusPill status={order.status} fulfilment={order.fulfilment} />
              <FulfilmentPill fulfilment={order.fulfilment} />
            </View>
            {order.status === "cancelled" ? (
              <Notice>{`Cancelled${order.cancelReason ? `: ${order.cancelReason}` : "."}`}</Notice>
            ) : (
              <Card>
                <Progress status={order.status} fulfilment={order.fulfilment} />
              </Card>
            )}

            {order.rider && order.status !== "delivered" && order.status !== "cancelled" && (
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Avatar name={order.rider.fullName} url={order.rider.avatarUrl} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 11, letterSpacing: 0.6, color: colors.muted }}>YOUR RIDER</Text>
                  <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>{order.rider.fullName}</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => order.rider?.phone && call(order.rider.phone)} style={{ borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>Call</Text>
                </Pressable>
              </Card>
            )}

            {order.fulfilment === "delivery" && order.status !== "cancelled" && order.status !== "delivered" && <OrderMap order={order} title={order.rider && order.status === "picked_up" ? "Where your order is" : "Delivery map"} />}

            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>{order.shop.name}</Text>
                <Pressable accessibilityRole="button" onPress={() => call(order.shop.phone)}>
                  <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>Call the shop</Text>
                </Pressable>
              </View>
              {order.items.map((i) => (
                <View key={i.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {i.image ? <Image source={{ uri: i.image }} style={{ width: 48, height: 48, borderRadius: 10 }} contentFit="cover" /> : <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.ground }} />}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={{ fontFamily: font.semibold, fontSize: 14, color: colors.ink }}>
                      {i.name}
                    </Text>
                    {i.variantLabel ? <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.textSoft }}>{i.variantLabel}</Text> : null}
                    <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>
                      {i.quantity} × {formatLD(i.price)}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>{formatLD(i.price * i.quantity)}</Text>
                </View>
              ))}
              <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, gap: 3 }}>
                <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>
                  Items {formatLD(order.subtotal)} ·{" "}
                  {order.fulfilment !== "delivery"
                    ? `${FULFILMENT_LABEL[order.fulfilment]} · no delivery fee`
                    : `Delivery${order.deliveryFeeBreakdown ? ` (${deliveryDetailLabel({ ...order.deliveryFeeBreakdown, weightCharged: order.deliveryFeeBreakdown.weightFeeCents > 0 })})` : ""} ${order.deliveryFee ? formatLD(order.deliveryFee) : "free"}`}
                  {order.discount > 0 ? ` · Discount −${formatLD(order.discount)}` : ""}
                </Text>
                <Text style={{ fontFamily: font.extrabold, fontSize: 16, color: colors.ink }}>Total {formatLD(order.total)}</Text>
                <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>
                  {payLabel(order.paymentMethod, order.fulfilment)} · {order.paymentStatus === "refunded" ? "Refunded" : order.paymentStatus === "paid" ? "Paid" : order.status === "cancelled" ? "Nothing to pay" : order.fulfilment === "delivery" ? "Pay when it arrives" : "Pay at the restaurant"}
                </Text>
              </View>
              <MessageShopButton shopId={order.shop.id} orderId={order.id} title="Message the shop" />
            </Card>

            {order.dispute && <DisputeBox dispute={order.dispute} audience="buyer" />}
            {order.status === "delivered" && <RateItems order={order} />}
            {order.status === "delivered" && !order.dispute && <ReportProblem order={order} onReported={setOrder} />}

            {order.fulfilment !== "delivery" ? (
              <Card style={{ gap: 4 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 11, letterSpacing: 0.6, color: colors.muted }}>{order.fulfilment === "eat_in" ? "EATING IN AT" : "COLLECT FROM"}</Text>
                <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>{order.shop.name}</Text>
                <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>
                  {order.shop.address}, {order.shop.city}
                </Text>
                <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>
                  {order.arriveAt
                    ? `${order.fulfilment === "eat_in" ? "Arriving" : "Collecting"} ${new Date(order.arriveAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`
                    : "As soon as it's ready"}
                  {order.partySize ? ` · ${order.partySize} ${order.partySize === 1 ? "person" : "people"}` : ""}
                </Text>
                {order.booking ? <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>{`Table booking ${order.booking.number} (${order.booking.status})`}</Text> : null}
                {order.shop.location ? (
                  <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${order.shop.location!.lat},${order.shop.location!.lng}`)}>
                    <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>Get directions</Text>
                  </Pressable>
                ) : null}
              </Card>
            ) : (
            <Card style={{ gap: 4 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 11, letterSpacing: 0.6, color: colors.muted }}>DELIVERING TO</Text>
              <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>{order.delivery.name}</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>
                {order.delivery.address}, {order.delivery.area ? `${order.delivery.area}, ` : ""}
                {order.delivery.city}
              </Text>
              <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>{formatLiberianPhone(order.delivery.phone)}</Text>
            </Card>
            )}

            <Card style={{ gap: 8 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 11, letterSpacing: 0.6, color: colors.muted }}>WHAT HAPPENED</Text>
              {order.events.map((e, i) => (
                <View key={i}>
                  <Text style={{ fontFamily: font.semibold, fontSize: 13.5, color: colors.ink }}>{order.fulfilment !== "delivery" && (e.status === "ready" || e.status === "delivered") ? orderStatusLabel(e.status, order.fulfilment) : (EVENT_LABEL[e.status] ?? e.status)}</Text>
                  <Text style={{ fontFamily: font.regular, fontSize: 12, color: colors.muted }}>{when(e.createdAt)}</Text>
                </View>
              ))}
            </Card>

            {order.status === "placed" && <Button title="Cancel this order" variant="ghost" onPress={cancel} busy={busy} />}
          </>
        )}
      </ScrollView>
    </View>
  );
}
