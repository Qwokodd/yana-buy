import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { ApiError, formatLD, formatLiberianPhone, type Order, type OrderSummary } from "@yanabuy/shared";
import { StatusPill } from "@/components/OrderBits";
import { BackBar } from "@/components/Products";
import { Button, Card, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

/** A rider's deliveries: where to pick up, where to drop off, and the two buttons that matter. */
export default function RiderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<OrderSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [cash, setCash] = useState<{ amount: number; orders: number } | null>(null);

  const load = useCallback(() => {
    api.rider
      .orders()
      .then((res) => {
        setItems(res.items);
        setError(null);
        setOpenId((cur) => cur ?? res.items.find((o) => o.status !== "delivered" && o.status !== "cancelled")?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your deliveries"));
    api.rider
      .cash()
      .then(setCash)
      .catch(() => {});
  }, []);

  useFocusEffect(load);
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const active = (items ?? []).filter((o) => o.status !== "delivered" && o.status !== "cancelled");
  const done = (items ?? []).filter((o) => o.status === "delivered" || o.status === "cancelled");

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title="My deliveries" onBack={() => (router.canGoBack() ? router.back() : router.replace("/profile"))} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 12 }}>
        {error && <Notice>{error}</Notice>}
        {flash && <Notice tone="success">{flash}</Notice>}
        {cash && cash.amount > 0 && (
          <Card style={{ backgroundColor: colors.ink, gap: 2 }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: "rgba(255,255,255,0.7)" }}>CASH TO HAND IN</Text>
            <Text style={{ fontFamily: font.extrabold, fontSize: 22, color: colors.amber }}>{formatLD(cash.amount)}</Text>
            <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: "rgba(255,255,255,0.8)" }}>
              From {cash.orders} cash {cash.orders === 1 ? "order" : "orders"}. Give it to the YanaBuy office — they'll mark it received.
            </Text>
          </Card>
        )}
        {items && !active.length && (
          <Card>
            <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted }}>No deliveries right now. New ones appear here when the YanaBuy team gives them to you.</Text>
          </Card>
        )}
        {active.map((o) =>
          openId === o.id ? (
            <Delivery
              key={o.id}
              id={o.id}
              onChanged={(u) => {
                if (u.status === "delivered") {
                  setFlash(`${u.number} delivered — thank you!`);
                  setOpenId(null);
                }
                load();
              }}
            />
          ) : (
            <Pressable key={o.id} accessibilityRole="button" accessibilityLabel={`Delivery ${o.number}`} onPress={() => setOpenId(o.id)}>
              <Card style={{ gap: 4 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>
                  {o.number} · {o.shop.name}
                </Text>
                <StatusPill status={o.status} />
              </Card>
            </Pressable>
          )
        )}
        {done.length > 0 && <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.muted, marginTop: 8 }}>LAST TWO DAYS</Text>}
        {done.map((o) => (
          <Card key={o.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 14, color: colors.ink }}>
              {o.number} · {o.shop.name}
            </Text>
            <StatusPill status={o.status} />
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

function Stop({ label, name, address, phone, note }: { label: string; name: string; address: string; phone: string; note?: string | null }) {
  return (
    <View style={{ backgroundColor: colors.ground, borderRadius: 14, padding: 12, gap: 3 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 11, letterSpacing: 0.6, color: colors.muted }}>{label}</Text>
      <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>{name}</Text>
      <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.textSoft }}>{address}</Text>
      {note && <Text style={{ fontFamily: font.regular, fontSize: 13.5, fontStyle: "italic", color: colors.textSoft }}>“{note}”</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Call ${name}`} onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})} style={{ marginTop: 6, alignSelf: "flex-start", backgroundColor: "#fff", borderRadius: 999, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 14, paddingVertical: 7 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: colors.purple }}>Call {formatLiberianPhone(phone)}</Text>
      </Pressable>
    </View>
  );
}

function Delivery({ id, onChanged }: { id: string; onChanged: (o: Order) => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cash, setCash] = useState(false);

  useEffect(() => {
    api.rider
      .order(id)
      .then((res) => setOrder(res.order))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load"));
  }, [id]);

  async function run(action: () => Promise<{ order: Order }>) {
    setBusy(true);
    setError(null);
    try {
      const { order: updated } = await action();
      setOrder(updated);
      onChanged(updated);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Couldn't do that");
    } finally {
      setBusy(false);
    }
  }

  if (!order) return <Card>{<Text style={{ color: colors.muted }}>{error ?? "Loading…"}</Text>}</Card>;
  const cod = order.paymentMethod === "cod";

  return (
    <Card style={{ gap: 10, borderColor: colors.purple, borderWidth: 2 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink }}>{order.number}</Text>
        <StatusPill status={order.status} />
      </View>
      {error && <Notice>{error}</Notice>}
      <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>
        {order.items.map((i) => `${i.quantity} × ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""}`).join(", ")}
      </Text>
      <Stop label="1 · PICK UP FROM" name={order.shop.name} address={`${order.shop.address}, ${order.shop.city}`} phone={order.shop.phone} />
      <Stop label="2 · DELIVER TO" name={order.delivery.name} address={`${order.delivery.address}, ${order.delivery.area ? `${order.delivery.area}, ` : ""}${order.delivery.city}`} phone={order.delivery.phone} note={order.delivery.note} />
      {cod && (
        <View style={{ backgroundColor: colors.warnTint, borderRadius: 14, padding: 12 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.warn }}>Collect {formatLD(order.total)} in cash</Text>
        </View>
      )}
      {order.status === "accepted" && (
        <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>The shop is still packing it. You can pick it up when they mark it ready.</Text>
      )}
      {order.status === "ready" && <Button title="I've picked it up" busy={busy} onPress={() => run(() => api.rider.pickedUp(order.id))} />}
      {order.status === "picked_up" && (
        <>
          {cod && (
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: cash }} onPress={() => setCash((c) => !c)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.purple, backgroundColor: cash ? colors.purple : "#fff", alignItems: "center", justifyContent: "center" }}>
                {cash && <Text style={{ color: "#fff", fontFamily: font.bold }}>✓</Text>}
              </View>
              <Text style={{ flex: 1, fontFamily: font.semibold, fontSize: 14, color: colors.ink }}>I collected {formatLD(order.total)} in cash</Text>
            </Pressable>
          )}
          <Button title="Delivered" busy={busy} disabled={cod && !cash} onPress={() => run(() => api.rider.delivered(order.id, cash))} />
        </>
      )}
    </Card>
  );
}
