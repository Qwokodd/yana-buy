import { Linking, Pressable, Text, View } from "react-native";
import { placeUrl, type GeoPoint } from "@yanabuy/shared";
import { colors, font } from "@/lib/theme";

// The phone maps don't run in a web browser: show links to Google Maps instead.
export type PinColor = "purple" | "orange" | "green" | "blue" | "gray" | "amber" | "red";
export interface MapPin {
  id: string;
  position: GeoPoint;
  color?: PinColor;
  title: string;
  info?: string;
}

export function AppMap({ pins, height = 240 }: { pins: MapPin[]; center?: GeoPoint | null; height?: number; onPick?: (p: GeoPoint) => void; circle?: { center: GeoPoint; radiusKm: number } | null; showMe?: boolean }) {
  return (
    <View style={{ minHeight: Math.min(height, 120), borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6 }}>
      {pins.map((p) => (
        <Pressable key={p.id} onPress={() => Linking.openURL(placeUrl(p.position))}>
          <Text style={{ fontFamily: font.bold, color: colors.purple }}>📍 {p.title}</Text>
        </Pressable>
      ))}
    </View>
  );
}
