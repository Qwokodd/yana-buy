import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CategoryTile } from "@/components/Banners";
import { Card } from "@/components/ui";
import { useCategories } from "@/lib/catalog";
import { useMode } from "@/lib/mode";
import { colors, font } from "@/lib/theme";

export default function Categories() {
  const insets = useSafeAreaInsets();
  const { mode, setMode } = useMode();
  const { categories, error, reload } = useCategories(mode);
  const router = useRouter();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ground }}
      contentContainerStyle={{ paddingTop: insets.top + 18, paddingHorizontal: 18, paddingBottom: 32, gap: 16 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
    >
      <Text style={{ fontFamily: font.display, fontSize: 26, color: colors.ink }}>Categories</Text>
      <View style={{ flexDirection: "row", padding: 4, backgroundColor: "#fff", borderRadius: 999, borderWidth: 1, borderColor: colors.line }}>
        {(["goods", "food"] as const).map((m) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m }}
            onPress={() => setMode(m)}
            style={{ flex: 1, height: 38, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: mode === m ? (m === "goods" ? colors.amber : colors.orange) : "transparent" }}
          >
            <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>{m === "goods" ? "Goods & Services" : "Food"}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="link"
        onPress={() => router.push({ pathname: "/shops", params: { mode } })}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.purple, borderRadius: 18, padding: 16 }}
      >
        <Text style={{ fontSize: 24 }}>{mode === "goods" ? "🏬" : "🍽️"}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.display, fontSize: 16, color: "#fff" }}>{mode === "goods" ? "Browse all shops" : "Browse all restaurants"}</Text>
          <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: "rgba(255,255,255,0.8)" }}>By category — visit their page, see where they are.</Text>
        </View>
        <Text style={{ fontFamily: font.bold, fontSize: 20, color: colors.amber }}>›</Text>
      </Pressable>

      {error && (
        <Card>
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted }}>Can&apos;t load categories. Pull down to try again.</Text>
        </Card>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {(categories ?? []).map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={c.name}
            onPress={() => router.push({ pathname: "/search", params: { category: c.slug } })}
            style={{ width: "30.6%", backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, alignItems: "center", paddingVertical: 14, paddingHorizontal: 6, gap: 8 }}
          >
            <CategoryTile name={c.name} iconUrl={c.iconUrl} size={50} />
            <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.ink, textAlign: "center" }} numberOfLines={2}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </View>
      {categories && categories.length === 0 && (
        <Card>
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted }}>No categories here yet.</Text>
        </Card>
      )}
    </ScrollView>
  );
}
