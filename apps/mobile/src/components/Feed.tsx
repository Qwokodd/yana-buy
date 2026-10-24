import { Fragment } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { Banner, ProductCard } from "@yanabuy/shared";
import { FeedAd } from "@/components/Banners";
import { ProductGrid } from "@/components/Products";
import { colors, font } from "@/lib/theme";

interface Props {
  products: ProductCard[];
  /** Shown one at a time between rows of products, taking turns. */
  ads?: Banner[];
  /** Products between two ads. */
  every?: number;
  done: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/**
 * Products with ads in between. The screen's ScrollView loads the next page as you near the
 * bottom (see nearBottom in lib/feed) — there is no "Show more" button.
 */
export function ProductFeed({ products, ads = [], every = 10, done, loading, error, onRetry }: Props) {
  const chunks: ProductCard[][] = [];
  for (let i = 0; i < products.length; i += every) chunks.push(products.slice(i, i + every));
  return (
    <View style={{ gap: 16 }}>
      {chunks.map((chunk, i) => {
        const ad = ads.length && chunk.length === every && (i < chunks.length - 1 || !done) ? ads[i % ads.length] : null;
        return (
          <Fragment key={i}>
            <ProductGrid products={chunk} />
            {ad && <FeedAd banner={ad} />}
          </Fragment>
        );
      })}
      {loading && <ActivityIndicator color={colors.purple} style={{ paddingVertical: 12 }} />}
      {!!error && (
        <Pressable accessibilityRole="button" onPress={onRetry} style={{ alignItems: "center", paddingVertical: 10 }}>
          <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>Couldn&apos;t load more.</Text>
          <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.purple }}>Try again</Text>
        </Pressable>
      )}
      {done && products.length > every && (
        <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted, textAlign: "center", paddingVertical: 8 }}>You&apos;ve seen everything here.</Text>
      )}
    </View>
  );
}
