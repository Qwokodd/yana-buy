import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { ProductCard, ProductSort, PublicShop } from "@yanabuy/shared";
import { CategoryTile } from "@/components/Banners";
import { SearchIcon } from "@/components/Icons";
import { BackBar, GridPlaceholder, ProductGrid } from "@/components/Products";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useCategories } from "@/lib/catalog";
import { useMode } from "@/lib/mode";
import { colors, font } from "@/lib/theme";

const SORTS: { value: ProductSort; label: string }[] = [
  { value: "best", label: "Best match" },
  { value: "newest", label: "Newest" },
  { value: "top_rated", label: "Top rated" },
  { value: "price_asc", label: "Cheapest" },
  { value: "price_desc", label: "Most expensive" },
];

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", backgroundColor: on ? colors.purple : "#fff", borderWidth: 1, borderColor: on ? colors.purple : colors.lineStrong }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? "#fff" : colors.textSoft }}>{label}</Text>
    </Pressable>
  );
}

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useMode();
  const { categories } = useCategories(mode);
  const [text, setText] = useState(params.q ?? "");
  const [q, setQ] = useState(params.q ?? "");
  const [category, setCategory] = useState(params.category ?? "");
  const [sort, setSort] = useState<ProductSort>("best");
  const [china, setChina] = useState(false);
  const [items, setItems] = useState<ProductCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [shops, setShops] = useState<PublicShop[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(null);
    setPage(1);
    setError(null);
    api.public
      .products({ q: q || undefined, mode, category: category || undefined, sort, china: china || undefined })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't search"));
    if (q) api.public.shops({ q, mode }).then((r) => setShops(r.items)).catch(() => setShops([]));
    else setShops([]);
  }, [q, category, sort, mode, china]);

  async function loadMore() {
    const next = page + 1;
    const res = await api.public.products({ q: q || undefined, mode, category: category || undefined, sort, china: china || undefined, page: next });
    setItems((prev) => [...(prev ?? []), ...res.items]);
    setPage(next);
  }

  const cat = categories?.find((c) => c.slug === category);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        right={
          <View style={{ flex: 12, flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingHorizontal: 14, backgroundColor: "#fff", borderRadius: 999, borderWidth: 1, borderColor: colors.lineStrong, marginRight: 6 }}>
            <SearchIcon />
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => setQ(text.trim())}
              returnKeyType="search"
              autoFocus={!params.q && !params.category}
              placeholder={mode === "goods" ? "Search goods, services or shops" : "Search dishes or restaurants"}
              placeholderTextColor={colors.muted}
              accessibilityLabel="Search"
              style={{ flex: 1, fontFamily: font.regular, fontSize: 14.5, color: colors.ink }}
            />
          </View>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip on={!category} label="All" onPress={() => setCategory("")} />
          {(categories ?? []).map((c) => (
            <Chip key={c.id} on={category === c.slug} label={c.name} onPress={() => setCategory(c.slug)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {mode === "goods" && <Chip on={china} label="🇨🇳 From China" onPress={() => setChina((v) => !v)} />}
          {SORTS.map((s) => (
            <Chip key={s.value} on={sort === s.value} label={s.label} onPress={() => setSort(s.value)} />
          ))}
        </ScrollView>

        <Text style={{ fontFamily: font.display, fontSize: 20, color: colors.ink }}>
          {q ? `“${q}”` : cat ? cat.name : mode === "goods" ? "Goods & Services" : "Food"}
          <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted }}>{items ? `  ${total} ${total === 1 ? "result" : "results"}` : ""}</Text>
        </Text>

        {shops.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {shops.map((s) => (
              <Pressable
                key={s.id}
                accessibilityRole="link"
                onPress={() => router.push({ pathname: "/shop/[slug]", params: { slug: s.slug } })}
                style={{ width: 220, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 10 }}
              >
                <CategoryTile name={s.name} iconUrl={s.logoUrl} size={42} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>
                    {s.name}
                  </Text>
                  <Text style={{ fontFamily: font.regular, fontSize: 12, color: colors.muted }}>
                    {s.city} · {s.productCount} items
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {error ? (
          <Text style={{ fontFamily: font.regular, color: colors.danger }}>{error}</Text>
        ) : items === null ? (
          <GridPlaceholder />
        ) : items.length ? (
          <>
            <ProductGrid products={items} />
            {items.length < total && <Button title="Show more" variant="outline" onPress={loadMore} />}
          </>
        ) : (
          <View style={{ backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 22, alignItems: "center", gap: 6 }}>
            <Text style={{ fontFamily: font.display, fontSize: 17, color: colors.ink }}>Nothing found</Text>
            <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted, textAlign: "center" }}>
              {q ? "Try fewer or different words." : "Nothing listed here yet."}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
