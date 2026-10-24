import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { PublicShop, ShopCategory } from "@yanabuy/shared";
import { BackBar } from "@/components/Products";
import { ShopCard } from "@/components/ShopCard";
import { api } from "@/lib/api";
import { useMode } from "@/lib/mode";
import { colors, font } from "@/lib/theme";

const PAGE = 20;

/** Every open shop and restaurant by category — tap one to visit its page. */
export default function ShopsDirectory() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; mode?: string }>();
  const { mode, setMode, switchMode } = useMode();
  const [cats, setCats] = useState<ShopCategory[]>([]);
  const [category, setCategory] = useState(params.category ?? "");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PublicShop[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const food = mode === "food";

  useEffect(() => {
    if (params.mode === "food" || params.mode === "goods") setMode(params.mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.public
      .shopCategories(mode)
      .then((r) => setCats(r.items))
      .catch(() => setCats([]));
  }, [mode]);

  const load = useCallback(
    (p: number) => {
      if (p === 1) setItems(null);
      else setLoadingMore(true);
      api.public
        .shops({ mode, category: category || undefined, q: q || undefined, page: p, limit: PAGE })
        .then((r) => {
          setItems((prev) => (p === 1 ? r.items : [...(prev ?? []), ...r.items]));
          setTotal(r.total);
          setPage(p);
        })
        .catch(() => p === 1 && setItems([]))
        .finally(() => setLoadingMore(false));
    },
    [mode, category, q]
  );
  useEffect(() => load(1), [load]);

  const chip = (slug: string, label: string) => {
    const on = category === slug;
    return (
      <Pressable
        key={slug || "all"}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => setCategory(slug)}
        style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", borderWidth: 1, borderColor: on ? colors.purple : colors.lineStrong, backgroundColor: on ? colors.purple : "#fff" }}
      >
        <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? "#fff" : colors.ink }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title={food ? "Restaurants" : "Shops"} onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <FlatList
        data={items ?? []}
        keyExtractor={(s) => s.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 12 }}
        onEndReachedThreshold={0.4}
        onEndReached={() => items && items.length < total && !loadingMore && load(page + 1)}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <View style={{ flexDirection: "row", padding: 4, backgroundColor: "#fff", borderRadius: 999, borderWidth: 1, borderColor: colors.line }}>
              {(["goods", "food"] as const).map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mode === m }}
                  onPress={() => {
                    switchMode(m);
                    setCategory("");
                  }}
                  style={{ flex: 1, height: 38, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: mode === m ? (m === "goods" ? colors.amber : colors.orange) : "transparent" }}
                >
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>{m === "goods" ? "Shops" : "Restaurants"}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => setQ(query.trim())}
              returnKeyType="search"
              placeholder={food ? "Restaurant name or area" : "Shop name, area or what they sell"}
              placeholderTextColor="#9A91A3"
              accessibilityLabel="Search shops"
              style={{ height: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: "#fff", paddingHorizontal: 16, fontFamily: font.regular, fontSize: 14, color: colors.ink }}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {chip("", "All")}
              {cats.map((c) => chip(c.slug, `${c.name} · ${c.shopCount}`))}
            </View>
            {items && <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>{`${total} ${food ? "restaurants" : "shops"}`}</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1 }}>
            <ShopCard shop={item} />
          </View>
        )}
        ListEmptyComponent={
          items === null ? (
            <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
          ) : (
            <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 24 }}>Nothing found. Try another category.</Text>
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.purple} /> : null}
      />
    </View>
  );
}
