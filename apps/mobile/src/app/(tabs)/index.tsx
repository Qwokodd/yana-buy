import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { Image } from "expo-image";
import { BagLogo, SearchIcon } from "@/components/Icons";
import { HeroBanners } from "@/components/Banners";
import { CategoryCards, FeaturedRow, PromosRow } from "@/components/HomeSections";
import { useBranding } from "@/lib/branding";
import { useBanners, useCategories } from "@/lib/catalog";
import { GridPlaceholder } from "@/components/Products";
import { ProductFeed } from "@/components/Feed";
import { nearBottom, useProductFeed } from "@/lib/feed";
import { api } from "@/lib/api";
import type { PublicShop } from "@yanabuy/shared";
import { ShopCard } from "@/components/ShopCard";
import { Avatar } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { setBrowsing, workspaceFor, workspaceTitle } from "@/lib/workspace";
import { SellerMenu } from "@/components/SellerMenu";
import { FOOD_HOW } from "@/components/FoodHowPicker";
import { useMode } from "@/lib/mode";
import { useCountry } from "@/lib/country";
import { CountryPicker } from "@/components/CountryPicker";
import { colors, font } from "@/lib/theme";

export default function Home() {
  const insets = useSafeAreaInsets();
  const { mode, setMode, switchMode, foodHow, askFoodHow } = useMode();
  const { country } = useCountry();
  const { user } = useAuth();
  const router = useRouter();
  const accent = mode === "goods" ? colors.amber : colors.orange;
  const branding = useBranding();
  const { categories } = useCategories(mode);
  const { banners } = useBanners(mode);
  const [search, setSearch] = useState("");
  const [shops, setShops] = useState<PublicShop[]>([]);
  useEffect(() => {
    api.public
      .shops({ mode, sort: "popular", limit: 8 })
      .then((res) => setShops(res.items))
      .catch(() => setShops([]));
  }, [mode]);

  const feed = useProductFeed({ mode, sort: "best" });
  const products = feed.items;
  const heroes = (banners ?? []).filter((b) => b.placement === "hero");
  const promos = (banners ?? []).filter((b) => b.placement === "strip");
  // Ads between rows of products: the promo banners, or the top ones if there are none.
  const feedAds = promos.length ? promos : heroes;
  const isYanaBuy = branding.appName.replace(/\s/g, "").toLowerCase() === "yanabuy";

  // White status-bar text over the purple header; dark everywhere else.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle("dark");
    }, [])
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ground }}
      contentContainerStyle={{ paddingBottom: 24 }}
      scrollEventThrottle={200}
      onScroll={(e) => {
        if (!feed.done && !feed.error && nearBottom(e)) void feed.loadNext();
      }}
    >
      <View style={{ backgroundColor: colors.purple, paddingTop: insets.top + 14, paddingHorizontal: 18, paddingBottom: 22, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, gap: 14 }}>
        {workspaceFor(user) && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setBrowsing(false);
              router.replace(workspaceFor(user)!);
            }}
            style={{ alignSelf: "flex-start", backgroundColor: colors.amber, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}
          >
            <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>← Back to {workspaceTitle(user)}</Text>
          </Pressable>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {branding.logoUrl ? (
              <Image source={{ uri: branding.logoUrl }} style={{ height: 30, width: 30, borderRadius: 8 }} contentFit="contain" accessibilityIgnoresInvertColors />
            ) : (
              <BagLogo />
            )}
            <Text accessibilityRole="header" style={{ fontFamily: font.display, fontSize: 21, color: "#fff", letterSpacing: -0.5 }}>
              {isYanaBuy ? (
                <>
                  YANA<Text style={{ color: accent }}>BUY</Text>
                </>
              ) : (
                branding.appName
              )}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <CountryPicker />
          <Pressable accessibilityRole="button" accessibilityLabel={user ? "Your profile" : "Log in"} onPress={() => (user ? router.navigate("/profile") : router.push("/login"))}>
            {user ? (
              <Avatar name={user.fullName} url={user.avatarUrl} size={38} />
            ) : (
              <View style={{ backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>Log in</Text>
              </View>
            )}
          </Pressable>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <SellerMenu />
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, height: 48, paddingLeft: 16, paddingRight: 16, backgroundColor: "#fff", borderRadius: 999 }}>
          <SearchIcon />
          <TextInput
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (search.trim()) router.push({ pathname: "/search", params: { q: search.trim() } });
            }}
            placeholder={mode === "goods" ? "Search goods, services or shops" : "Search dishes or restaurants"}
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search"
            style={{ flex: 1, fontFamily: font.regular, fontSize: 14, color: colors.ink }}
          />
        </View>
        </View>

        <View style={{ flexDirection: "row", padding: 4, backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 999 }}>
          {(["goods", "food"] as const).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === m }}
              onPress={() => switchMode(m)}
              style={{ flex: 1, height: 38, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: mode === m ? (m === "goods" ? colors.amber : colors.orange) : "transparent" }}
            >
              <Text style={{ fontFamily: font.bold, fontSize: 14, color: mode === m ? colors.ink : "#fff" }}>{m === "goods" ? "Goods & Services" : "Food"}</Text>
            </Pressable>
          ))}
        </View>
        {mode === "food" && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Food: ${FOOD_HOW.find((o) => o.value === foodHow)?.title}. Change`}
            onPress={askFoodHow}
            style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.orange, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}
          >
            <Text style={{ fontSize: 15 }}>{FOOD_HOW.find((o) => o.value === foodHow)?.icon}</Text>
            <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: colors.ink }}>{FOOD_HOW.find((o) => o.value === foodHow)?.title} · change</Text>
          </Pressable>
        )}
      </View>

      <View style={{ padding: 18, gap: 18 }}>
        {banners === null ? (
          <View style={{ height: 160, borderRadius: 20, backgroundColor: colors.lineStrong, opacity: 0.5 }} />
        ) : heroes.length ? (
          <HeroBanners banners={heroes} />
        ) : (
          <View style={{ height: 150, borderRadius: 20, backgroundColor: colors.ink, overflow: "hidden", justifyContent: "center", paddingHorizontal: 20 }}>
            <View style={{ position: "absolute", right: -30, top: -30, width: 190, height: 190, borderRadius: 95, backgroundColor: accent }} />
            <View style={{ position: "absolute", right: 36, bottom: -40, width: 110, height: 110, borderRadius: 55, backgroundColor: colors.purpleLight }} />
            <Text style={{ fontFamily: font.bold, fontSize: 11, letterSpacing: 1, color: colors.amber, textTransform: "uppercase" }}>{`The new ${branding.appName}`}</Text>
            <Text style={{ marginTop: 6, maxWidth: 200, fontFamily: font.display, fontSize: 25, lineHeight: 27, color: "#fff" }}>
              {mode === "goods" ? (country === "US" ? "Liberian shops across the USA" : "Liberian shops in your pocket") : "Food from kitchens near you"}
            </Text>
          </View>
        )}

        <CategoryCards categories={categories ?? []} mode={mode} />
        {mode === "goods" && <FeaturedRow mode={mode} />}
        <PromosRow mode={mode} />

        {mode === "goods" && (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Buy from China — get a price"
            onPress={() => router.push("/china")}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.ink, borderRadius: 20, padding: 16 }}
          >
            <Text style={{ fontSize: 26 }}>🇨🇳</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.display, fontSize: 16, color: "#fff" }}>Want something from China?</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: "rgba(255,255,255,0.8)" }}>Send a link or photo — we quote, ship and deliver.</Text>
            </View>
            <Text style={{ fontFamily: font.bold, fontSize: 20, color: colors.amber }}>›</Text>
          </Pressable>
        )}

        {shops.length > 0 && (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: font.display, fontSize: 20, color: colors.ink }}>{mode === "goods" ? "Shops to explore" : "Restaurants near you"}</Text>
              <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/shops", params: { mode } })}>
                <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: colors.purple }}>See all ›</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 18 }} style={{ marginRight: -18 }}>
              {shops.map((s) => (
                <ShopCard key={s.id} shop={s} width={200} />
              ))}
            </ScrollView>
          </View>
        )}

        <Text style={{ fontFamily: font.display, fontSize: 20, color: colors.ink }}>{mode === "goods" ? "Best deals" : "Popular right now"}</Text>
        {products === null ? (
          <GridPlaceholder />
        ) : products.length ? (
          <ProductFeed products={products} ads={feedAds} done={feed.done} loading={feed.loading} error={feed.error} onRetry={feed.loadNext} />
        ) : (
          <View style={{ backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 24, alignItems: "center", gap: 6 }}>
          <Text style={{ fontFamily: font.display, fontSize: 17, color: colors.ink }}>Shops are getting ready</Text>
          <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted, textAlign: "center", lineHeight: 19 }}>
            Products appear here as soon as shops start listing them.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/sell")} style={{ marginTop: 10, backgroundColor: colors.purple, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 14, color: "#fff" }}>{mode === "goods" ? "Open a shop" : "Open a restaurant"}</Text>
          </Pressable>
        </View>
        )}
      </View>
    </ScrollView>
  );
}
