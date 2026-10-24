import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import type { Banner, Category, ProductCard, ProductQuery } from "@yanabuy/shared";
import { api } from "@/lib/api";
import { useMode } from "@/lib/mode";
import { colors, font } from "@/lib/theme";
import { BannerMedia, useOpenBanner } from "./Banners";
import { Countdown } from "./Countdown";
import { Card } from "./Products";

/** A titled row of cards that scrolls sideways, like "Shops to explore". */
export function CardRow({ title, more, children }: { title: string; more?: { href: Href; text: string }; children: ReactNode }) {
  const router = useRouter();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text accessibilityRole="header" style={{ fontFamily: font.display, fontSize: 20, color: colors.ink }}>
          {title}
        </Text>
        {more && (
          <Pressable accessibilityRole="link" onPress={() => router.push(more.href)}>
            <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: colors.purple }}>{more.text} ›</Text>
          </Pressable>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 18 }} style={{ marginRight: -18 }}>
        {children}
      </ScrollView>
    </View>
  );
}

/** Categories (goods) or Menus (food) as picture cards. */
export function CategoryCards({ categories, mode }: { categories: Category[]; mode: "goods" | "food" }) {
  const router = useRouter();
  if (!categories.length) return null;
  const food = mode === "food";
  return (
    <CardRow title={food ? "Menus" : "Categories"} more={{ href: { pathname: "/search", params: { mode } }, text: food ? "All dishes" : "Everything" }}>
      {categories.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="link"
          accessibilityLabel={c.name}
          onPress={() => router.push({ pathname: "/search", params: { category: c.slug, mode } })}
          style={{ width: 140, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}
        >
          <View style={{ height: 90, backgroundColor: food ? "#FFE3CC" : "#FFF1D6", alignItems: "center", justifyContent: "center" }}>
            {c.iconUrl ? (
              <Image source={{ uri: c.iconUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            ) : (
              <Text style={{ fontFamily: font.display, fontSize: 32, color: colors.purpleLight }}>{c.name[0]}</Text>
            )}
          </View>
          <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink, paddingHorizontal: 12, paddingVertical: 10 }}>
            {c.name}
          </Text>
        </Pressable>
      ))}
    </CardRow>
  );
}

function useProducts(query: ProductQuery) {
  const { foodHow } = useMode();
  const [items, setItems] = useState<ProductCard[] | null>(null);
  const key = JSON.stringify(query);
  useEffect(() => {
    setItems(null);
    api.public
      .products(JSON.parse(key))
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [key, foodHow]);
  return items;
}

/** Items YanaBuy picked to feature. */
export function FeaturedRow({ mode }: { mode: "goods" | "food" }) {
  const items = useProducts({ mode, featured: true });
  if (!items?.length) return null;
  return (
    <CardRow title={mode === "food" ? "Featured dishes" : "Featured"} more={{ href: { pathname: "/search", params: { mode } }, text: "See more" }}>
      {items.slice(0, 12).map((p) => (
        <Card key={p.id} p={p} width={160} />
      ))}
    </CardRow>
  );
}

/** Promos with countdowns: the admin's promo cards, then shops' / restaurants' flash sales (soonest to end first). */
export function PromosRow({ mode }: { mode: "goods" | "food" }) {
  const [promos, setPromos] = useState<Banner[] | null>(null);
  const flash = useProducts({ mode, flash: true });
  const open = useOpenBanner();
  useEffect(() => {
    api.public
      .banners({ platform: "app", mode, placement: "promo" })
      .then((r) => setPromos(r.items))
      .catch(() => setPromos([]));
  }, [mode]);
  if (!promos?.length && !flash?.length) return null;
  return (
    <CardRow title={mode === "food" ? "Food promos" : "Promos"}>
      {(promos ?? []).map((b) => (
        <Pressable
          key={b.id}
          accessibilityRole={b.linkUrl ? "link" : "image"}
          accessibilityLabel={b.kind === "ad" ? `Ad: ${b.title}` : b.title}
          onPress={() => open(b)}
          style={{ width: 250, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}
        >
          <View style={{ height: 120, backgroundColor: colors.ink }}>
            <BannerMedia banner={b} />
            <Countdown ends={b.endsAt} style={{ position: "absolute", left: 10, top: 10 }} />
          </View>
          <View style={{ padding: 12, gap: 3 }}>
            <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>
              {b.title}
            </Text>
            {b.subtitle ? (
              <Text numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>
                {b.subtitle}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
      {(flash ?? []).map((p) => (
        <Card key={p.id} p={p} width={160} />
      ))}
    </CardRow>
  );
}
