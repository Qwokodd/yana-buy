import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { formatLD, formatLiberianPhone, FULFILMENT_LABEL, type Order, type OrderSummary } from "@yanabuy/shared";
import { FulfilmentPill, StatusPill } from "@/components/OrderBits";

/** "Thu 22 Oct, 18:30" — Liberia time (UTC). */
const visitTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
import { DisputeBox } from "@/components/Trust";
import { BackBar } from "@/components/Products";
import { Button, Card, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { OrderMap } from "@/components/OrderMap";
import { RiderPicker } from "@/components/RiderPicker";
import { colors, font } from "@/lib/theme";

type View_ = "active" | "done";

export default function SellerOrders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [view, setView] = useState<View_>("active");
  const [items, setItems] = useState<OrderSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.shop
      .orders(view)
      .then((res) => {
        setItems(res.items);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load orders"));
  }, [view]);

  useFocusEffect(load);
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const fresh = (items ?? []).filter((o) => o.status === "placed").length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title="Shop orders" onBack={() => (router.canGoBack() ? router.back() : router.replace("/sell"))} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["active", "done"] as const).map((v) => (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityState={{ selected: view === v }}
              onPress={() => {
                setView(v);
                setItems(null);
                setOpenId(null);
              }}
              style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", backgroundColor: view === v ? colors.purple : "#fff", borderWidth: 1, borderColor: view === v ? colors.purple : colors.lineStrong }}
            >
              <Text style={{ fontFamily: font.bold, fontSize: 13, color: view === v ? "#fff" : colors.textSoft }}>
                {v === "active" ? `To do${fresh ? ` · ${fresh} new` : ""}` : "Finished"}
              </Text>
            </Pressable>
          ))}
        </View>
        {error && <Notice>{error}</Notice>}
        {items?.map((o) =>
          openId === o.id ? (
            <SellerOrder key={o.id} id={o.id} onChanged={load} onClose={() => setOpenId(null)} />
          ) : (
            <Pressable key={o.id} accessibilityRole="button" accessibilityLabel={`Order ${o.number}`} onPress={() => setOpenId(o.id)}>
              <Card style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>{o.number}</Text>
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>{formatLD(o.total)}</Text>
                </View>
                <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>
                  {o.itemCount} {o.itemCount === 1 ? "item" : "items"} · {new Date(o.createdAt).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                  {o.fulfilment !== "delivery" && o.arriveAt ? ` · arriving ${visitTime(o.arriveAt)}` : ""}
                </Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <StatusPill status={o.status} fulfilment={o.fulfilment} />
                  <FulfilmentPill fulfilment={o.fulfilment} />
                  {o.disputeStatus === "open" && (
                    <View style={{ backgroundColor: colors.dangerTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ fontFamily: font.bold, fontSize: 12, color: colors.danger }}>Problem reported</Text>
                    </View>
                  )}
                </View>
              </Card>
            </Pressable>
          )
        )}
        {items && items.length === 0 && (
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 16 }}>
            {view === "active" ? "No orders to handle right now." : "No finished orders yet."}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function SellerOrder({ id, onChanged, onClose }: { id: string; onChanged: () => void; onClose: () => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [paidHere, setPaidHere] = useState(false);

  useEffect(() => {
    const get = () =>
      api.shop
        .order(id)
        .then((res) => setOrder(res.order))
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load"));
    get();
    // Keeps the rider's answer and live position fresh.
    const t = setInterval(get, 20000);
    return () => clearInterval(t);
  }, [id]);

  async function run(action: () => Promise<{ order: Order }>) {
    setBusy(true);
    setError(null);
    try {
      setOrder((await action()).order);
      setRejecting(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't do that");
    } finally {
      setBusy(false);
    }
  }

  if (!order) return <Card>{<Text style={{ color: colors.muted }}>{error ?? "Loading…"}</Text>}</Card>;
  const visit = order.fulfilment !== "delivery";

  return (
    <Card style={{ gap: 10, borderColor: colors.purple, borderWidth: 2 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink }}>{order.number}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
          <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.muted }}>✕</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <StatusPill status={order.status} fulfilment={order.fulfilment} />
        <FulfilmentPill fulfilment={order.fulfilment} />
      </View>
      {error && <Notice>{error}</Notice>}
      {order.items.map((i) => (
        <Text key={i.id} style={{ fontFamily: font.semibold, fontSize: 14, color: colors.ink }}>
          {i.quantity} × {i.name}
          {i.variantLabel ? ` (${i.variantLabel})` : ""} <Text style={{ fontFamily: font.regular, color: colors.muted }}>· {formatLD(i.price * i.quantity)}</Text>
        </Text>
      ))}
      <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.textSoft }}>
        {order.paymentMethod === "cod"
          ? visit
            ? `The buyer pays you ${formatLD(order.total)} at the restaurant (no delivery fee).`
            : `The buyer pays the rider ${formatLD(order.total)} in cash.`
          : `Paid online (${formatLD(order.total)}).`}
      </Text>
      {order.sellerEarning != null && (
        <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.success }}>
          {`You earn ${formatLD(order.sellerEarning)} — your full prices.`}
          {visit && order.paymentMethod === "cod" ? " YanaBuy's commission (the rest of what the buyer pays you) comes off your balance." : ""}
        </Text>
      )}
      {order.dispute && (
        <DisputeBox dispute={order.dispute} audience="seller">
          {order.dispute.status === "open" && (
            <DisputeResponse
              order={order}
              onDone={(o) => {
                setOrder(o);
                onChanged();
              }}
            />
          )}
        </DisputeBox>
      )}
      {visit ? (
        <View style={{ backgroundColor: colors.warnTint, borderRadius: 14, padding: 10, gap: 2 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: colors.ink }}>
            {FULFILMENT_LABEL[order.fulfilment]} · {order.delivery.name} · {formatLiberianPhone(order.delivery.phone)}
          </Text>
          <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.textSoft }}>
            {order.arriveAt ? `Arriving ${visitTime(order.arriveAt)}` : "Coming as soon as it's ready"}
            {order.partySize ? ` · ${order.partySize} ${order.partySize === 1 ? "person" : "people"}` : ""}
          </Text>
          {order.booking && <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.textSoft }}>Table booking {order.booking.number} ({order.booking.status})</Text>}
          {order.delivery.note && <Text style={{ fontFamily: font.regular, fontSize: 13, fontStyle: "italic", color: colors.textSoft }}>“{order.delivery.note}”</Text>}
        </View>
      ) : (
      <View style={{ backgroundColor: colors.ground, borderRadius: 14, padding: 10, gap: 2 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: colors.ink }}>{order.delivery.name}</Text>
        <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.textSoft }}>
          {order.delivery.address}, {order.delivery.city} · {formatLiberianPhone(order.delivery.phone)}
        </Text>
        {order.delivery.note && <Text style={{ fontFamily: font.regular, fontSize: 13, fontStyle: "italic", color: colors.textSoft }}>“{order.delivery.note}”</Text>}
      </View>
      )}
      {order.rider && (
        <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.ink }}>
          Rider: <Text style={{ fontFamily: font.bold }}>{order.rider.fullName}</Text> · {formatLiberianPhone(order.rider.phone)}
        </Text>
      )}
      {!visit && !["cancelled", "delivered"].includes(order.status) && <OrderMap order={order} title="Map" />}
      {!visit && (order.status === "accepted" || order.status === "ready") && !order.rider && (
        <RiderPicker
          order={order}
          onChanged={(o) => {
            setOrder(o);
            onChanged();
          }}
        />
      )}
      {rejecting ? (
        <>
          <Field label="Why can't you do this order? (the buyer sees this)" value={reason} onChangeText={setReason} multiline style={{ height: 70, paddingTop: 10, textAlignVertical: "top" }} />
          <Button title="Turn down order" variant="danger" busy={busy} disabled={reason.trim().length < 3} onPress={() => run(() => api.shop.rejectOrder(order.id, reason))} />
          <Button title="Back" variant="outline" onPress={() => setRejecting(false)} />
        </>
      ) : (
        <>
          {order.status === "placed" && <Button title="Accept order" busy={busy} onPress={() => run(() => api.shop.acceptOrder(order.id))} />}
          {order.status === "accepted" && (
            <Button
              title={visit ? (order.fulfilment === "eat_in" ? "Food is ready" : "Ready to collect") : "Packed — ready for the rider"}
              busy={busy}
              onPress={() => run(() => api.shop.orderReady(order.id))}
            />
          )}
          {visit && (order.status === "accepted" || order.status === "ready") && (
            <>
              {order.paymentMethod === "cod" && (
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: paidHere }} onPress={() => setPaidHere((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.purple, backgroundColor: paidHere ? colors.purple : "#fff", alignItems: "center", justifyContent: "center" }}>
                    {paidHere && <Text style={{ color: "#fff", fontFamily: font.bold, fontSize: 13 }}>✓</Text>}
                  </View>
                  <Text style={{ fontFamily: font.semibold, fontSize: 14, color: colors.ink }}>Buyer paid {formatLD(order.total)}</Text>
                </Pressable>
              )}
              <Button
                title={order.fulfilment === "eat_in" ? "Served" : "Collected"}
                busy={busy}
                disabled={order.paymentMethod === "cod" && !paidHere}
                onPress={() => run(() => api.shop.orderHandedOver(order.id, paidHere))}
              />
            </>
          )}
          {(order.status === "placed" || order.status === "accepted" || order.status === "ready") && (
            <Button title={order.status === "placed" ? "Can't do it" : "Cancel order"} variant="ghost" onPress={() => setRejecting(true)} />
          )}
          {!visit && order.status === "ready" && (
            <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>
              {order.rider ? `${order.rider.fullName} is coming to pick it up.` : order.offer ? `Waiting for ${order.offer.rider.fullName} to accept.` : "Pick a rider above."}
            </Text>
          )}
        </>
      )}
    </Card>
  );
}

function DisputeResponse({ order, onDone }: { order: Order; onDone: (o: Order) => void }) {
  const [text, setText] = useState(order.dispute?.sellerResponse ?? "");
  const [editing, setEditing] = useState(!order.dispute?.sellerResponse);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!editing) return <Button title="Change your side" variant="ghost" onPress={() => setEditing(true)} />;
  return (
    <View style={{ gap: 8 }}>
      <Field
        label="Your side of the story"
        hint="The buyer and YanaBuy see this."
        value={text}
        onChangeText={setText}
        multiline
        maxLength={1000}
        style={{ height: 90, paddingTop: 12, textAlignVertical: "top" }}
      />
      {error && <Notice>{error}</Notice>}
      <Button
        title="Send your side"
        busy={busy}
        disabled={text.trim().length < 5}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await api.shop.respondToDispute(order.id, text);
            setEditing(false);
            onDone(res.order);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't send");
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}
