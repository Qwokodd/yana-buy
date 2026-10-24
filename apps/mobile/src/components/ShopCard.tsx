import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { SHOP_KIND_LABEL, type PublicShop } from "@yanabuy/shared";
import { CategoryTile } from "@/components/Banners";
import { colors, font } from "@/lib/theme";

const where = (s: PublicShop) => [s.address, s.city].filter((v, i, a) => v && a.indexOf(v) === i).join(", ");

/** A shop in the directory: cover, logo, category, address, rating. */
export function ShopCard({ shop, width }: { shop: PublicShop; width?: number }) {
  const router = useRouter();
  const food = shop.kind === "restaurant";
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${shop.name}, ${shop.category?.name ?? SHOP_KIND_LABEL[shop.kind]}, ${where(shop)}`}
      onPress={() => router.push({ pathname: "/shop/[slug]", params: { slug: shop.slug } })}
      style={{ width, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}
    >
      <View style={{ height: 84, backgroundColor: food ? "#FFE3CC" : "#FFF1D6" }}>
        {shop.coverUrl ? <Image source={{ uri: shop.coverUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}
        <View style={{ position: "absolute", right: 10, top: 10, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
          <Text style={{ fontFamily: font.extrabold, fontSize: 12, color: colors.ink }}>
            {shop.rating ? (
              <>
                <Text style={{ color: colors.amber }}>★</Text> {shop.rating.toFixed(1)} <Text style={{ fontFamily: font.semibold, color: colors.muted }}>({shop.ratingCount})</Text>
              </>
            ) : (
              "New"
            )}
          </Text>
        </View>
        <View style={{ position: "absolute", left: 12, bottom: -20, backgroundColor: "#fff", borderRadius: 16, padding: 3 }}>
          <CategoryTile name={shop.name} iconUrl={shop.logoUrl} size={44} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 12, paddingTop: 26, paddingBottom: 12, gap: 3 }}>
        <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>
          {shop.name}
        </Text>
        <Text numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.textSoft }}>
          {shop.category?.name ?? SHOP_KIND_LABEL[shop.kind]}
        </Text>
        <Text numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>
          📍 {where(shop)}
        </Text>
      </View>
    </Pressable>
  );
}
