import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { formatDistance, formatLiberianPhone, type GeoPoint, type NearbyRider, type Order } from "@yanabuy/shared";
import { AppMap, type MapPin } from "@/components/Map";
import { Avatar, Button, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { currentPosition } from "@/lib/location";
import { colors, font } from "@/lib/theme";

const VEHICLE: Record<string, string> = { motorbike: "🏍️ Motorbike", keke: "🛺 Keke", car: "🚗 Car", bicycle: "🚲 Bicycle", on_foot: "🚶 On foot" };
const minsAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

/** The shop picks an online rider near it; the rider accepts or declines in their app. */
export function RiderPicker({ order, onChanged }: { order: Order; onChanged: (o: Order) => void }) {
  const [riders, setRiders] = useState<NearbyRider[] | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [shopAt, setShopAt] = useState<GeoPoint | null>(null);
  const [heavy, setHeavy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.shop
      .orderRiders(order.id)
      .then((res) => {
        setRiders(res.riders);
        setRadiusKm(res.radiusKm);
        setShopAt(res.shopLocation);
        setHeavy(res.heavy);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't find riders"));
  }, [order.id]);

  useEffect(() => {
    if (order.offer) return;
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load, order.offer]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      const res = (await fn()) as { order?: Order } | undefined;
      if (res?.order) onChanged(res.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't do that");
    } finally {
      setBusy(null);
    }
  }

  const box = { borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 12, gap: 10 } as const;

  if (order.offer) {
    return (
      <View style={{ ...box, borderColor: colors.amber, backgroundColor: colors.warnTint }}>
        <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.ink }}>
          Waiting for <Text style={{ fontFamily: font.bold }}>{order.offer.rider.fullName}</Text> to accept · asked {minsAgo(order.offer.at)} min ago
        </Text>
        {error && <Notice>{error}</Notice>}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {order.offer.rider.phone && (
            <View style={{ flex: 1 }}>
              <Button title={`Call ${formatLiberianPhone(order.offer.rider.phone)}`} variant="outline" onPress={() => Linking.openURL(`tel:${order.offer!.rider.phone}`).catch(() => {})} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Button title="Cancel request" variant="ghost" busy={busy === "cancel"} onPress={() => run("cancel", () => api.shop.cancelOffer(order.id))} />
          </View>
        </View>
      </View>
    );
  }

  const pins: MapPin[] = [
    ...(shopAt ? [{ id: "shop", position: shopAt, color: "purple" as const, title: order.shop.name, info: "Your shop" }] : []),
    ...(riders ?? []).map((r) => ({ id: r.id, position: r.location, color: (r.declined || !r.canCarry ? "gray" : "green") as "gray" | "green", title: r.fullName, info: `${formatDistance(r.distanceKm)} away` })),
  ];

  return (
    <View style={box}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>Pick a rider near you</Text>
        <Pressable accessibilityRole="button" onPress={load} hitSlop={8}>
          <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>Refresh</Text>
        </Pressable>
      </View>
      <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.textSoft }}>
        {order.status === "ready"
          ? `Every online rider within ${radiusKm} km has been told it's packed — the first to accept gets it. You can also ask one rider.`
          : `When you mark it packed, every online rider within ${radiusKm} km is told and the first to accept gets it. Or ask one rider now.`}
      </Text>
      {heavy && <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.ink, backgroundColor: colors.warnTint, borderRadius: 10, padding: 8 }}>This order is heavy — only riders with a keke or car can take it.</Text>}
      {error && <Notice>{error}</Notice>}
      {riders !== null && !shopAt ? (
        <>
          <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>Set your shop&apos;s location so we can find riders near you. Do this while you&apos;re at the shop.</Text>
          <Button
            title="📍 My shop is where I am now"
            busy={busy === "shop"}
            onPress={() =>
              run("shop", async () => {
                await api.shop.setLocation(await currentPosition());
                load();
              })
            }
          />
        </>
      ) : (
        <>
          {shopAt && <AppMap pins={pins} height={200} circle={{ center: shopAt, radiusKm }} />}
          {riders === null ? (
            <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted }}>Looking for riders…</Text>
          ) : riders.length === 0 ? (
            <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>No riders are online within {radiusKm} km right now. The list refreshes by itself.</Text>
          ) : (
            riders.map((r) => (
              <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
                <Avatar name={r.fullName} url={r.avatarUrl} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>{r.fullName}</Text>
                  <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.textSoft }}>
                    {formatDistance(r.distanceKm)} away{r.vehicle ? ` · ${VEHICLE[r.vehicle] ?? r.vehicle}` : ""} · {r.activeDeliveries ? `${r.activeDeliveries} on the go` : "free now"}
                  </Text>
                  {r.declined && <Text style={{ fontFamily: font.semibold, fontSize: 12, color: colors.danger }}>Said no to this order</Text>}
                  {!r.canCarry && <Text style={{ fontFamily: font.semibold, fontSize: 12, color: colors.danger }}>Too heavy for their vehicle — needs a keke or car</Text>}
                </View>
                <Button title="Ask" busy={busy === r.id} disabled={!!busy || !r.canCarry} onPress={() => run(r.id, () => api.shop.offerRider(order.id, r.id))} />
              </View>
            ))
          )}
        </>
      )}
    </View>
  );
}
