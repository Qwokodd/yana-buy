import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { phonePath, type AppNotification } from "@yanabuy/shared";
import { BackBar } from "@/components/Products";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

const ICON: Record<string, string> = { order: "📦", chat: "💬", price_drop: "🏷️", booking: "📅", payout: "💵", dispute: "⚠️", shop: "🏬", product: "🛍️", system: "🔔" };

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function Notifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [more, setMore] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api.me
        .notifications()
        .then((r) => {
          setItems(r.items);
          setMore(r.items.length === 30);
          if (r.unread) api.me.markRead().catch(() => {});
        })
        .catch(() => setItems([]));
    }, [])
  );

  const loadMore = () => {
    const last = items?.[items.length - 1];
    if (!last) return;
    api.me.notifications(last.createdAt).then((r) => {
      setItems((prev) => [...(prev ?? []), ...r.items]);
      setMore(r.items.length === 30);
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title="Notifications" onBack={() => (router.canGoBack() ? router.back() : router.replace("/profile"))} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 8 }}>
        {items === null && <Text style={{ fontFamily: font.regular, color: colors.muted }}>Loading…</Text>}
        {items?.length === 0 && (
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 24 }}>Nothing yet. Order updates, messages and price drops show up here.</Text>
        )}
        {items?.map((n) => (
          <Pressable
            key={n.id}
            accessibilityRole="button"
            onPress={() => {
              const path = phonePath(n.link);
              if (path) router.push(path as never);
            }}
            style={{ flexDirection: "row", gap: 12, backgroundColor: n.read ? "#fff" : colors.purpleTint, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 12 }}
          >
            <Text style={{ fontSize: 20 }}>{ICON[n.type] ?? "🔔"}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 14.5, color: colors.ink }}>{n.title}</Text>
              {n.body ? <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.textSoft }}>{n.body}</Text> : null}
              <Text style={{ fontFamily: font.regular, fontSize: 12, color: colors.muted }}>{timeAgo(n.createdAt)}</Text>
            </View>
          </Pressable>
        ))}
        {more && <Button title="Show older" variant="outline" onPress={loadMore} />}
      </ScrollView>
    </View>
  );
}
