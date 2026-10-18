import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { ApiError, DISPUTE_DAYS, DISPUTE_REASON_LABEL, type DisputeReason, type Order } from "@yanabuy/shared";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";
import { Button, Card, Field, Notice } from "./ui";
import { PhotoPicker, StarPicker } from "./Trust";

const inputStyle = {
  minHeight: 64,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: colors.lineStrong,
  paddingHorizontal: 12,
  paddingTop: 10,
  paddingBottom: 10,
  fontFamily: font.regular,
  fontSize: 14.5,
  color: colors.ink,
  textAlignVertical: "top" as const,
};

export function RateItems({ order }: { order: Order }) {
  // One rating per product, even if two colours/sizes of it were bought.
  const items = order.items.filter((i, n, all) => i.productId && all.findIndex((x) => x.productId === i.productId) === n);
  const [mine, setMine] = useState<Record<string, { rating: number; comment: string | null }>>({});
  useEffect(() => {
    api.orders
      .myReviews(order.id)
      .then((res) => setMine(Object.fromEntries(res.items.map((r) => [r.productId, { rating: r.rating, comment: r.comment }]))))
      .catch(() => {});
  }, [order.id]);
  if (!items.length) return null;
  return (
    <Card style={{ gap: 4 }}>
      <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink }}>How was it?</Text>
      <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>Your stars help other buyers. Only your first name and initial are shown.</Text>
      {items.map((i) => (
        <RateOne key={i.id} orderId={order.id} productId={i.productId!} name={i.name} image={i.image} existing={mine[i.productId!]} />
      ))}
    </Card>
  );
}

function RateOne({ orderId, productId, name, image, existing }: { orderId: string; productId: string; name: string; image: string | null; existing?: { rating: number; comment: string | null } }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setRating(existing.rating);
      setComment(existing.comment ?? "");
      setSaved(true);
    }
  }, [existing]);

  async function save() {
    if (!rating) return setError("Choose 1 to 5 stars");
    setBusy(true);
    setError(null);
    try {
      await api.orders.review({ orderId, productId, rating, comment: comment.trim() || null });
      setSaved(true);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flexDirection: "row", gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
      {image ? <Image source={{ uri: image }} style={{ width: 48, height: 48, borderRadius: 10 }} /> : <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.ground }} />}
      <View style={{ flex: 1, gap: 8 }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 14, color: colors.ink }}>{name}</Text>
        {saved && !editing ? (
          <>
            <StarPicker value={rating} onChange={() => setEditing(true)} label={`Your stars for ${name}`} />
            <Text style={{ fontFamily: font.semibold, fontSize: 13, color: colors.success }}>Thanks for your review!</Text>
            {comment ? <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.textSoft }}>“{comment}”</Text> : null}
            <Pressable accessibilityRole="button" onPress={() => setEditing(true)}>
              <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>Change</Text>
            </Pressable>
          </>
        ) : (
          <>
            <StarPicker value={rating} onChange={setRating} label={`Your stars for ${name}`} />
            <TextInput
              accessibilityLabel={`Your review of ${name}`}
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={1000}
              placeholder="What did you like or not like? (optional)"
              placeholderTextColor={colors.muted}
              style={inputStyle}
            />
            {error && <Notice>{error}</Notice>}
            <Button title={saved ? "Save changes" : "Post review"} onPress={save} busy={busy} />
          </>
        )}
      </View>
    </View>
  );
}

const REASONS = Object.keys(DISPUTE_REASON_LABEL) as DisputeReason[];

export function ReportProblem({ order, onReported }: { order: Order; onReported: (o: Order) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  if (!order.disputeUntil || new Date(order.disputeUntil) < new Date()) return null;

  async function submit() {
    if (!reason) return setFields({ reason: "Choose what went wrong" });
    setBusy(true);
    setError(null);
    setFields({});
    try {
      onReported((await api.orders.reportProblem(order.id, { reason, description, photos })).order);
    } catch (err) {
      const fe = err instanceof ApiError && err.fields ? err.fields : {};
      setFields(fe);
      if (!Object.keys(fe).length) setError(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ paddingVertical: 6, gap: 2 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.danger }}>Something wrong? Report a problem</Text>
        <Text style={{ fontFamily: font.regular, fontSize: 12, color: colors.muted }}>Up to {DISPUTE_DAYS} days after delivery.</Text>
      </Pressable>
    );
  }

  return (
    <Card style={{ gap: 12, borderWidth: 2, borderColor: colors.dangerTint }}>
      <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink }}>Report a problem</Text>
      <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>YanaBuy hears from you and the shop, then decides. Refunds are sent by mobile money.</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="What went wrong?">
        {REASONS.map((r) => {
          const on = reason === r;
          return (
            <Pressable
              key={r}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                setReason(r);
                setFields(({ reason: _gone, ...rest }) => rest);
              }}
              style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: on ? colors.purple : "#fff", borderWidth: on ? 0 : 1, borderColor: colors.lineStrong }}
            >
              <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? "#fff" : colors.textSoft }}>{DISPUTE_REASON_LABEL[r]}</Text>
            </Pressable>
          );
        })}
      </View>
      {fields.reason && <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{fields.reason}</Text>}
      <Field
        label="Tell us what happened"
        value={description}
        onChangeText={(v) => {
          setDescription(v);
          setFields(({ description: _gone, ...rest }) => rest);
        }}
        error={fields.description}
        multiline
        maxLength={1000}
        style={{ height: 96, paddingTop: 12, textAlignVertical: "top" }}
      />
      <PhotoPicker images={photos} onChange={setPhotos} label="Photos (optional)" />
      {error && <Notice>{error}</Notice>}
      <Button title="Send report" variant="danger" onPress={submit} busy={busy} />
      <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
    </Card>
  );
}
