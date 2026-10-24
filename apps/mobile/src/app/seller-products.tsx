import { useCallback, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Image } from "expo-image";
import { formatLD, type MyProduct } from "@yanabuy/shared";
import { BackBar } from "@/components/Products";
import { Button, Card, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

const STATUS: Record<MyProduct["status"], { label: string; bg: string; fg: string }> = {
  pending: { label: "Waiting for review", bg: colors.warnTint, fg: colors.warn },
  approved: { label: "On sale", bg: colors.successTint, fg: colors.success },
  rejected: { label: "Needs changes", bg: colors.dangerTint, fg: colors.danger },
  removed: { label: "Removed by YanaBuy", bg: colors.dangerTint, fg: colors.danger },
};

/** Asks "are you sure?" — a real dialog on phones, the browser's on the web preview. */
function confirm(title: string, onYes: () => void) {
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(title)) onYes();
    return;
  }
  Alert.alert(title, undefined, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onYes },
  ]);
}

export default function SellerProducts() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<MyProduct[] | null>(null);
  const [food, setFood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Reload whenever the screen opens again (after adding or editing).
  useFocusEffect(
    useCallback(() => {
      Promise.all([api.shop.products(), api.shop.mine()])
        .then(([p, s]) => {
          setItems(p.items);
          setFood(s.shop?.kind === "restaurant");
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your products"));
    }, [])
  );

  const noun = food ? "dish" : "product";

  async function togglePause(p: MyProduct) {
    try {
      const res = await api.shop.updateProduct(p.id, { hidden: !p.hidden });
      setItems((prev) => (prev ?? []).map((x) => (x.id === p.id ? res.product : x)));
      setNotice(res.product.hidden ? `“${p.name}” is paused.` : `“${p.name}” is showing again.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change it");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title={food ? "Your menu" : "Your products"} onBack={() => (router.canGoBack() ? router.back() : router.replace("/sell"))} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <Button title={`+ Add a ${noun}`} onPress={() => router.push("/seller-product")} />
        <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted, lineHeight: 18 }}>
          New {noun}s and changes to names, photos or descriptions are checked by YanaBuy before they go on sale. Price and stock changes show straight away.
        </Text>
        {notice && <Notice tone="success">{notice}</Notice>}
        {error && <Notice>{error}</Notice>}
        {(items ?? []).map((p) => (
          <Card key={p.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              {p.image ? (
                <Image source={{ uri: p.image }} style={{ width: 64, height: 64, borderRadius: 12 }} contentFit="cover" />
              ) : (
                <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: colors.ground }} />
              )}
              <View style={{ flex: 1, gap: 3 }}>
                <Text numberOfLines={2} style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>
                  {p.name}
                </Text>
                <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.textSoft }}>
                  {p.hasOptions ? `from ${formatLD(p.price)} · ${p.variants.length} choices` : formatLD(p.price)}
                  {p.buyerPrice !== p.price ? ` · buyers see ${formatLD(p.buyerPrice)}` : ""}
                  {p.stock !== null ? ` · ${p.stock} in stock` : ""}
                </Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <View style={{ backgroundColor: STATUS[p.status].bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 }}>
                    <Text style={{ fontFamily: font.extrabold, fontSize: 11.5, color: STATUS[p.status].fg }}>{STATUS[p.status].label}</Text>
                  </View>
                  {p.hidden && p.status === "approved" && (
                    <View style={{ backgroundColor: "#F1EEF3", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 }}>
                      <Text style={{ fontFamily: font.extrabold, fontSize: 11.5, color: colors.textSoft }}>Paused</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
            {p.statusReason && (p.status === "rejected" || p.status === "removed") && (
              <Text style={{ fontFamily: font.semibold, fontSize: 13, color: colors.danger }}>{p.statusReason}</Text>
            )}
            <View style={{ flexDirection: "row", gap: 18 }}>
              {p.status !== "removed" && (
                <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${p.name}`} onPress={() => router.push({ pathname: "/seller-product", params: { id: p.id } })} hitSlop={8}>
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.purple }}>{p.status === "rejected" ? "Fix" : "Edit"}</Text>
                </Pressable>
              )}
              {p.status === "approved" && (
                <Pressable accessibilityRole="button" accessibilityLabel={`${p.hidden ? "Show" : "Pause"} ${p.name}`} onPress={() => togglePause(p)} hitSlop={8}>
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.textSoft }}>{p.hidden ? "Show" : "Pause"}</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${p.name}`}
                hitSlop={8}
                onPress={() =>
                  confirm(`Delete “${p.name}”?`, async () => {
                    await api.shop.deleteProduct(p.id).catch(() => {});
                    setItems((prev) => (prev ?? []).filter((x) => x.id !== p.id));
                  })
                }
              >
                <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.danger }}>Delete</Text>
              </Pressable>
            </View>
          </Card>
        ))}
        {items && items.length === 0 && (
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 12 }}>
            Nothing yet — good photos sell faster.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
