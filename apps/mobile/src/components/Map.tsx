import { useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type LatLng } from "react-native-maps";
import { DEFAULT_CENTER, type GeoPoint } from "@yanabuy/shared";
import { colors } from "@/lib/theme";

export type PinColor = "purple" | "orange" | "green" | "blue" | "gray" | "amber" | "red";
// Android pins only come in a few named colours.
const PIN: Record<PinColor, string> = { purple: "violet", orange: "orange", green: "green", blue: "blue", gray: "wheat", amber: "gold", red: "red" };

export interface MapPin {
  id: string;
  position: GeoPoint;
  color?: PinColor;
  title: string;
  info?: string;
}

const ll = (p: GeoPoint): LatLng => ({ latitude: p.lat, longitude: p.lng });

/** Google map with pins (Google Maps on Android; Apple or Google on iPhone). */
export function AppMap({
  pins,
  center,
  height = 240,
  onPick,
  circle,
  showMe = false,
}: {
  pins: MapPin[];
  center?: GeoPoint | null;
  height?: number;
  /** Tap the map to choose a spot. */
  onPick?: (p: GeoPoint) => void;
  circle?: { center: GeoPoint; radiusKm: number } | null;
  /** Show the phone's own blue dot. */
  showMe?: boolean;
}) {
  const ref = useRef<MapView>(null);
  const ids = pins.map((p) => p.id).sort().join("|");
  const start = pins[0]?.position ?? center ?? DEFAULT_CENTER;

  useEffect(() => {
    const t = setTimeout(() => {
      if (!ref.current) return;
      if (pins.length > 1) ref.current.fitToCoordinates(pins.map((p) => ll(p.position)), { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true });
      else if (pins.length === 1) ref.current.animateToRegion({ ...ll(pins[0].position), latitudeDelta: 0.012, longitudeDelta: 0.012 }, 400);
      else if (center) ref.current.animateToRegion({ ...ll(center), latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, center?.lat, center?.lng]);

  return (
    <View style={{ height, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.lineStrong }}>
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={{ ...ll(start), latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        showsUserLocation={showMe}
        showsMyLocationButton={showMe}
        toolbarEnabled
        onPress={onPick ? (e) => onPick({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude }) : undefined}
      >
        {pins.map((p) => (
          <Marker key={p.id} identifier={p.id} coordinate={ll(p.position)} pinColor={PIN[p.color ?? "purple"]} title={p.title} description={p.info} />
        ))}
        {circle && <Circle center={ll(circle.center)} radius={circle.radiusKm * 1000} strokeColor="rgba(73,31,103,0.5)" fillColor="rgba(73,31,103,0.06)" strokeWidth={1.5} />}
      </MapView>
    </View>
  );
}
