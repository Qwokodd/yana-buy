import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { GeoPoint } from "@yanabuy/shared";
import { AppMap } from "@/components/Map";
import { addressFor, currentPosition } from "@/lib/location";
import { colors, font } from "@/lib/theme";

/**
 * "Who is this for?" at checkout. For themselves the pin is the phone's current location (tap the map
 * to correct it). For someone else or another place, they tap the map where it should go.
 */
export function DeliveryPin({
  forOther,
  onForOther,
  pin,
  onPin,
  onAddress,
  start,
}: {
  forOther: boolean;
  onForOther: (v: boolean) => void;
  pin: GeoPoint | null;
  onPin: (p: GeoPoint | null) => void;
  onAddress: (address: string) => void;
  start: GeoPoint | null;
}) {
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);

  async function locate() {
    setLocating(true);
    setProblem(null);
    try {
      const p = await currentPosition();
      onPin(p);
      setFound(await addressFor(p));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't find your location");
    } finally {
      setLocating(false);
    }
  }

  useEffect(() => {
    if (!forOther && !pin) void locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forOther]);

  const link = (label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: 10 }}>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", padding: 4, borderRadius: 999, backgroundColor: colors.ground }}>
        {[
          { v: false, label: "Me — I'm here" },
          { v: true, label: "Someone else" },
        ].map((o) => (
          <Pressable
            key={String(o.v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: forOther === o.v }}
            onPress={() => {
              if (forOther === o.v) return;
              onPin(null);
              setFound(null);
              setProblem(null);
              onForOther(o.v);
            }}
            style={{ flex: 1, height: 38, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: forOther === o.v ? "#fff" : "transparent" }}
          >
            <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: forOther === o.v ? colors.purple : colors.textSoft }}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
      <AppMap
        height={200}
        center={pin ?? start}
        showMe={!forOther}
        pins={pin ? [{ id: "drop", position: pin, color: "orange", title: forOther ? "Deliver here" : "You are here" }] : []}
        onPick={(p) => {
          onPin(p);
          setFound(null);
        }}
      />
      <Text style={{ fontFamily: problem ? font.semibold : font.regular, fontSize: 12.5, color: problem ? colors.danger : colors.muted }}>
        {forOther
          ? pin
            ? "Pin set. Tap the map again to move it."
            : "Tap the map where it should go, so the rider can find it (optional)."
          : locating
            ? "Finding your location…"
            : problem ?? (pin ? "The shop and rider see this pin. Wrong spot? Tap the map to move it." : "")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {!forOther && link(pin ? "Use my location again" : "Use my current location", locate)}
        {pin && link("Remove pin", () => onPin(null))}
      </View>
      {found && !forOther && (
        <Pressable accessibilityRole="button" onPress={() => onAddress(found)} style={{ borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 14, padding: 10 }}>
          <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.textSoft }}>
            📍 {found} — <Text style={{ fontFamily: font.bold, color: colors.purple }}>use as the address</Text>
          </Text>
        </Pressable>
      )}
    </View>
  );
}
