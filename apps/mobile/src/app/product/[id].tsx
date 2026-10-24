import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { BUY_WORDS, defaultPick, findVariant, formatLD, formatLiberianPhone, pickValue, SHOP_KIND_LABEL, valueState, type Product, type ProductCard } from "@yanabuy/shared";
import { BackBar, discount, ProductGrid } from "@/components/Products";
import { CategoryTile } from "@/components/Banners";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useMode } from "@/lib/mode";
import { useCart } from "@/lib/cart";
import { Stepper } from "@/components/OrderBits";
import { colors, font } from "@/lib/theme";
import { MessageShopButton, RatingLine, ReviewsBlock } from "@/components/Trust";
import { CountryNotice } from "@/components/CountryPicker";
import { HeartButton } from "@/components/Heart";

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { foodHow } = useMode();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [product, setProduct] = useState<Product | null>(null);
  const [more, setMore] = useState<ProductCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [picked, setPicked] = useState<(string | null)[]>([]);
  const cart = useCart();
  const loadReviews = useCallback((page: number) => api.public.productReviews(id, page), [id]);

  useEffect(() => {
    api.public
      .product(id)
      .then((res) => {
        setProduct(res.product);
        setPicked(defaultPick(res.product));
        setMore(res.more);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this product"));
  }, [id, foodHow]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (error || !product) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
        <BackBar onBack={back} />
        <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
          <Text style={{ fontFamily: error ? font.display : font.regular, fontSize: error ? 19 : 14, color: error ? colors.ink : colors.muted, textAlign: "center" }}>
            {error ?? "Loading…"}
          </Text>
          {error && <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted }}>The shop may have sold it or taken it down.</Text>}
        </View>
      </View>
    );
  }

  // With options, price and stock follow the colour/size picked.
  const variant = findVariant(product, picked);
  const hasOptions = product.variants.length > 0;
  const price = variant?.price ?? product.price;
  const compareAt = variant ? variant.compareAtPrice : product.compareAtPrice;
  const stock = variant ? variant.stock : hasOptions ? 0 : product.stock;
  const inStock = hasOptions ? !!variant && (stock === null || stock > 0) : product.inStock;
  const off = discount(price, compareAt);
  const few = stock !== null && stock > 0 && stock <= 5;
  const maxQty = Math.min(99, stock ?? 99);
  const addToCart = () => cart.add(product.id, Math.min(qty, maxQty), variant?.id ?? null);
  // A choice with its own photo is shown first.
  const photos = variant?.image && !product.images.includes(variant.image) ? [variant.image, ...product.images] : product.images;
  const pageWidth = Math.min(width, 700);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={{ width: pageWidth, aspectRatio: 1, backgroundColor: "#fff" }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPhoto(Math.round(e.nativeEvent.contentOffset.x / pageWidth))}
            accessibilityLabel="Photos"
          >
            {photos.map((src, i) => (
              <Image key={src + i} source={{ uri: src }} style={{ width: pageWidth, height: pageWidth }} contentFit="contain" accessibilityLabel={`${product.name} photo ${i + 1}`} />
            ))}
          </ScrollView>
          <View style={{ position: "absolute", top: insets.top + 6, left: 10 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: font.bold, fontSize: 22, lineHeight: 24, color: colors.ink }}>‹</Text>
            </Pressable>
          </View>
          {photos.length > 1 && (
            <View style={{ position: "absolute", bottom: 10, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 }} accessibilityElementsHidden>
              {photos.map((_, i) => (
                <View key={i} style={{ height: 6, width: i === photo ? 18 : 6, borderRadius: 3, backgroundColor: i === photo ? colors.purple : colors.lineStrong }} />
              ))}
            </View>
          )}
          {off && (
            <View style={{ position: "absolute", right: 12, top: insets.top + 12, backgroundColor: colors.price, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontFamily: font.extrabold, fontSize: 13, color: "#fff" }}>-{off}%</Text>
            </View>
          )}
        </View>

        <View style={{ padding: 18, gap: 14 }}>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <Text accessibilityRole="header" style={{ flex: 1, fontFamily: font.display, fontSize: 23, lineHeight: 27, color: colors.ink }}>
                {product.name}
              </Text>
              <HeartButton productId={product.id} name={product.name} size={40} />
            </View>
            <RatingLine rating={product.rating} count={product.ratingCount} size={13} />
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <Text style={{ fontFamily: font.display, fontSize: 26, color: colors.price }}>{formatLD(price)}</Text>
              {off && compareAt && (
                <Text style={{ fontFamily: font.regular, fontSize: 15, color: colors.muted, textDecorationLine: "line-through" }}>{formatLD(compareAt)}</Text>
              )}
            </View>
            <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: !inStock ? colors.danger : few ? colors.warn : colors.success }}>
              {hasOptions && !variant
                ? "Choose an option"
                : !inStock
                  ? hasOptions
                    ? "This choice is sold out"
                    : "Sold out"
                  : few
                    ? `Only ${stock} left`
                    : product.kind === "food"
                      ? "Available to order"
                      : "In stock"}
            </Text>
          </View>

          {(product.shipsFromChina || product.deliveryDays) && (
            <View style={{ backgroundColor: "#FFF1D6", borderRadius: 14, padding: 12 }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 13.5, color: colors.ink }}>
                {product.shipsFromChina ? "🇨🇳 Ships from China" : "Delivery time"}
                {product.deliveryDays ? ` — arrives in about ${product.deliveryDays} days` : " — takes longer to arrive"}
              </Text>
            </View>
          )}
          {hasOptions &&
            product.options.map((o, oi) => (
              <View key={o.name} style={{ gap: 8 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.textSoft }}>
                  {o.name}: <Text style={{ color: colors.ink }}>{picked[oi] ?? "choose"}</Text>
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {o.values.map((value) => {
                    const state = valueState(product, picked, oi, value);
                    const on = picked[oi]?.toLowerCase() === value.toLowerCase();
                    return (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={`${o.name} ${value}${state === "soldout" ? ", sold out" : state === "none" ? ", not available" : ""}`}
                        onPress={() => {
                          setPicked(pickValue(product, picked, oi, value));
                          setAdded(false);
                        }}
                        style={{
                          minHeight: 40,
                          paddingHorizontal: 16,
                          borderRadius: 999,
                          borderWidth: 2,
                          justifyContent: "center",
                          borderColor: on ? colors.purple : colors.lineStrong,
                          backgroundColor: on ? colors.purple : "#fff",
                          opacity: state === "ok" ? 1 : 0.5,
                        }}
                      >
                        <Text style={{ fontFamily: font.bold, fontSize: 14, color: on ? "#fff" : colors.ink, textDecorationLine: state === "soldout" ? "line-through" : "none" }}>{value}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          <CountryNotice country={product.shop.country} what="product" />
          <Card style={{ gap: 10 }}>
            {product.bookable ? (
              <>
                <Button title="📅 Book a time" onPress={() => router.push({ pathname: "/book", params: { slug: product.shop.slug, product: product.id } })} />
                <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted, textAlign: "center" }}>{`About ${product.durationMinutes ?? 60} minutes · pay at your appointment.`}</Text>
              </>
            ) : inStock ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.textSoft }}>Quantity</Text>
                  <Stepper label="quantity" value={Math.min(qty, maxQty)} max={maxQty} onChange={(v) => setQty(Math.max(1, v))} />
                </View>
                <Button
                  title={added ? "Added ✓ — add more" : BUY_WORDS[product.kind].add}
                  onPress={() => {
                    addToCart();
                    setAdded(true);
                  }}
                />
                <Button
                  title={BUY_WORDS[product.kind].now}
                  variant="accent"
                  onPress={() => {
                    addToCart();
                    router.navigate("/cart");
                  }}
                />
                {added && <Button title={BUY_WORDS[product.kind].go} variant="outline" onPress={() => router.navigate("/cart")} />}
                <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted, textAlign: "center" }}>{product.kind === "food" && foodHow === "eat_in"
                    ? "Eat in: the restaurant's own price, paid at the restaurant."
                    : product.kind === "food" && foodHow === "pickup"
                      ? "Pickup: collect it at the restaurant."
                      : "A YanaBuy rider delivers it. You pay with mobile money when you order."}</Text>
              </>
            ) : (
              <Text style={{ fontFamily: font.semibold, fontSize: 14, color: colors.muted }}>
                {hasOptions ? "This choice is sold out — try another, or ask the shop." : "Sold out for now — check back soon or call the shop."}
              </Text>
            )}
            <MessageShopButton shopId={product.shop.id} productId={product.id} title="Ask the shop a question" />
            <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${product.shop.phone}`).catch(() => {})} style={{ alignItems: "center", paddingVertical: 4 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: colors.purple }}>Or call {formatLiberianPhone(product.shop.phone)}</Text>
            </Pressable>
          </Card>

          {product.description && (
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: font.display, fontSize: 17, color: colors.ink }}>About this {product.kind === "food" ? "dish" : "item"}</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 14.5, lineHeight: 21, color: colors.textSoft }}>{product.description}</Text>
            </View>
          )}

          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Visit ${product.shop.name}`}
            onPress={() => router.push({ pathname: "/shop/[slug]", params: { slug: product.shop.slug } })}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12 }}
          >
            <CategoryTile name={product.shop.name} iconUrl={product.shop.logoUrl} size={46} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>{product.shop.name}</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>
                {SHOP_KIND_LABEL[product.shop.kind]} · {product.shop.city}
              </Text>
            </View>
            <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>Visit ›</Text>
          </Pressable>

          <ReviewsBlock load={loadReviews} shopName={product.shop.name} />

          {more.length > 0 && (
            <View style={{ gap: 10 }}>
              <Text style={{ fontFamily: font.display, fontSize: 17, color: colors.ink }}>More from {product.shop.name}</Text>
              <ProductGrid products={more} />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
