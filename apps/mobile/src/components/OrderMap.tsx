import { Linking, Pressable, Text, View } from "react-native";
import { directionsUrl, type Order } from "@yanabuy/shared";
import { AppMap, type MapPin } from "@/components/Map";
import { Card } from "@/components/ui";
import { colors, font } from "@/lib/theme";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/** The shop, the drop-off and (while there is one) the rider, on one map. */
export function OrderMap({ order, title = "Delivery map", extra = [] }: { order: Order; title?: string; extra?: MapPin[] }) {
  const drop = order.delivery.lat != null && order.delivery.lng != null ? { lat: order.delivery.lat, lng: order.delivery.lng } : null;
  const pins: MapPin[] = [];
  if (order.shop.location) pins.push({ id: "shop", position: order.shop.location, color: "purple", title: order.shop.name, info: order.shop.address });
  if (drop) pins.push({ id: "drop", position: drop, color: "orange", title: `Deliver to ${order.delivery.name}`, info: order.delivery.address });
  const live = order.riderLocation && order.rider && !["delivered", "cancelled"].includes(order.status);
  if (live) pins.push({ id: "rider", position: order.riderLocation!, color: "green", title: order.rider!.fullName, info: `Rider · ${ago(order.riderLocation!.at)}` });
  pins.push(...extra);
  if (!pins.length) return null;
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>{title}</Text>
        {drop && (
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(directionsUrl(drop, order.shop.location)).catch(() => {})}>
            <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>Open in Maps ›</Text>
          </Pressable>
        )}
      </View>
      <AppMap pins={pins} height={220} />
      <Text style={{ fontFamily: font.regular, fontSize: 12, color: colors.muted }}>
        Purple: shop · Orange: drop-off{live ? " · Green: rider (live)" : ""}
        {!drop ? " · No drop-off pin — the address is used" : ""}
      </Text>
    </Card>
  );
}
