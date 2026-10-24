import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { ApiError, directionsUrl, distanceKm, formatDistance, formatLD, formatLiberianPhone, type GeoPoint, type MyRiderEarnings, type OpenJob, type Order, type OrderSummary } from "@yanabuy/shared";
import { StatusPill } from "@/components/OrderBits";
import { BackBar } from "@/components/Products";
import { Button, Card, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { setBrowsing } from "@/lib/workspace";
import { currentPosition, useRiderTracking } from "@/lib/location";
import { AppMap, type MapPin } from "@/components/Map";

/**
 * A rider's work: go Online so shops near them can send delivery requests, accept or decline
 * them, then follow the map — pick up from the shop, drop off with the buyer.
 */
export default function RiderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<OrderSummary[] | null>(null);
  const [jobs, setJobs] = useState<OpenJob[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [cash, setCash] = useState<{ amount: number; orders: number } | null>(null);
  const [pay, setPay] = useState<MyRiderEarnings | null>(null);
  const { user, setUser } = useAuth();
  const online = !!user?.riderOnline;
  const [me, setMe] = useState<GeoPoint | null>(user?.location ?? null);
  const [switching, setSwitching] = useState(false);
  // While online, the phone sends the rider's spot about every 30 s.
  useRiderTracking(online, setMe);

  async function setOnline(next: boolean) {
    setSwitching(true);
    setError(null);
    try {
      let at: GeoPoint | null = null;
      if (next) {
        at = await currentPosition();
        setMe(at);
      }
      const res = await api.rider.setOnline(next, at);
      setUser(res.user);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change that");
    } finally {
      setSwitching(false);
    }
  }

  const load = useCallback(() => {
    api.rider
      .orders()
      .then((res) => {
        setItems(res.items);
        setError(null);
        setOpenId((cur) => cur ?? res.items.find((o) => o.rider && o.status !== "delivered" && o.status !== "cancelled")?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your deliveries"));
    api.rider
      .cash()
      .then(setCash)
      .catch(() => {});
    api.rider
      .earnings()
      .then((r) => setPay(r.earnings))
      .catch(() => {});
    api.rider
      .openJobs()
      .then((r) => setJobs(r.items))
      .catch(() => setJobs([]));
  }, []);

  useFocusEffect(load);
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const open = (items ?? []).filter((o) => o.status !== "delivered" && o.status !== "cancelled");
  // Requests from shops waiting for a yes or no; and deliveries they've taken.
  const requests = open.filter((o) => !o.rider && o.offer);
  const active = open.filter((o) => !!o.rider);
  const done = (items ?? []).filter((o) => o.status === "delivered" || o.status === "cancelled");

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title="My deliveries" onBack={() => (router.canGoBack() ? router.back() : router.replace("/profile"))} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 12 }}>
        {error && <Notice>{error}</Notice>}
        {flash && <Notice tone="success">{flash}</Notice>}
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: online ? colors.successTint : "#fff" }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: online ? colors.success : colors.muted }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>{online ? "You're online" : "You're offline"}</Text>
            <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.textSoft }}>
              {online ? "Shops near you can send you delivery requests. Keep the app open." : "Go online to get delivery requests from shops near you."}
            </Text>
          </View>
          <Switch value={online} disabled={switching} onValueChange={setOnline} accessibilityLabel="Online" trackColor={{ true: colors.success, false: colors.lineStrong }} />
        </Card>
        {requests.map((o) => (
          <Request
            key={o.id}
            id={o.id}
            me={me}
            onDone={(msg, takenId) => {
              setFlash(msg);
              if (takenId) setOpenId(takenId);
              load();
            }}
          />
        ))}
        {online && jobs.filter((j) => !requests.some((r) => r.id === j.id)).length > 0 && (
          <Text style={{ fontFamily: font.bold, fontSize: 12, letterSpacing: 0.4, color: colors.muted }}>PACKED AND WAITING NEAR YOU — FIRST TO ACCEPT GETS IT</Text>
        )}
        {online &&
          jobs
            .filter((j) => !requests.some((r) => r.id === j.id))
            .map((j) => (
              <Request
                key={j.id}
                id={j.id}
                me={me}
                openKm={j.distanceKm}
                onDone={(msg, takenId) => {
                  setFlash(msg);
                  if (takenId) setOpenId(takenId);
                  load();
                }}
              />
            ))}
        {pay && (
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 12, color: colors.muted }}>TODAY</Text>
                <Text style={{ fontFamily: font.extrabold, fontSize: 22, color: colors.ink }}>{formatLD(pay.today.earned)}</Text>
                <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.textSoft }}>
                  {pay.today.trips} {pay.today.trips === 1 ? "trip" : "trips"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 12, color: colors.muted }}>YANABUY OWES YOU</Text>
                <Text style={{ fontFamily: font.extrabold, fontSize: 22, color: colors.success }}>{formatLD(pay.owed)}</Text>
                <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.textSoft }}>Sent to your mobile money</Text>
              </View>
            </View>
            <Text style={{ fontFamily: font.regular, fontSize: 12, color: colors.muted }}>You earn the full delivery fee of every order you deliver.</Text>
          </Card>
        )}
        {cash && cash.amount > 0 && (
          <Card style={{ backgroundColor: colors.ink, gap: 2 }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: "rgba(255,255,255,0.7)" }}>CASH TO HAND IN</Text>
            <Text style={{ fontFamily: font.extrabold, fontSize: 22, color: colors.amber }}>{formatLD(cash.amount)}</Text>
            <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: "rgba(255,255,255,0.8)" }}>
              From {cash.orders} cash {cash.orders === 1 ? "order" : "orders"}. Give it to the YanaBuy office — they'll mark it received.
            </Text>
          </Card>
        )}
        {items && !active.length && !requests.length && !(online && jobs.length) && (
          <Card>
            <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted }}>{online ? "No deliveries right now. Requests from shops near you show up here." : "No deliveries right now. Go online to get requests."}</Text>
          </Card>
        )}
        {active.map((o) =>
          openId === o.id ? (
            <Delivery
              key={o.id}
              id={o.id}
              me={me}
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
        <Button
          title="Browse the app like a buyer"
          variant="outline"
          onPress={() => {
            setBrowsing(true);
            router.replace("/");
          }}
          style={{ marginTop: 8 }}
        />
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

/** Where everything is, plus a button that opens Google Maps directions to the next stop. */
function DeliveryMap({ order, me }: { order: Order; me: GeoPoint | null }) {
  const drop = order.delivery.lat != null && order.delivery.lng != null ? { lat: order.delivery.lat, lng: order.delivery.lng } : null;
  const pins: MapPin[] = [];
  if (order.shop.location) pins.push({ id: "shop", position: order.shop.location, color: "purple", title: `Pick up: ${order.shop.name}`, info: order.shop.address });
  if (drop) pins.push({ id: "drop", position: drop, color: "orange", title: `Drop off: ${order.delivery.name}`, info: order.delivery.address });
  const toShop = order.status === "accepted" || order.status === "ready";
  const next = toShop ? order.shop.location : drop;
  return (
    <View style={{ gap: 8 }}>
      {pins.length > 0 && <AppMap pins={pins} center={me} showMe height={220} />}
      {me && next && (
        <Text style={{ fontFamily: font.semibold, fontSize: 13, color: colors.textSoft }}>
          {toShop ? "Shop" : "Drop-off"} is {formatDistance(distanceKm(me, next))} from you
        </Text>
      )}
      {next ? (
        <Button title={toShop ? "Directions to the shop" : "Directions to the buyer"} variant="outline" onPress={() => Linking.openURL(directionsUrl(next, me)).catch(() => {})} />
      ) : (
        <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>{toShop ? "The shop hasn't set its pin — use the address and call them." : "No drop-off pin — use the address and call the buyer."}</Text>
      )}
    </View>
  );
}

/** A shop asked this rider to deliver: see the trip, then accept or decline. */
function Request({ id, me, onDone, openKm }: { id: string; me: GeoPoint | null; onDone: (message: string, takenId?: string) => void; openKm?: number }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.rider
      .order(id)
      .then((res) => setOrder(res.order))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load"));
  }, [id]);

  async function answer(yes: boolean) {
    if (!order) return;
    setBusy(yes ? "accept" : "decline");
    setError(null);
    try {
      if (yes) {
        await api.rider.accept(order.id);
        onDone(`You're delivering ${order.number}. Head to ${order.shop.name}.`, order.id);
      } else {
        await api.rider.decline(order.id);
        onDone(openKm != null ? `${order.number} hidden.` : `You said no to ${order.number}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't do that");
      setBusy(null);
    }
  }

  if (!order) return <Card>{<Text style={{ color: colors.muted }}>{error ?? "Loading request…"}</Text>}</Card>;
  const drop = order.delivery.lat != null && order.delivery.lng != null ? { lat: order.delivery.lat, lng: order.delivery.lng } : null;
  const trip = order.shop.location && drop ? distanceKm(order.shop.location, drop) : null;
  return (
    <Card style={{ gap: 10, borderColor: colors.amber, borderWidth: 2 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 11, letterSpacing: 0.6, color: colors.warn }}>
        {openKm != null ? `PICKUP NEAR YOU · SHOP ${formatDistance(openKm).toUpperCase()} AWAY` : "NEW DELIVERY REQUEST"}
      </Text>
      <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink }}>
        {order.number} · {order.shop.name}
      </Text>
      {error && <Notice>{error}</Notice>}
      <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>
        {order.shop.address}, {order.shop.city} → {order.delivery.area ? `${order.delivery.area}, ` : ""}
        {order.delivery.city}
        {trip != null ? ` · about ${formatDistance(trip)}` : ""}
        {order.paymentMethod === "cod" ? ` · collect ${formatLD(order.total)} cash` : ""}
      </Text>
      <DeliveryMap order={order} me={me} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button title={openKm != null ? "Not for me" : "Decline"} variant="outline" busy={busy === "decline"} disabled={!!busy} onPress={() => answer(false)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Accept" busy={busy === "accept"} disabled={!!busy} onPress={() => answer(true)} />
        </View>
      </View>
    </Card>
  );
}

function Delivery({ id, me, onChanged }: { id: string; me: GeoPoint | null; onChanged: (o: Order) => void }) {
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
      <DeliveryMap order={order} me={me} />
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
