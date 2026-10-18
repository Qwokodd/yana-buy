import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { formatLD, type ProductCard } from "@yanabuy/shared";
import { colors, font } from "@/lib/theme";
import { BackIcon } from "./Icons";
import { RatingLine } from "./Trust";
import { HeartButton } from "./Heart";

export function discount(price: number, compareAt: number | null) {
  if (!compareAt || compareAt <= price) return null;
  return Math.round((1 - price / compareAt) * 100);
}

function Card({ p, width }: { p: ProductCard; width: number }) {
  const router = useRouter();
  const off = discount(p.price, p.compareAtPrice);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${p.name}, ${p.hasOptions ? "from " : ""}${formatLD(p.price)}${p.inStock ? "" : ", sold out"}`}
      onPress={() => router.push({ pathname: "/product/[id]", params: { id: p.id } })}
      style={({ pressed }) => ({ width, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: "hidden", opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ width: "100%", aspectRatio: 1, backgroundColor: colors.ground }}>
        {p.image && <Image source={{ uri: p.image }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />}
        {off && (
          <View style={{ position: "absolute", left: 8, top: 8, backgroundColor: colors.price, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontFamily: font.extrabold, fontSize: 11, color: "#fff" }}>-{off}%</Text>
          </View>
        )}
        {p.shipsFromChina && (
          <View style={{ position: "absolute", right: 8, top: 8, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 10.5, color: colors.ink }}>🇨🇳 {p.deliveryDays ? `~${p.deliveryDays}d` : "China"}</Text>
          </View>
        )}
        <View style={{ position: "absolute", right: 8, bottom: p.inStock ? 8 : 30 }}>
          <HeartButton productId={p.id} name={p.name} size={32} />
        </View>
        {!p.inStock && (
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(46,20,64,0.75)", paddingVertical: 4 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 11.5, color: "#fff", textAlign: "center" }}>Sold out</Text>
          </View>
        )}
      </View>
      <View style={{ padding: 10, gap: 2 }}>
        <Text numberOfLines={2} style={{ fontFamily: font.semibold, fontSize: 13.5, lineHeight: 17, color: colors.ink, minHeight: 34 }}>
          {p.name}
        </Text>
        <RatingLine rating={p.rating} count={p.ratingCount} size={11} />
        <Text style={{ fontFamily: font.display, fontSize: 15.5, color: colors.price }}>
          {p.hasOptions ? <Text style={{ fontFamily: font.semibold, fontSize: 11.5, color: colors.muted }}>from </Text> : null}
          {formatLD(p.price)}
        </Text>
        <Text numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 11.5, color: colors.muted }}>
          {p.shop.name}
        </Text>
      </View>
    </Pressable>
  );
}

/** Two-column product grid (it sits inside a ScrollView, so no FlatList). */
export function ProductGrid({ products, padding = 18 }: { products: ProductCard[]; padding?: number }) {
  const { width } = useWindowDimensions();
  const gap = 12;
  const cardWidth = Math.floor((Math.min(width, 700) - padding * 2 - gap) / 2);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
      {products.map((p) => (
        <Card key={p.id} p={p} width={cardWidth} />
      ))}
    </View>
  );
}

export function GridPlaceholder() {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }} accessibilityElementsHidden>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width: "47%", aspectRatio: 0.72, borderRadius: 18, backgroundColor: colors.lineStrong, opacity: 0.45 }} />
      ))}
    </View>
  );
}

/** A screen's top bar with a back button. */
export function BackBar({ title, onBack, right }: { title?: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingBottom: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={10} style={{ padding: 8 }}>
        <BackIcon />
      </Pressable>
      {title ? (
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: font.display, fontSize: 19, color: colors.ink }}>
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {right}
    </View>
  );
}
