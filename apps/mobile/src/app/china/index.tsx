import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Image } from "expo-image";
import { ApiError, formatLD, type SourcingRequest } from "@yanabuy/shared";
import { BackBar } from "@/components/Products";
import { SourcingPill } from "@/components/SourcingBits";
import { PhotoPicker } from "@/components/Trust";
import { Button, Card, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, font } from "@/lib/theme";

export default function ChinaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<SourcingRequest[] | null>(null);
  const [form, setForm] = useState({ link: "", description: "", quantity: "1", budget: "" });
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      api.sourcing
        .list()
        .then((r) => setItems(r.items))
        .catch(() => {});
    }, [user])
  );

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFields(({ [k]: _gone, ...rest }) => rest);
  };

  async function submit() {
    if (!user) return router.push("/login");
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const { request } = await api.sourcing.create({
        link: form.link.trim() || null,
        description: form.description,
        quantity: Number(form.quantity) || 0,
        budget: form.budget.trim() || null,
        images,
      });
      router.push({ pathname: "/china/[id]", params: { id: request.id, sent: "1" } });
      setForm({ link: "", description: "", quantity: "1", budget: "" });
      setImages([]);
    } catch (err) {
      const fe = err instanceof ApiError && err.fields ? err.fields : {};
      setFields(fe);
      setError(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + 8 }}>
        <BackBar title="Buy from China" onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: colors.ink, borderRadius: 22, padding: 18, gap: 6 }}>
          <Text style={{ fontSize: 26 }}>🇨🇳 → 🇱🇷</Text>
          <Text style={{ fontFamily: font.display, fontSize: 21, color: "#fff" }}>Buy anything from China</Text>
          <Text style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 19, color: "rgba(255,255,255,0.8)" }}>
            Send a link or a photo. We quote one price — item plus shipping to Liberia — and deliver it to your door.
          </Text>
        </View>

        <Card style={{ gap: 12 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>What do you want?</Text>
          <Field label="Link to the item (optional)" value={form.link} onChangeText={set("link")} error={fields.link} autoCapitalize="none" keyboardType="url" placeholder="https://…" />
          <Field
            label="Describe it"
            value={form.description}
            onChangeText={set("description")}
            error={fields.description}
            multiline
            maxLength={2000}
            placeholder="Item, size, colour, model…"
            style={{ height: 90, paddingTop: 12, textAlignVertical: "top" }}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label="How many?" value={form.quantity} onChangeText={set("quantity")} error={fields.quantity} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1.4 }}>
              <Field label="Budget (optional)" value={form.budget} onChangeText={set("budget")} placeholder="up to $25" />
            </View>
          </View>
          <PhotoPicker images={images} onChange={setImages} label="Photos (optional)" />
          {error && (!Object.keys(fields).length || (fields.link && !form.link)) && <Notice>{error}</Notice>}
          <Button title={user ? "Ask for a price" : "Log in to ask for a price"} onPress={submit} busy={busy} />
        </Card>

        {items && items.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontFamily: font.display, fontSize: 17, color: colors.ink }}>Your requests</Text>
            {items.map((r) => (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityLabel={`Request ${r.number}`}
                onPress={() => router.push({ pathname: "/china/[id]", params: { id: r.id } })}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12 }}
              >
                {r.images[0] ? (
                  <Image source={{ uri: r.images[0] }} style={{ width: 48, height: 48, borderRadius: 10 }} />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.purpleTint, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 20 }}>🇨🇳</Text>
                  </View>
                )}
                <View style={{ flex: 1, gap: 3 }}>
                  <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>
                    {r.number} · {r.description}
                  </Text>
                  <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>
                    {r.quantity} pcs{r.quotePrice ? ` · ${formatLD(r.quotePrice)}` : ""}
                  </Text>
                  <SourcingPill status={r.status} />
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
