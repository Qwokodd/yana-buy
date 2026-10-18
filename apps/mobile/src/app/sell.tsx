import { useCallback, useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Image } from "expo-image";
import {
  ApiError,
  CITIES,
  COUNTRIES,
  countryName,
  type Country,
  type Category,
  formatLiberianPhone,
  ID_TYPE_LABEL,
  SHOP_KIND_LABEL,
  type IdDocumentType,
  type MyShop,
  type PrivateUpload,
  type ShopKind,
} from "@yanabuy/shared";
import { BackIcon } from "@/components/Icons";
import { PrivatePhotoSlot, PublicPhotoSlot } from "@/components/PhotoSlot";
import { Button, Card, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCountry } from "@/lib/country";
import { useBranding } from "@/lib/branding";
import { colors, font } from "@/lib/theme";

/** Open a shop or restaurant: apply, see the review result, edit an approved shop. */
export default function Sell() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, loading, reload } = useAuth();
  const { appName } = useBranding();
  const [shop, setShop] = useState<MyShop | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    api.shop
      .mine()
      .then((res) => {
        setShop(res.shop);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your shop"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Check again every time the screen opens — the admin may have reviewed it meanwhile.
  useFocusEffect(load);

  let body: ReactNode;
  if (loading || (user && shop === undefined && !error)) {
    body = <Text style={{ fontFamily: font.regular, color: colors.muted }}>Loading…</Text>;
  } else if (!user) {
    body = <Intro onLogin={() => router.push("/login")} onRegister={() => router.push("/register")} />;
  } else if (error) {
    body = <Notice>{error}</Notice>;
  } else if (user.role === "rider" || user.role === "admin") {
    body = <Notice tone="info">Rider and admin accounts can&apos;t open a shop. Use a separate account with another phone number for selling.</Notice>;
  } else if (!shop || shop.status === "rejected" || (shop.status === "pending" && editing)) {
    body = (
      <>
        {shop?.status === "rejected" && <Notice tone="info">{`Please fix this and send it again: ${shop.statusReason ?? ""}`}</Notice>}
        <ApplicationForm
          initial={shop ?? null}
          defaultPhone={formatLiberianPhone(user.phone)}
          onCancel={shop?.status === "pending" ? () => setEditing(false) : undefined}
          onSent={(s) => {
            setShop(s);
            setEditing(false);
          }}
        />
      </>
    );
  } else if (shop.status === "pending") {
    body = <Waiting shop={shop} onEdit={() => setEditing(true)} />;
  } else if (shop.status === "suspended") {
    body = (
      <StatusCard shop={shop} tone={colors.danger} title="Your shop is suspended">
        {`${shop.statusReason ? `Reason: ${shop.statusReason}. ` : ""}Shoppers can't see it right now. Contact YanaBuy support to sort it out.`}
      </StatusCard>
    );
  } else {
    body = <ApprovedShop shop={shop} onSaved={setShop} onOpen={reload} />;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/profile"))}
          hitSlop={10}
          style={{ padding: 8 }}
        >
          <BackIcon />
        </Pressable>
        <Text style={{ fontFamily: font.display, fontSize: 20, color: colors.ink }}>{shop?.status === "approved" ? "My shop" : `Sell on ${appName}`}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Intro({ onLogin, onRegister }: { onLogin: () => void; onRegister: () => void }) {
  const { appName } = useBranding();
  return (
    <>
      <View style={{ backgroundColor: colors.ink, borderRadius: 22, padding: 20, overflow: "hidden" }}>
        <View style={{ position: "absolute", right: -50, top: -50, width: 170, height: 170, borderRadius: 85, backgroundColor: colors.amber }} />
        <Text style={{ fontFamily: font.display, fontSize: 26, lineHeight: 28, color: "#fff", maxWidth: 240 }}>Open your shop or restaurant</Text>
        <Text style={{ marginTop: 8, fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: "rgba(255,255,255,0.82)", maxWidth: 260 }}>
          {`It's free to apply. We check every seller's ID so ${appName} shoppers can trust you.`}
        </Text>
      </View>
      <Card style={{ gap: 10 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>Log in first</Text>
        <Button title="Create an account" onPress={onRegister} />
        <Button title="I have an account" variant="outline" onPress={onLogin} />
      </Card>
    </>
  );
}

function StatusCard({ shop, tone, title, children, actions }: { shop: MyShop; tone: string; title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <View style={{ height: 6, backgroundColor: tone }} />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {shop.logoUrl ? (
            <Image source={{ uri: shop.logoUrl }} style={{ width: 52, height: 52, borderRadius: 16 }} contentFit="cover" />
          ) : (
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.purpleTint, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: font.display, fontSize: 20, color: colors.purple }}>{shop.name[0]}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink }}>{shop.name}</Text>
            <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>
              {SHOP_KIND_LABEL[shop.kind]} · {shop.city}
            </Text>
          </View>
        </View>
        <Text style={{ fontFamily: font.display, fontSize: 19, color: colors.ink }}>{title}</Text>
        <Text style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: colors.textSoft }}>{children}</Text>
        {actions}
      </View>
    </Card>
  );
}

function Step({ tone, word, text }: { tone: "done" | "now" | "next"; word: string; text: string }) {
  const bg = { done: colors.successTint, now: colors.warnTint, next: "#F1EEF3" }[tone];
  const fg = { done: colors.success, now: colors.warn, next: colors.textSoft }[tone];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
        <Text style={{ fontFamily: font.extrabold, fontSize: 11.5, color: fg }}>{word}</Text>
      </View>
      <Text style={{ flex: 1, fontFamily: font.regular, fontSize: 13.5, color: colors.ink }}>{text}</Text>
    </View>
  );
}

function Waiting({ shop, onEdit }: { shop: MyShop; onEdit: () => void }) {
  const sent = new Date(shop.submittedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <StatusCard
      shop={shop}
      tone={colors.amber}
      title="Thanks — we're checking your details"
      actions={
        <View style={{ gap: 10 }}>
          <Step tone="done" word="Done" text={`Application sent ${sent}`} />
          <Step tone="now" word="Now" text="An admin checks your ID and selfie" />
          <Step tone="next" word="Next" text="Your shop opens and you can add products" />
          <Button title="Change my application" variant="outline" onPress={onEdit} style={{ marginTop: 4 }} />
        </View>
      }
    >
      We usually review new shops within one working day. Open this screen again to see the result.
    </StatusCard>
  );
}

// ─── Application form ──────────────────────────────────────────────────────

const STEP1 = ["kind", "name", "description", "phone", "city", "address", "logoUrl", "categoryId", "hours"];

function Choice({ selected, onPress, children, label }: { selected: boolean; onPress: () => void; children: ReactNode; label: string }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flex: 1,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: selected ? colors.purple : colors.line,
        backgroundColor: selected ? colors.purpleTint : "#fff",
        padding: 12,
        gap: 4,
      }}
    >
      {children}
    </Pressable>
  );
}

function ApplicationForm({
  initial,
  defaultPhone,
  onSent,
  onCancel,
}: {
  initial: MyShop | null;
  defaultPhone: string;
  onSent: (s: MyShop) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [kind, setKind] = useState<ShopKind>(initial?.kind ?? "store");
  const shopping = useCountry().country;
  const [country, setCountry] = useState<Country>(initial?.country ?? shopping);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    phone: initial ? formatLiberianPhone(initial.phone) : defaultPhone,
    city: initial?.city ?? "",
    address: initial?.address ?? "",
    categoryId: initial?.categoryId ?? "",
    hours: initial?.hours ?? "",
  });
  const [logo, setLogo] = useState<string | null>(initial?.logoUrl ?? null);
  const [idType, setIdType] = useState<IdDocumentType>(initial?.documents.idType ?? "national_id");
  const doc = (key?: string | null, url?: string | null): PrivateUpload | null => (key && url ? { key, url } : null);
  const [front, setFront] = useState(doc(initial?.documents.idFrontKey, initial?.documents.idFrontUrl));
  const [back, setBack] = useState(doc(initial?.documents.idBackKey, initial?.documents.idBackUrl));
  const [selfie, setSelfie] = useState(doc(initial?.documents.selfieKey, initial?.documents.selfieUrl));
  const [agreed, setAgreed] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  /** Picking a new photo clears its old error. */
  const clearing =
    <T,>(setter: (v: T) => void, key: string) =>
    (v: T) => {
      setter(v);
      setFields(({ [key]: _gone, ...rest }) => rest);
    };
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function next() {
    const f: Record<string, string> = {};
    if (form.name.trim().length < 2) f.name = "Enter your shop's name";
    if (!form.phone.trim()) f.phone = "Enter a phone number customers can call";
    if (form.city.trim().length < 2) f.city = "Enter the city or town";
    if (form.address.trim().length < 3) f.address = "Enter the street or landmark";
    setFields(f);
    if (Object.keys(f).length === 0) {
      setError(null);
      setStep(2);
    }
  }

  async function send() {
    const f: Record<string, string> = {};
    if (!front) f.idFrontKey = "Add a photo of the front of your ID";
    if (idType !== "passport" && !back) f.idBackKey = "Add a photo of the back of your ID";
    if (!selfie) f.selfieKey = "Add a selfie holding your ID";
    if (!agreed) f.agreed = "Please confirm this is true";
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    setError(null);
    try {
      const { shop } = await api.shop.apply({
        kind,
        country,
        ...form,
        categoryId: form.categoryId || null,
        hours: form.hours || null,
        description: form.description || null,
        logoUrl: logo,
        idType,
        idFrontKey: front!.key,
        idBackKey: idType === "passport" ? null : (back?.key ?? null),
        selfieKey: selfie!.key,
      });
      onSent(shop);
    } catch (err) {
      const fe = err instanceof ApiError && err.fields ? err.fields : {};
      setFields(fe);
      setError(Object.keys(fe).length ? "Please fix the fields marked in red." : err instanceof Error ? err.message : "Couldn't send it");
      if (Object.keys(fe).some((k) => STEP1.includes(k))) setStep(1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 14 }}>
      <Text style={{ fontFamily: font.display, fontSize: 21, color: colors.ink }}>{initial ? "Your application" : "Open your shop or restaurant"}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {["Your shop", "Check it's you"].map((label, i) => {
          const on = step === i + 1;
          return (
            <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: on ? colors.purple : colors.ground }}>
              <Text style={{ fontFamily: font.bold, fontSize: 12.5, color: on ? "#fff" : colors.muted }}>{`${i + 1}  ${label}`}</Text>
            </View>
          );
        })}
      </View>
      {error && <Notice>{error}</Notice>}

      {step === 1 ? (
        <>
          <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>What will you sell?</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Choice selected={kind === "store"} onPress={() => setKind("store")} label="A shop — goods or services">
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.amber }} />
              <Text style={{ fontFamily: font.display, fontSize: 16, color: colors.ink }}>A shop</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>Goods or services</Text>
            </Choice>
            <Choice selected={kind === "restaurant"} onPress={() => setKind("restaurant")} label="A restaurant — food and drinks">
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.orange }} />
              <Text style={{ fontFamily: font.display, fontSize: 16, color: colors.ink }}>A restaurant</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>Food and drinks</Text>
            </Choice>
          </View>
          <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>Which country do you sell in?</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {COUNTRIES.map((c) => {
              const on = country === c.code;
              return (
                <Pressable key={c.code} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setCountry(c.code)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 42, paddingHorizontal: 16, borderRadius: 999, borderWidth: 2, borderColor: on ? colors.purple : colors.lineStrong, backgroundColor: on ? colors.purple : "#fff" }}>
                  <Text style={{ fontSize: 16 }}>{c.flag}</Text>
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: on ? "#fff" : colors.ink }}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted, marginTop: -6 }}>{`Your shop shows to shoppers who pick ${countryName(country)}.${country === "US" ? " Buyers in the USA pay on delivery." : ""}`}</Text>
          <Field label={kind === "restaurant" ? "Restaurant name" : "Shop name"} value={form.name} onChangeText={set("name")} error={fields.name} maxLength={60} />
          <Field label="What do you offer? (optional)" value={form.description} onChangeText={set("description")} error={fields.description} multiline maxLength={500} style={{ height: 90, paddingTop: 12, textAlignVertical: "top" }} />
          <Field label="Phone for customers" value={form.phone} onChangeText={set("phone")} error={fields.phone} keyboardType="phone-pad" />
          <Field label="City or town" value={form.city} onChangeText={set("city")} error={fields.city} placeholder={CITIES[country][0]} />
          <Field label="Street or landmark" value={form.address} onChangeText={set("address")} error={fields.address} hint="Shown on your shop page. Riders use it to pick up orders." maxLength={160} />
          <ShopKindFields kind={kind} categoryId={form.categoryId} hours={form.hours} fields={fields} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
          <View style={{ width: 130 }}>
            <PublicPhotoSlot label="Logo (optional)" value={logo} onChange={setLogo} />
          </View>
          <Button title="Continue" onPress={next} />
          {onCancel && <Button title="Cancel" variant="ghost" onPress={onCancel} />}
        </>
      ) : (
        <>
          <Notice tone="info">To keep shoppers safe, we check the ID of everyone who sells. Only you and the admins can see these photos.</Notice>
          <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>Type of ID</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(Object.keys(ID_TYPE_LABEL) as IdDocumentType[]).map((t) => (
              <Pressable
                key={t}
                accessibilityRole="radio"
                accessibilityState={{ selected: idType === t }}
                onPress={() => setIdType(t)}
                style={{ height: 38, borderRadius: 999, paddingHorizontal: 14, justifyContent: "center", backgroundColor: idType === t ? colors.purple : "#fff", borderWidth: 1, borderColor: idType === t ? colors.purple : colors.lineStrong }}
              >
                <Text style={{ fontFamily: font.bold, fontSize: 13, color: idType === t ? "#fff" : colors.textSoft }}>{ID_TYPE_LABEL[t]}</Text>
              </Pressable>
            ))}
          </View>
          <PrivatePhotoSlot
            label={idType === "passport" ? "Passport photo page" : "Front of your ID"}
            hint="All four corners in the photo, no glare."
            value={front}
            onChange={clearing(setFront, "idFrontKey")}
            error={fields.idFrontKey}
          />
          {idType !== "passport" && <PrivatePhotoSlot label="Back of your ID" value={back} onChange={clearing(setBack, "idBackKey")} error={fields.idBackKey} />}
          <View style={{ width: "62%" }}>
            <PrivatePhotoSlot
              label="Selfie holding your ID"
              hint="Your face and the ID both clear."
              value={selfie}
              onChange={clearing(setSelfie, "selfieKey")}
              shape="portrait"
              front
              error={fields.selfieKey}
            />
          </View>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            onPress={() => {
              setAgreed((a) => !a);
              setFields(({ agreed: _gone, ...rest }) => rest);
            }}
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
          >
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.purple, backgroundColor: agreed ? colors.purple : "#fff", alignItems: "center", justifyContent: "center" }}>
              {agreed && <Text style={{ color: "#fff", fontFamily: font.bold, fontSize: 13 }}>✓</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.ink }}>This is my own ID, and my shop details are true.</Text>
              {fields.agreed && <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{fields.agreed}</Text>}
            </View>
          </Pressable>
          <Button title={initial ? "Send again for review" : "Send for review"} onPress={send} busy={busy} />
          <Button title="Back" variant="outline" onPress={() => setStep(1)} />
        </>
      )}
    </Card>
  );
}

// ─── Approved: shop details ────────────────────────────────────────────────

function ApprovedShop({ shop, onSaved, onOpen }: { shop: MyShop; onSaved: (s: MyShop) => void; onOpen: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: shop.name,
    description: shop.description ?? "",
    phone: formatLiberianPhone(shop.phone),
    city: shop.city,
    address: shop.address,
    categoryId: shop.categoryId ?? "",
    hours: shop.hours ?? "",
  });
  const [logo, setLogo] = useState<string | null>(shop.logoUrl);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Approval made this account a seller — refresh it so the profile shows that.
  useEffect(() => {
    onOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      const res = await api.shop.update({ ...form, categoryId: form.categoryId || null, hours: form.hours || null, description: form.description || null, logoUrl: logo });
      onSaved(res.shop);
      setNotice({ tone: "success", text: "Shop details saved." });
    } catch (err) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : "Couldn't save" });
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StatusCard
        shop={shop}
        tone={colors.success}
        title="Your shop is open"
        actions={
          <View style={{ gap: 8 }}>
            <Button title="Shop orders" variant="accent" onPress={() => router.push("/seller-orders")} />
            <Button title={shop.kind === "restaurant" ? "Profile & gallery" : "Work profile"} variant="accent" onPress={() => router.push("/seller-profile")} />
            <Button title={shop.kind === "restaurant" ? "Table bookings" : "Appointments"} variant="outline" onPress={() => router.push("/seller-bookings")} />
            <Button title="Earnings" variant="outline" onPress={() => router.push("/seller-earnings")} />
            <Button title="Reviews" variant="outline" onPress={() => router.push("/seller-reviews")} />
            <Button title="Messages" variant="outline" onPress={() => router.push("/messages")} />
            <Button title={shop.kind === "restaurant" ? "Manage your menu" : "Manage your products"} onPress={() => router.push("/seller-products")} />
            <Button title="See your shop page" variant="outline" onPress={() => router.push({ pathname: "/shop/[slug]", params: { slug: shop.slug } })} />
          </View>
        }
      >
        {`Add ${shop.kind === "restaurant" ? "dishes" : "products"} with photos and prices, and handle your orders. YanaBuy riders pick up and deliver.`}
      </StatusCard>
      <Card style={{ gap: 14 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Shop details</Text>
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        <View style={{ width: 130 }}>
          <PublicPhotoSlot label="Logo" value={logo} onChange={setLogo} />
        </View>
        <Field label="Name" value={form.name} onChangeText={set("name")} error={fields.name} maxLength={60} />
        <Field label="What do you offer?" value={form.description} onChangeText={set("description")} error={fields.description} multiline maxLength={500} style={{ height: 90, paddingTop: 12, textAlignVertical: "top" }} />
        <Field label="Phone for customers" value={form.phone} onChangeText={set("phone")} error={fields.phone} keyboardType="phone-pad" />
        <Field label="City or town" value={form.city} onChangeText={set("city")} error={fields.city} />
        <Field label="Street or landmark" value={form.address} onChangeText={set("address")} error={fields.address} hint="Shown on your shop page with directions." />
        <ShopKindFields kind={shop.kind} categoryId={form.categoryId} hours={form.hours} fields={fields} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
        <Button title="Save shop details" onPress={save} busy={busy} />
      </Card>
    </>
  );
}

/** What kind of shop it is (for the shop directory) and opening hours. */
function ShopKindFields({
  kind,
  categoryId,
  hours,
  fields,
  onChange,
}: {
  kind: ShopKind;
  categoryId: string;
  hours: string;
  fields: Record<string, string>;
  onChange: (patch: { categoryId?: string; hours?: string }) => void;
}) {
  const [cats, setCats] = useState<Category[]>([]);
  useEffect(() => {
    api.public
      .categories(kind === "restaurant" ? "food" : "goods")
      .then((r) => setCats(r.items))
      .catch(() => {});
  }, [kind]);
  return (
    <>
      <View style={{ gap: 6 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>{kind === "restaurant" ? "What kind of food?" : "What do you mostly sell?"}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {cats.map((c) => {
            const on = categoryId === c.id;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => onChange({ categoryId: c.id })}
                style={{ height: 36, paddingHorizontal: 13, borderRadius: 999, justifyContent: "center", backgroundColor: on ? colors.purple : "#fff", borderWidth: 1, borderColor: on ? colors.purple : fields.categoryId ? colors.danger : colors.lineStrong }}
              >
                <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? "#fff" : colors.textSoft }}>{c.name}</Text>
              </Pressable>
            );
          })}
        </View>
        {fields.categoryId ? <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{fields.categoryId}</Text> : null}
        <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>Where your shop shows in the shop directory.</Text>
      </View>
      <Field label="Opening hours (optional)" value={hours} onChangeText={(v) => onChange({ hours: v })} error={fields.hours} maxLength={120} placeholder="e.g. Mon–Sat 8am–8pm" />
    </>
  );
}
