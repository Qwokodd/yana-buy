import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font } from "@/lib/theme";

export function ComingSoon({ title, text }: { title: string; text: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 18, paddingHorizontal: 18 }}>
      <Text style={{ fontFamily: font.display, fontSize: 26, color: colors.ink }}>{title}</Text>
      <View style={{ marginTop: 18, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 24 }}>
        <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted, lineHeight: 20 }}>{text}</Text>
      </View>
    </View>
  );
}
