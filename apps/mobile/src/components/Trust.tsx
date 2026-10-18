import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";
import { useRouter } from "expo-router";
import { DISPUTE_OUTCOME_LABEL, DISPUTE_REASON_LABEL, formatLD, type OrderDispute, type RatingSummary, type Review } from "@yanabuy/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, font } from "@/lib/theme";
import { Avatar, Button, Card, Notice } from "./ui";
import { askPhotoSource, pickPhoto, uploadPublic } from "./AvatarPicker";

const STAR = "M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z";
const EMPTY = "#E4DEEA";

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <View style={{ flexDirection: "row", gap: 1 }} accessible accessibilityLabel={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Svg key={i} width={size} height={size} viewBox="0 0 24 24">
          <Path d={STAR} fill={i <= full ? colors.amber : EMPTY} />
        </Svg>
      ))}
    </View>
  );
}

export function RatingLine({ rating, count, size = 12 }: { rating: number | null; count: number; size?: number }) {
  if (!rating || !count) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Stars value={rating} size={size} />
      <Text style={{ fontFamily: font.bold, fontSize: size, color: colors.ink }}>{rating.toFixed(1)}</Text>
      <Text style={{ fontFamily: font.regular, fontSize: size, color: colors.muted }}>({count})</Text>
    </View>
  );
}

export function StarPicker({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable
          key={i}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === i }}
          accessibilityLabel={`${i} star${i > 1 ? "s" : ""}`}
          onPress={() => onChange(i)}
          hitSlop={4}
        >
          <Svg width={32} height={32} viewBox="0 0 24 24">
            <Path d={STAR} fill={i <= value ? colors.amber : EMPTY} />
          </Svg>
        </Pressable>
      ))}
    </View>
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function ReviewRow({ review: r, shopName, showProduct }: { review: Review; shopName: string; showProduct?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
      <Avatar name={r.buyerName} url={r.buyerAvatar} size={34} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>{r.buyerName}</Text>
          <Stars value={r.rating} size={12} />
          <Text style={{ fontFamily: font.regular, fontSize: 11.5, color: colors.muted }}>{day(r.createdAt)}</Text>
        </View>
        {showProduct && <Text style={{ fontFamily: font.semibold, fontSize: 12, color: colors.muted }}>{r.product.name}</Text>}
        {r.comment && <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.textSoft, lineHeight: 20 }}>{r.comment}</Text>}
        {r.sellerReply && (
          <View style={{ backgroundColor: colors.purpleTint, borderRadius: 12, padding: 10, marginTop: 4 }}>
            <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.ink }}>
              <Text style={{ fontFamily: font.bold }}>{shopName} replied: </Text>
              {r.sellerReply}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** Stars summary and the latest reviews, with "show more". */
export function ReviewsBlock({
  load,
  shopName,
  showProduct,
  title = "Reviews",
}: {
  load: (page: number) => Promise<{ summary: RatingSummary; items: Review[]; total: number }>;
  shopName: string;
  showProduct?: boolean;
  title?: string;
}) {
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [items, setItems] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchPage = useCallback(
    (p: number) =>
      load(p)
        .then((res) => {
          setSummary(res.summary);
          setTotal(res.total);
          setItems((prev) => (p === 1 ? res.items : [...prev, ...res.items]));
          setPage(p);
        })
        .catch(() => {}),
    [load]
  );
  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  if (!summary) return null;
  return (
    <Card style={{ gap: 6 }}>
      <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink }}>
        {title} {summary.count > 0 ? `(${summary.count})` : ""}
      </Text>
      {summary.count === 0 ? (
        <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted }}>No reviews yet. Buyers can rate items after delivery.</Text>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 6 }}>
            <Text style={{ fontFamily: font.display, fontSize: 32, color: colors.ink }}>{summary.average?.toFixed(1)}</Text>
            <View style={{ gap: 2 }}>
              <Stars value={summary.average ?? 0} size={16} />
              <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>
                {summary.count} {summary.count === 1 ? "review" : "reviews"}
              </Text>
            </View>
          </View>
          {items.map((r) => (
            <ReviewRow key={r.id} review={r} shopName={shopName} showProduct={showProduct} />
          ))}
          {items.length < total && (
            <Pressable accessibilityRole="button" onPress={() => fetchPage(page + 1)} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
              <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.purple, textAlign: "center" }}>Show more reviews</Text>
            </Pressable>
          )}
        </>
      )}
    </Card>
  );
}

/** Opens the chat with a shop (logging in first if needed). */
export function MessageShopButton({ shopId, productId, orderId, title = "Message the shop" }: { shopId: string; productId?: string; orderId?: string; title?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      title={title}
      variant="outline"
      busy={busy}
      onPress={async () => {
        if (!user) return router.push("/login");
        setBusy(true);
        try {
          const { conversation } = await api.chats.start({ shopId });
          router.push({ pathname: "/chat/[id]", params: { id: conversation.id, ...(productId ? { product: productId } : {}), ...(orderId ? { order: orderId } : {}) } });
        } catch (err) {
          Alert.alert("Couldn't open the chat", err instanceof Error ? err.message : "Please try again.");
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

/** A row of uploaded photos with an "add" tile. */
export function PhotoPicker({ images, onChange, max = 6, label }: { images: string[]; onChange: (urls: string[]) => void; max?: number; label: string }) {
  const [busy, setBusy] = useState(false);
  const add = () =>
    askPhotoSource(
      async (source) => {
        try {
          const asset = await pickPhoto(source, { crop: false });
          if (!asset) return;
          setBusy(true);
          const url = await uploadPublic(asset);
          if (url) onChange([...images, url].slice(0, max));
        } catch (err) {
          Alert.alert("Couldn't upload the photo", err instanceof Error ? err.message : "Please try again.");
        } finally {
          setBusy(false);
        }
      },
      undefined,
      label
    );
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {images.map((u, i) => (
          <Pressable key={u + i} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} onPress={() => onChange(images.filter((_, j) => j !== i))}>
            <Image source={{ uri: u }} style={{ width: 72, height: 72, borderRadius: 12 }} contentFit="cover" />
            <View style={{ position: "absolute", right: -4, top: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontSize: 11, fontFamily: font.bold }}>✕</Text>
            </View>
          </Pressable>
        ))}
        {images.length < max && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a photo"
            onPress={add}
            disabled={busy}
            style={{ width: 72, height: 72, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center", backgroundColor: "#FBF9FC" }}
          >
            {busy ? <ActivityIndicator color={colors.purple} /> : <Text style={{ fontSize: 26, color: colors.purple }}>+</Text>}
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** A reported problem as the buyer or seller sees it. */
export function DisputeBox({ dispute: d, audience, children }: { dispute: OrderDispute; audience: "buyer" | "seller"; children?: ReactNode }) {
  const open = d.status === "open";
  return (
    <Card style={{ gap: 8, borderWidth: 2, borderColor: open ? colors.amber : colors.line }}>
      <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>
        {audience === "buyer" ? "Your report" : "The buyer reported a problem"} · {DISPUTE_REASON_LABEL[d.reason]}
      </Text>
      <Notice tone={open ? "info" : "success"}>{open ? "YanaBuy is looking into it" : "Decided"}</Notice>
      <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.ink, lineHeight: 20 }}>{d.description}</Text>
      {d.photos.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {d.photos.map((u, i) => (
            <Image key={u + i} source={{ uri: u }} style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="cover" />
          ))}
        </View>
      )}
      {d.sellerResponse && (
        <View style={{ backgroundColor: colors.ground, borderRadius: 12, padding: 10 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 11.5, color: colors.muted }}>{audience === "seller" ? "YOUR SIDE" : "THE SHOP SAYS"}</Text>
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.ink }}>{d.sellerResponse}</Text>
        </View>
      )}
      {children}
      {!open && d.outcome && (
        <View style={{ backgroundColor: colors.purpleTint, borderRadius: 12, padding: 10, gap: 2 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>
            YanaBuy decided: {DISPUTE_OUTCOME_LABEL[d.outcome]}
            {d.refundAmount ? ` — ${formatLD(d.refundAmount)} back to the buyer` : ""}
          </Text>
          {audience === "seller" && d.sellerCharge ? (
            <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.ink }}>{formatLD(d.sellerCharge)} was taken from your balance.</Text>
          ) : null}
          {d.decisionNote && <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.ink }}>{d.decisionNote}</Text>}
        </View>
      )}
    </Card>
  );
}
