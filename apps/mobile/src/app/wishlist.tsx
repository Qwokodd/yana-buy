import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { formatLD, type WishlistEntry } from "@yanabuy/shared";
import { BackBar, GridPlaceholder, ProductGrid } from "@/components/Products";
import { api } from "@/lib/api";
import { useWishlist } from "@/lib/wishlist";
import { colors, font } from "@/lib/theme";

export default function Wishlist() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const wish = useWishlist();
  const [items, setItems] = useState<WishlistEntry[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.me
        .wishlist()
        .then((r) => setItems(r.items))
        .catch(() => setItems([]));
    }, [])
  );
  const shown = items?.filter((i) => wish.has(i.product.id)) ?? null;
  const drops = shown?.filter((i) => i.product.price < i.priceAtSave) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title="Wishlist" onBack={() => (router.canGoBack() ? router.back() : router.replace("/profile"))} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 12 }}>
        {drops.length > 0 && (
          <View style={{ backgroundColor: colors.successTint, borderRadius: 14, padding: 12, gap: 2 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.success }}>🏷️ Cheaper since you saved them</Text>
            {drops.map((d) => (
              <Text key={d.product.id} style={{ fontFamily: font.regular, fontSize: 13, color: colors.success }}>
                {`${d.product.name}: now ${formatLD(d.product.price)} (was ${formatLD(d.priceAtSave)})`}
              </Text>
            ))}
          </View>
        )}
        {shown === null ? (
          <GridPlaceholder />
        ) : shown.length ? (
          <ProductGrid products={shown.map((i) => i.product)} />
        ) : (
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 24 }}>Nothing saved yet. Tap the ♡ on anything you like.</Text>
        )}
      </ScrollView>
    </View>
  );
}
