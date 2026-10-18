import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import type { RatingSummary, Review } from "@yanabuy/shared";
import { BackBar } from "@/components/Products";
import { Stars } from "@/components/Trust";
import { Avatar, Button, Card, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function SellerReviews() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [data, setData] = useState<{ summary: RatingSummary; items: Review[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.shop
        .reviews()
        .then(setData)
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load reviews"));
    }, [])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title="Reviews" onBack={() => (router.canGoBack() ? router.back() : router.replace("/sell"))} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 12 }} keyboardShouldPersistTaps="handled">
        {error && <Notice>{error}</Notice>}
        {data && (
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ fontFamily: font.display, fontSize: 34, color: colors.ink }}>{data.summary.average?.toFixed(1) ?? "–"}</Text>
            <View style={{ gap: 2 }}>
              <Stars value={data.summary.average ?? 0} size={16} />
              <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>
                {data.summary.count} {data.summary.count === 1 ? "review" : "reviews"}
              </Text>
            </View>
          </Card>
        )}
        {data?.items.length === 0 && (
          <Card>
            <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted }}>No reviews yet. They appear after buyers rate delivered orders.</Text>
          </Card>
        )}
        {data?.items.map((r) => (
          <ReviewCard key={r.id} review={r} onChanged={(u) => setData((d) => d && { ...d, items: d.items.map((x) => (x.id === u.id ? u : x)) })} />
        ))}
      </ScrollView>
    </View>
  );
}

function ReviewCard({ review: r, onChanged }: { review: Review; onChanged: (r: Review) => void }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState(r.sellerReply ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Avatar name={r.buyerName} url={r.buyerAvatar} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>{r.buyerName}</Text>
          <Text numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12, color: colors.muted }}>
            {r.product.name} · {day(r.createdAt)}
          </Text>
        </View>
        <Stars value={r.rating} size={13} />
      </View>
      {r.comment && <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.ink, lineHeight: 20 }}>{r.comment}</Text>}
      {r.sellerReply && !replying && (
        <View style={{ backgroundColor: colors.purpleTint, borderRadius: 12, padding: 10 }}>
          <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.ink }}>
            <Text style={{ fontFamily: font.bold }}>Your reply: </Text>
            {r.sellerReply}
          </Text>
        </View>
      )}
      {replying ? (
        <View style={{ gap: 8 }}>
          <Field label="Your reply" value={text} onChangeText={setText} multiline maxLength={600} style={{ height: 80, paddingTop: 12, textAlignVertical: "top" }} />
          {error && <Notice>{error}</Notice>}
          <Button
            title="Post reply"
            busy={busy}
            disabled={text.trim().length < 2}
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                onChanged((await api.shop.replyToReview(r.id, text)).review);
                setReplying(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Couldn't post");
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setReplying(true)}>
          <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: colors.purple }}>{r.sellerReply ? "Change reply" : "Reply"}</Text>
        </Pressable>
      )}
    </Card>
  );
}
