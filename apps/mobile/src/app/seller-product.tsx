import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { ApiError, collectOptions, draftFrom, parseLD, type Category, type MyProduct, type OptionsDraft, type ProductInput } from "@yanabuy/shared";
import { OptionsEditor } from "@/components/OptionsEditor";
import { askPhotoSource, pickPhoto, uploadPublic } from "@/components/AvatarPicker";
import { BackBar } from "@/components/Products";
import { Button, Card, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

const toInput = (cents: number | null | undefined) => (cents ? String(cents / 100) : "");
const MAX_PHOTOS = 8;

/** Add or edit a product. With ?id= it edits that one. */
export default function SellerProduct() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [product, setProduct] = useState<MyProduct | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [food, setFood] = useState(false);
  const [ready, setReady] = useState(!id);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", categoryId: "", price: "", compareAtPrice: "", stock: "", deliveryDays: "" });
  const [fromChina, setFromChina] = useState(false);
  const [bookable, setBookable] = useState(false);
  const [duration, setDuration] = useState(60);
  const [opts, setOpts] = useState<OptionsDraft>({ options: [], rows: {} });
  const usesOptions = opts.options.some((o) => o.name.trim() || o.values.trim());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.shop.mine().then((res) => {
      const kind = res.shop?.kind === "restaurant" ? "food" : "goods";
      setFood(kind === "food");
      api.public.categories(kind).then((c) => setCategories(c.items)).catch(() => {});
    });
    if (id) {
      api.shop
        .product(id)
        .then(({ product: p }) => {
          setProduct(p);
          setImages(p.images);
          setForm({
            name: p.name,
            description: p.description ?? "",
            categoryId: p.category?.id ?? "",
            price: toInput(p.price),
            compareAtPrice: toInput(p.compareAtPrice),
            stock: p.stock === null ? "" : String(p.stock),
            deliveryDays: p.deliveryDays ? String(p.deliveryDays) : "",
          });
          setFromChina(p.shipsFromChina);
          setBookable(!!p.bookable);
          setDuration(p.durationMinutes ?? 60);
          setOpts(draftFrom(p));
          setReady(true);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load it"));
    }
  }, [id]);

  const noun = food ? "dish" : "product";

  const addPhoto = () =>
    askPhotoSource(
      async (source) => {
        try {
          const asset = await pickPhoto(source, { aspect: [1, 1] });
          if (!asset) return;
          setUploading(true);
          const url = await uploadPublic(asset);
          if (url) setImages((prev) => [...prev, url].slice(0, MAX_PHOTOS));
          setFields(({ images: _gone, ...rest }) => rest);
        } catch (err) {
          Alert.alert("Couldn't upload the photo", err instanceof Error ? err.message : "Please try again.");
        } finally {
          setUploading(false);
        }
      },
      undefined,
      "Add a photo"
    );

  async function save() {
    const f: Record<string, string> = {};
    const price = parseLD(form.price);
    const compare = form.compareAtPrice.trim() ? parseLD(form.compareAtPrice) : null;
    const stock = form.stock.trim() === "" ? null : Number(form.stock);
    if (!images.length) f.images = "Add at least one photo";
    if (form.name.trim().length < 2) f.name = `Enter the ${noun}'s name`;
    if (!form.categoryId) f.categoryId = "Choose a category";
    const collected = collectOptions(opts);
    if (collected.error) f.options = collected.error;
    if (!usesOptions) {
      if (!price) f.price = "Enter the price in dollars, e.g. 24.99";
      if (form.compareAtPrice.trim() && !compare) f.compareAtPrice = "Enter a number, or leave it empty";
      if (price && compare && compare <= price) f.compareAtPrice = "The old price must be higher than the price";
      if (stock !== null && (!Number.isInteger(stock) || stock < 0)) f.stock = "Enter a whole number, or leave it empty";
    }
    const days = form.deliveryDays.trim() === "" ? null : Number(form.deliveryDays);
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 120)) f.deliveryDays = "Enter 1 to 120 days, or leave it empty";
    setFields(f);
    if (Object.keys(f).length) return setError("Please fix the fields marked in red.");

    const input: ProductInput = {
      name: form.name,
      description: form.description || null,
      categoryId: form.categoryId,
      ...(usesOptions ? {} : { price: price!, compareAtPrice: compare, stock }),
      ...collected.value,
      images,
      shipsFromChina: fromChina,
      deliveryDays: days,
      ...(food ? {} : { bookable, durationMinutes: bookable ? duration : null }),
    };
    setBusy(true);
    setError(null);
    try {
      if (product) await api.shop.updateProduct(product.id, input);
      else await api.shop.createProduct(input);
      router.back();
    } catch (err) {
      const fe = err instanceof ApiError && err.fields ? err.fields : {};
      setFields(fe);
      setError(Object.keys(fe).length ? "Please fix the fields marked in red." : err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + 8 }}>
        <BackBar title={product ? `Edit ${noun}` : `New ${noun}`} onBack={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        {!ready ? (
          <Text style={{ fontFamily: font.regular, color: colors.muted }}>{error ?? "Loading…"}</Text>
        ) : (
          <Card style={{ gap: 14 }}>
            {product?.status === "rejected" && product.statusReason && <Notice tone="info">{`YanaBuy asked you to fix: ${product.statusReason}`}</Notice>}

            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>Photos</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {images.map((src, i) => (
                  <View key={src + i} style={{ width: 88, height: 88, borderRadius: 14, overflow: "hidden", borderWidth: i === 0 ? 2 : 1, borderColor: i === 0 ? colors.purple : colors.line }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={i === 0 ? "Main photo" : `Make photo ${i + 1} the main photo`}
                      onPress={() => setImages((prev) => [prev[i], ...prev.filter((_, j) => j !== i)])}
                      style={{ flex: 1 }}
                    >
                      <Image source={{ uri: src }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                    </Pressable>
                    {i === 0 && (
                      <View style={{ position: "absolute", left: 4, bottom: 4, backgroundColor: colors.purple, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
                        <Text style={{ fontFamily: font.bold, fontSize: 10, color: "#fff" }}>Main</Text>
                      </View>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove photo ${i + 1}`}
                      onPress={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                      hitSlop={6}
                      style={{ position: "absolute", right: 4, top: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(46,20,64,0.75)", alignItems: "center", justifyContent: "center" }}
                    >
                      <Text style={{ color: "#fff", fontFamily: font.bold, fontSize: 12 }}>✕</Text>
                    </Pressable>
                  </View>
                ))}
                {images.length < MAX_PHOTOS && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add a photo"
                    onPress={addPhoto}
                    disabled={uploading}
                    style={{ width: 88, height: 88, borderRadius: 14, borderWidth: 2, borderStyle: "dashed", borderColor: fields.images ? colors.danger : colors.lineStrong, alignItems: "center", justifyContent: "center", backgroundColor: "#FBF9FC" }}
                  >
                    {uploading ? (
                      <ActivityIndicator color={colors.purple} />
                    ) : (
                      <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple, textAlign: "center" }}>+{"\n"}Add photo</Text>
                    )}
                  </Pressable>
                )}
              </View>
              {fields.images ? (
                <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{fields.images}</Text>
              ) : (
                <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>Up to 8. Tap a photo to make it the main one.</Text>
              )}
            </View>

            <Field label="Name" value={form.name} onChangeText={set("name")} error={fields.name} maxLength={80} placeholder={food ? "e.g. Jollof rice with chicken" : "e.g. Men's leather shoes"} />

            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>Category</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {categories.map((c) => {
                  const on = form.categoryId === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => setForm((f) => ({ ...f, categoryId: c.id }))}
                      style={{ height: 36, paddingHorizontal: 13, borderRadius: 999, justifyContent: "center", backgroundColor: on ? colors.purple : "#fff", borderWidth: 1, borderColor: on ? colors.purple : fields.categoryId ? colors.danger : colors.lineStrong }}
                    >
                      <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? "#fff" : colors.textSoft }}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {fields.categoryId && <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{fields.categoryId}</Text>}
            </View>

            <OptionsEditor value={opts} onChange={setOpts} error={fields.options ?? fields.variants} />
            {!usesOptions && (
              <>
                <Field label="Price ($)" value={form.price} onChangeText={set("price")} error={fields.price} keyboardType="decimal-pad" placeholder="24.99" />
                <Field label="Old price (optional)" value={form.compareAtPrice} onChangeText={set("compareAtPrice")} error={fields.compareAtPrice} keyboardType="decimal-pad" hint="Shown crossed out, for a deal." />
              </>
            )}
            {!food && (
              <View style={{ gap: 10, backgroundColor: colors.ground, borderRadius: 14, padding: 12 }}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: bookable }} onPress={() => setBookable((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: bookable ? colors.purple : colors.lineStrong, backgroundColor: bookable ? colors.purple : "#fff", alignItems: "center", justifyContent: "center" }}>
                    {bookable && <Text style={{ color: "#fff", fontSize: 13, fontFamily: font.bold }}>✓</Text>}
                  </View>
                  <Text style={{ flex: 1, fontFamily: font.semibold, fontSize: 14, color: colors.ink }}>📅 This is a service people book a time for</Text>
                </Pressable>
                {bookable && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {[15, 30, 45, 60, 90, 120, 180].map((m) => {
                      const on = duration === m;
                      return (
                        <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setDuration(m)} style={{ height: 34, paddingHorizontal: 12, borderRadius: 999, justifyContent: "center", backgroundColor: on ? colors.purple : "#fff", borderWidth: 1, borderColor: on ? colors.purple : colors.lineStrong }}>
                          <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? "#fff" : colors.textSoft }}>{m < 60 ? `${m} min` : `${m / 60} h`}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
            {!food && (
              <View style={{ gap: 10, backgroundColor: colors.ground, borderRadius: 14, padding: 12 }}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: fromChina }}
                  onPress={() => setFromChina((v) => !v)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: fromChina ? colors.purple : colors.lineStrong, backgroundColor: fromChina ? colors.purple : "#fff", alignItems: "center", justifyContent: "center" }}>
                    {fromChina && <Text style={{ color: "#fff", fontSize: 13, fontFamily: font.bold }}>✓</Text>}
                  </View>
                  <Text style={{ flex: 1, fontFamily: font.semibold, fontSize: 14, color: colors.ink }}>🇨🇳 Ships from China (you order it for the buyer)</Text>
                </Pressable>
                <Field
                  label="Delivery time in days (optional)"
                  value={form.deliveryDays}
                  onChangeText={set("deliveryDays")}
                  error={fields.deliveryDays}
                  keyboardType="number-pad"
                  hint={fromChina ? "How long until it reaches the buyer, e.g. 21." : "Only if it takes longer than a day or two."}
                />
              </View>
            )}
            {!usesOptions && <Field label="How many do you have? (optional)" value={form.stock} onChangeText={set("stock")} error={fields.stock} keyboardType="number-pad" hint="Leave empty if you don't count. At 0 it shows as sold out." />}
            <Field label="Description (optional)" value={form.description} onChangeText={set("description")} multiline maxLength={2000} style={{ height: 100, paddingTop: 12, textAlignVertical: "top" }} />

            {error && <Notice>{error}</Notice>}
            <Button title={product ? "Save changes" : `Add ${noun}`} onPress={save} busy={busy} />
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
