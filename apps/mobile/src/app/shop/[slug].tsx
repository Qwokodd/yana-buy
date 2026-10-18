import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { countryName, formatLiberianPhone, SHOP_KIND_LABEL, type ProductCard, type PublicShop } from "@yanabuy/shared";
import { BackBar, GridPlaceholder, ProductGrid } from "@/components/Products";
import { CategoryTile } from "@/components/Banners";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";
import { MessageShopButton, RatingLine, ReviewsBlock } from "@/components/Trust";
import { CountryNotice } from "@/components/CountryPicker";
import { AboutWork, Portfolio, ServicesMenu, Videos } from "@/components/WorkProfile";

export default function ShopScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [shop, setShop] = useState<PublicShop | null>(null);
  const loadReviews = useCallback((page: number) => api.public.shopReviews(slug, page), [slug]);
  const [products, setProducts] = useState<ProductCard[] | null>(null);
  const [services, setServices] = useState<ProductCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.public
      .shop(slug)
      .then((res) => setShop(res.shop))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this shop"));
    api.public
      .products({ shop: slug })
      .then((res) => setProducts(res.items))
      .catch(() => setProducts([]));
    api.public
      .products({ shop: slug, bookable: true })
      .then((res) => setServices(res.items))
      .catch(() => setServices([]));
  }, [slug]);
  const work = shop?.workProfile ?? null;

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title={shop?.name} onBack={back} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 14 }}>
        {error ? (
          <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink, textAlign: "center", marginTop: 24 }}>{error}</Text>
        ) : (
          <>
            <View style={{ height: 130, borderRadius: 20, overflow: "hidden", backgroundColor: colors.ink }}>
              {shop?.coverUrl ? (
                <Image source={{ uri: shop.coverUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              ) : (
                <View style={{ position: "absolute", right: -40, top: -50, width: 190, height: 190, borderRadius: 95, backgroundColor: shop?.kind === "restaurant" ? colors.orange : colors.amber }} />
              )}
            </View>
            {shop && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <CategoryTile name={shop.name} iconUrl={shop.logoUrl} size={60} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.display, fontSize: 21, color: colors.ink }}>{shop.name}</Text>
                  {work?.tagline ? <Text style={{ fontFamily: font.semibold, fontSize: 13.5, color: colors.textSoft }}>{work.tagline}</Text> : null}
                  <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>
                    {shop.category?.name ?? SHOP_KIND_LABEL[shop.kind]} · {shop.productCount} {shop.productCount === 1 ? "item" : "items"}
                  </Text>
                  <RatingLine rating={shop.rating} count={shop.ratingCount} size={12.5} />
                </View>
              </View>
            )}
            {shop && work ? <AboutWork shop={shop} profile={work} /> : shop?.description ? <Text style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: colors.textSoft }}>{shop.description}</Text> : null}
            {shop && (
              <View style={{ backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 6 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 14.5, color: colors.ink }}>📍 Where to find us</Text>
                <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.textSoft }}>{[shop.address, shop.city].filter((v, i, a) => v && a.indexOf(v) === i).join(", ")}</Text>
                {shop.hours ? <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.textSoft }}>🕒 {shop.hours}</Text> : null}
                <Pressable
                  accessibilityRole="link"
                  onPress={() =>
                    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.name}, ${shop.address}, ${shop.city}, ${countryName(shop.country)}`)}`).catch(() => {})
                  }
                >
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.purple }}>Get directions ›</Text>
                </Pressable>
              </View>
            )}
            {shop && <CountryNotice country={shop.country} />}
            {shop?.booking && (
              <Button
                title={shop.kind === "restaurant" ? "📅 Book a table" : "📅 Book an appointment"}
                variant="accent"
                onPress={() => router.push({ pathname: "/book", params: { slug: shop.slug } })}
              />
            )}
            {shop && <MessageShopButton shopId={shop.id} />}
            {shop && <Button title={`Call ${formatLiberianPhone(shop.phone)}`} variant="outline" onPress={() => Linking.openURL(`tel:${shop.phone}`).catch(() => {})} />}
            {shop && <Portfolio slug={shop.slug} count={shop.portfolioCount} label={shop.kind === "restaurant" ? "Gallery" : "Our work"} />}
            {work && <Videos videos={work.videos} />}
            {shop && <ServicesMenu slug={shop.slug} services={services} />}
            {(!!shop?.portfolioCount || services.length > 0) && !!products?.length ? (
              <Text style={{ fontFamily: font.display, fontSize: 19, color: colors.ink }}>{shop?.kind === "restaurant" ? "Menu" : "Everything we offer"}</Text>
            ) : null}
            {products === null ? (
              <GridPlaceholder />
            ) : products.length ? (
              <ProductGrid products={products} />
            ) : (
              <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 12 }}>Nothing listed yet.</Text>
            )}
            {shop && <ReviewsBlock load={loadReviews} shopName={shop.name} showProduct title="What buyers say" />}
          </>
        )}
      </ScrollView>
    </View>
  );
}
