import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { ApiError, EMPTY_WORK_PROFILE, isVideoLink, videoInfo, type MyShop, type PortfolioItem, type WorkProfile } from "@yanabuy/shared";
import { askPhotoSource, pickPhoto, uploadPublic } from "@/components/AvatarPicker";
import { BackBar } from "@/components/Products";
import { Button, Card, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong");

/** Type a word, tap Add; tap a word to remove it. */
function Tags({ label, values, onChange, max, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; max: number; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && values.length < max && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v.slice(0, 40)]);
    setDraft("");
  };
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>{label}</Text>
      {values.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {values.map((v) => (
            <Pressable key={v} accessibilityRole="button" accessibilityLabel={`Remove ${v}`} onPress={() => onChange(values.filter((x) => x !== v))} style={{ flexDirection: "row", gap: 4, backgroundColor: colors.purpleTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 13, color: colors.purple }}>{v}</Text>
              <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>×</Text>
            </Pressable>
          ))}
        </View>
      )}
      {values.length < max && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            returnKeyType="done"
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            accessibilityLabel={label}
            style={{ flex: 1, height: 44, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 12, paddingHorizontal: 12, fontFamily: font.regular, fontSize: 14.5, color: colors.ink, backgroundColor: "#fff" }}
          />
          <Pressable accessibilityRole="button" onPress={add} style={{ height: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 2, borderColor: colors.purple, justifyContent: "center" }}>
            <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.purple }}>Add</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function SellerProfile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [shop, setShop] = useState<MyShop | null>(null);
  const [profile, setProfile] = useState<WorkProfile | null>(null);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [editing, setEditing] = useState<PortfolioItem | "new" | null>(null);
  const [video, setVideo] = useState({ url: "", title: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const restaurant = shop?.kind === "restaurant";

  useEffect(() => {
    api.shop
      .mine()
      .then((r) => setShop(r.shop))
      .catch(() => {});
    api.shop
      .workProfile()
      .then((r) => {
        setProfile(r.profile);
        setItems(r.items);
      })
      .catch((err) => setNotice({ tone: "danger", text: errorText(err) }));
  }, []);

  const set = <K extends keyof WorkProfile>(k: K, v: WorkProfile[K]) => setProfile((p) => ({ ...(p ?? EMPTY_WORK_PROFILE), [k]: v }));

  async function save() {
    if (!profile) return;
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      setProfile((await api.shop.saveWorkProfile(profile)).profile);
      setNotice({ tone: "success", text: "Saved — it's on your shop page now." });
    } catch (err) {
      setNotice({ tone: "danger", text: errorText(err) });
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  function addVideo() {
    if (!profile) return;
    const url = video.url.trim();
    if (!isVideoLink(url)) return setFields({ video: "Paste a YouTube, TikTok, Instagram, Facebook or Vimeo link (https://…)" });
    if (profile.videos.some((v) => v.url === url)) return setFields({ video: "That video is already added" });
    set("videos", [...profile.videos, { url, title: video.title.trim() || null }]);
    setVideo({ url: "", title: "" });
    setFields({});
  }

  async function move(id: string, direction: "up" | "down") {
    try {
      setItems((await api.shop.movePortfolio(id, direction)).items);
    } catch (err) {
      setNotice({ tone: "danger", text: errorText(err) });
    }
  }

  function remove(it: PortfolioItem) {
    const go = async () => {
      try {
        await api.shop.deletePortfolio(it.id);
        setItems((xs) => xs.filter((x) => x.id !== it.id));
      } catch (err) {
        setNotice({ tone: "danger", text: errorText(err) });
      }
    };
    if (Platform.OS === "web") {
      if (globalThis.confirm?.(`Remove “${it.title}”?`)) go();
    } else Alert.alert(`Remove “${it.title}”?`, undefined, [{ text: "Keep", style: "cancel" }, { text: "Remove", style: "destructive", onPress: go }]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + 8 }}>
        <BackBar title={restaurant ? "Profile & gallery" : "Work profile"} onBack={() => (router.canGoBack() ? router.back() : router.replace("/sell"))} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted }}>
          {restaurant ? "Tell people about your kitchen and show off your food." : "Show your best work, skills and experience — it's what wins customers."}
        </Text>
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        {shop && <Button title="See it as customers do" variant="outline" onPress={() => router.push({ pathname: "/shop/[slug]", params: { slug: shop.slug } })} />}

        {profile && (
          <Card style={{ gap: 14 }}>
            <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink }}>About you</Text>
            <Field label="Tagline" value={profile.tagline ?? ""} onChangeText={(v) => set("tagline", v || null)} maxLength={80} error={fields.tagline} hint="One line under your name, e.g. “Bridal make-up & gele artist”." />
            <Field label="About" value={profile.about ?? ""} onChangeText={(v) => set("about", v || null)} maxLength={2000} multiline error={fields.about} style={{ height: 120, paddingTop: 12, textAlignVertical: "top" }} />
            <Field
              label="Years of experience"
              value={profile.yearsExperience === null ? "" : String(profile.yearsExperience)}
              onChangeText={(v) => {
                const n = v.replace(/\D/g, "");
                set("yearsExperience", n ? Math.min(80, Number(n)) : null);
              }}
              keyboardType="number-pad"
            />
            <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>Where you work</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(
                [
                  ["home", "🚗 I come to you"],
                  ["shop", restaurant ? "🏠 Eat in / pick up" : "🏠 At my place"],
                ] as const
              ).map(([v, label]) => {
                const on = profile.servesAt.includes(v);
                return (
                  <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => set("servesAt", on ? profile.servesAt.filter((x) => x !== v) : [...profile.servesAt, v])} style={{ height: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", backgroundColor: on ? colors.purple : "#fff", borderWidth: 1, borderColor: on ? colors.purple : colors.lineStrong }}>
                    <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: on ? "#fff" : colors.textSoft }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Tags label={restaurant ? "Specialties" : "Skills & specialties"} values={profile.skills} onChange={(v) => set("skills", v)} max={20} placeholder={restaurant ? "e.g. Palm butter" : "e.g. Braids"} />
            <Tags label="Certifications & training" values={profile.certifications} onChange={(v) => set("certifications", v)} max={10} placeholder="e.g. Certified electrician" />
            <Tags label="Areas you serve" values={profile.serviceAreas} onChange={(v) => set("serviceAreas", v)} max={20} placeholder="e.g. Sinkor" />
            <Tags label="Languages" values={profile.languages} onChange={(v) => set("languages", v)} max={8} placeholder="e.g. Kpelle" />

            <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink, marginTop: 4 }}>Videos</Text>
            <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted, marginTop: -8 }}>Links to your YouTube, TikTok, Instagram or Facebook videos.</Text>
            {profile.videos.map((v) => (
              <View key={v.url} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 10 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 11, color: "#fff", backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, overflow: "hidden" }}>{videoInfo(v.url).label}</Text>
                <Text style={{ flex: 1, fontFamily: font.regular, fontSize: 13.5, color: colors.ink }} numberOfLines={1}>
                  {v.title ?? v.url}
                </Text>
                <Pressable accessibilityRole="button" onPress={() => set("videos", profile.videos.filter((x) => x.url !== v.url))}>
                  <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.danger }}>Remove</Text>
                </Pressable>
              </View>
            ))}
            {profile.videos.length < 12 && (
              <>
                <Field label="Video link" value={video.url} onChangeText={(v) => setVideo({ ...video, url: v })} autoCapitalize="none" keyboardType="url" placeholder="https://youtu.be/…" error={fields.video} />
                <Field label="Title (optional)" value={video.title} onChangeText={(v) => setVideo({ ...video, title: v })} maxLength={80} />
                <Button title="Add video" variant="outline" onPress={addVideo} />
              </>
            )}
            <Button title="Save profile" onPress={save} busy={busy} />
          </Card>
        )}

        {profile && (
          <Card style={{ gap: 12 }}>
            <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink }}>{restaurant ? "Gallery" : "Portfolio — your past work"}</Text>
            <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>Up to 10 photos and/or a video per piece of work. Put your best first.</Text>
            {editing !== null ? (
              <PortfolioForm
                item={editing === "new" ? null : editing}
                onCancel={() => setEditing(null)}
                onSaved={(it) => {
                  setItems((xs) => (editing === "new" ? [it, ...xs] : xs.map((x) => (x.id === it.id ? it : x))));
                  setEditing(null);
                }}
              />
            ) : (
              items.length < 60 && <Button title="+ Add work" onPress={() => setEditing("new")} />
            )}
            {items.length === 0 && editing === null && <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted, textAlign: "center", paddingVertical: 10 }}>Shops with photos of their work get far more bookings.</Text>}
            {items.map((it, i) => {
              const cover = it.images[0] ?? (it.videoUrl ? videoInfo(it.videoUrl).thumbnail : null);
              return (
                <View key={it.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 8 }}>
                  {cover ? <Image source={{ uri: cover }} style={{ width: 56, height: 56, borderRadius: 10 }} contentFit="cover" /> : <View style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: colors.ink }} />}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }} numberOfLines={1}>
                      {it.title}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 14, marginTop: 4 }}>
                      <Pressable accessibilityRole="button" onPress={() => setEditing(it)}>
                        <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>Edit</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={() => remove(it)}>
                        <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.danger }}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={{ gap: 4 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Move up" disabled={i === 0} onPress={() => move(it.id, "up")} style={{ width: 32, height: 28, borderRadius: 8, borderWidth: 1, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center", opacity: i === 0 ? 0.3 : 1 }}>
                      <Text style={{ fontFamily: font.bold }}>↑</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Move down" disabled={i === items.length - 1} onPress={() => move(it.id, "down")} style={{ width: 32, height: 28, borderRadius: 8, borderWidth: 1, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center", opacity: i === items.length - 1 ? 0.3 : 1 }}>
                      <Text style={{ fontFamily: font.bold }}>↓</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PortfolioForm({ item, onSaved, onCancel }: { item: PortfolioItem | null; onSaved: (it: PortfolioItem) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [images, setImages] = useState<string[]>(item?.images ?? []);
  const [videoUrl, setVideoUrl] = useState(item?.videoUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const addPhoto = () =>
    askPhotoSource(
      async (source) => {
        try {
          const asset = await pickPhoto(source, { aspect: [1, 1] });
          if (!asset) return;
          setUploading(true);
          const url = await uploadPublic(asset);
          if (url) setImages((prev) => [...prev, url].slice(0, 10));
        } catch (err) {
          Alert.alert("Couldn't upload the photo", errorText(err));
        } finally {
          setUploading(false);
        }
      },
      undefined,
      "Add a photo"
    );

  async function save() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const input = { title, description: description || null, images, videoUrl: videoUrl.trim() || null };
      onSaved((item ? await api.shop.updatePortfolio(item.id, input) : await api.shop.addPortfolio(input)).item);
    } catch (err) {
      setError(errorText(err));
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 12, borderWidth: 2, borderColor: colors.purpleTint, borderRadius: 16, padding: 12 }}>
      {error && <Notice>{error}</Notice>}
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={80} error={fields.title} hint="e.g. “Kebbeh's wedding”" />
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>Photos (first one is the cover)</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {images.map((src) => (
          <Pressable key={src} accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => setImages((xs) => xs.filter((x) => x !== src))}>
            <Image source={{ uri: src }} style={{ width: 72, height: 72, borderRadius: 12 }} contentFit="cover" />
            <View style={{ position: "absolute", right: 4, top: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontSize: 12, fontFamily: font.bold }}>×</Text>
            </View>
          </Pressable>
        ))}
        {images.length < 10 && (
          <Pressable accessibilityRole="button" onPress={addPhoto} disabled={uploading} style={{ width: 72, height: 72, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: fields.images ? colors.danger : colors.lineStrong, alignItems: "center", justifyContent: "center" }}>
            {uploading ? <ActivityIndicator color={colors.purple} /> : <Text style={{ fontFamily: font.bold, fontSize: 12, color: colors.purple, textAlign: "center" }}>+{"\n"}Photo</Text>}
          </Pressable>
        )}
      </View>
      {fields.images ? <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{fields.images}</Text> : null}
      <Field label="Video link (optional)" value={videoUrl} onChangeText={setVideoUrl} autoCapitalize="none" keyboardType="url" placeholder="https://youtu.be/…" error={fields.videoUrl} />
      <Field label="The story (optional)" value={description} onChangeText={setDescription} maxLength={600} multiline style={{ height: 90, paddingTop: 12, textAlignVertical: "top" }} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" variant="outline" onPress={onCancel} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={item ? "Save" : "Add"} onPress={save} busy={busy} />
        </View>
      </View>
    </View>
  );
}
