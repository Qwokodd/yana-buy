import { useEffect, useState } from "react";
import { Text, View, type ViewStyle } from "react-native";
import { colors, font } from "@/lib/theme";

/** "2d 04:12:09" until `ends`; "Ended" after. Ticks every second. */
export function useCountdown(ends: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ends) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ends]);
  if (!ends) return null;
  const left = Math.max(0, new Date(ends).getTime() - now);
  if (left === 0) return "Ended";
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d ? `${d}d ${clock}` : clock;
}

export function Countdown({ ends, style, small }: { ends: string | null; style?: ViewStyle; small?: boolean }) {
  const text = useCountdown(ends);
  if (!text) return null;
  return (
    <View
      accessible
      accessibilityLabel={text === "Ended" ? "Ended" : `Ends in ${text}`}
      style={[{ alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: small ? 7 : 10, paddingVertical: small ? 2 : 4 }, style]}
    >
      <Text style={{ fontFamily: font.extrabold, fontSize: small ? 10.5 : 12, color: "#fff", fontVariant: ["tabular-nums"] }}>
        ⏱ {text === "Ended" ? "Ended" : `Ends in ${text}`}
      </Text>
    </View>
  );
}
