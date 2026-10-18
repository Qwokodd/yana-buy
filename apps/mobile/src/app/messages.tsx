import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import type { ConversationSummary } from "@yanabuy/shared";
import { BackBar } from "@/components/Products";
import { CategoryTile } from "@/components/Banners";
import { Avatar, Card, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";
import { chatTime } from "@/lib/chat";


export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.chats
      .list()
      .then((r) => {
        setItems(r.items);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your messages"));
  }, []);
  useFocusEffect(load);
  useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title="Messages" onBack={() => (router.canGoBack() ? router.back() : router.replace("/profile"))} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 8 }}>
        {error && <Notice>{error}</Notice>}
        {items?.length === 0 && (
          <Card>
            <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>No messages yet</Text>
            <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted }}>Tap &quot;Ask the shop a question&quot; on any product to start a chat.</Text>
          </Card>
        )}
        {items?.map((c) => {
          const shopSide = c.side === "shop";
          const name = shopSide ? c.buyer.fullName : c.shop.name;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={`Chat with ${name}${c.unread ? `, ${c.unread} unread` : ""}`}
              onPress={() => router.push({ pathname: "/chat/[id]", params: { id: c.id } })}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12 }}
            >
              {shopSide ? <Avatar name={name} url={c.buyer.avatarUrl} size={46} /> : <CategoryTile name={name} iconUrl={c.shop.logoUrl} size={46} />}
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: c.unread ? font.extrabold : font.bold, fontSize: 15, color: colors.ink }}>
                    {name}
                  </Text>
                  <Text style={{ fontFamily: font.regular, fontSize: 11.5, color: colors.muted }}>{chatTime(c.lastMessageAt)}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: c.unread ? font.semibold : font.regular, fontSize: 13, color: c.unread ? colors.ink : colors.muted }}>
                    {shopSide ? "Your shop · " : ""}
                    {c.lastMessage ?? "No messages yet"}
                  </Text>
                  {c.unread > 0 && (
                    <View style={{ backgroundColor: colors.amber, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 }}>
                      <Text style={{ fontFamily: font.extrabold, fontSize: 11, color: colors.ink }}>{c.unread}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
