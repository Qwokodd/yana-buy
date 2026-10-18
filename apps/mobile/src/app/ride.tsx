import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ApiError,
  formatLiberianPhone,
  ID_TYPE_LABEL,
  RIDER_NEEDS_LICENSE,
  RIDER_VEHICLE_LABEL,
  type IdDocumentType,
  type MyRiderApplication,
  type PrivateUpload,
  type RiderVehicle,
} from "@yanabuy/shared";
import { BackBar } from "@/components/Products";
import { PrivatePhotoSlot } from "@/components/PhotoSlot";
import { Button, Card, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, font } from "@/lib/theme";

/** Become a YanaBuy rider: apply, then see where the application stands. */
export default function RideScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, reload } = useAuth();
  const [application, setApplication] = useState<MyRiderApplication | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      // The role may have changed since the app opened (approved or suspended).
      reload().catch(() => {});
      api.rider
        .myApplication()
        .then((r) => setApplication(r.application))
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load"));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id])
  );

  let body: React.ReactNode;
  if (!user) {
    body = (
      <Card style={{ gap: 12 }}>
        <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.textSoft, lineHeight: 20 }}>
          Create a YanaBuy account with your phone number, then send your details, ID and a selfie. When we approve you, deliveries show here in the app.
        </Text>
        <Button title="Create an account" onPress={() => router.push("/register")} />
        <Button title="Log in" variant="outline" onPress={() => router.push("/login")} />
      </Card>
    );
  } else if (user.role === "rider") {
    body = (
      <Status tone={colors.success} title="You're a YanaBuy rider">
        <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.textSoft }}>The YanaBuy team assigns orders to you. Find them in My deliveries.</Text>
        <Button title="My deliveries" onPress={() => router.replace("/rider")} style={{ marginTop: 10 }} />
      </Status>
    );
  } else if (user.role !== "buyer") {
    body = <Notice tone="info">Seller and admin accounts can&apos;t deliver. To become a rider, sign up with a separate phone number.</Notice>;
  } else if (application === undefined && !error) {
    body = <Text style={{ fontFamily: font.regular, color: colors.muted }}>Loading…</Text>;
  } else if (application && !editing) {
    body =
      application.status === "pending" ? (
        <Status tone={colors.amber} title="Thanks — we're checking your application">
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.textSoft }}>The YanaBuy team looks at your ID and details, usually within 1–2 working days.</Text>
        </Status>
      ) : application.status === "rejected" ? (
        <Status tone={colors.danger} title="Please fix your application">
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.textSoft }}>{application.statusReason ?? "Something needs changing."}</Text>
          <Button title="Fix and send again" onPress={() => setEditing(true)} style={{ marginTop: 10 }} />
        </Status>
      ) : (
        <Status tone={colors.danger} title="Your rider account is suspended">
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.textSoft }}>{application.statusReason ?? ""} Contact YanaBuy support if you think this is a mistake.</Text>
        </Status>
      );
  } else {
    body = (
      <ApplyForm
        initial={application ?? null}
        onSent={(a) => {
          setApplication(a);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + 8 }}>
        <BackBar title="Deliver with YanaBuy" onBack={() => (router.canGoBack() ? router.back() : router.replace("/profile"))} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: colors.ink, borderRadius: 22, padding: 18, gap: 6 }}>
          <Text style={{ fontSize: 28 }}>🏍️</Text>
          <Text style={{ fontFamily: font.display, fontSize: 21, color: "#fff" }}>Become a rider</Text>
          <Text style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 19, color: "rgba(255,255,255,0.8)" }}>
            Pick up orders from shops and restaurants near you and bring them to customers.
          </Text>
        </View>
        {error && <Notice>{error}</Notice>}
        {body}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Status({ tone, title, children }: { tone: string; title: string; children: React.ReactNode }) {
  return (
    <Card style={{ gap: 6, borderTopWidth: 6, borderTopColor: tone }}>
      <Text style={{ fontFamily: font.display, fontSize: 19, color: colors.ink }}>{title}</Text>
      {children}
    </Card>
  );
}

const VEHICLES = Object.keys(RIDER_VEHICLE_LABEL) as RiderVehicle[];

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={{ height: 38, borderRadius: 999, paddingHorizontal: 14, justifyContent: "center", backgroundColor: on ? colors.purple : "#fff", borderWidth: 1, borderColor: on ? colors.purple : colors.lineStrong }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? "#fff" : colors.textSoft }}>{label}</Text>
    </Pressable>
  );
}

function ApplyForm({ initial, onSent }: { initial: MyRiderApplication | null; onSent: (a: MyRiderApplication) => void }) {
  const doc = (key: string | null | undefined, url: string | null | undefined): PrivateUpload | null => (key && url ? { key, url } : null);
  const [vehicle, setVehicle] = useState<RiderVehicle | null>(initial?.vehicle ?? null);
  const [form, setForm] = useState({
    plateNumber: initial?.plateNumber ?? "",
    city: initial?.city ?? "",
    areas: initial?.areas ?? "",
    emergencyName: initial?.emergencyName ?? "",
    emergencyPhone: initial ? formatLiberianPhone(initial.emergencyPhone) : "",
  });
  const [idType, setIdType] = useState<IdDocumentType>(initial?.documents.idType ?? "national_id");
  const [front, setFront] = useState(doc(initial?.keys.idFrontKey, initial?.documents.idFrontUrl));
  const [back, setBack] = useState(doc(initial?.keys.idBackKey, initial?.documents.idBackUrl));
  const [selfie, setSelfie] = useState(doc(initial?.keys.selfieKey, initial?.documents.selfieUrl));
  const [license, setLicense] = useState(doc(initial?.keys.licenseKey, initial?.documents.licenseUrl));
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const motor = !!vehicle && RIDER_NEEDS_LICENSE.includes(vehicle);
  // Once every marked field is fixed, drop the "please fix" message too.
  useEffect(() => {
    if (!Object.keys(fields).length) setError((e) => (e === "Please fix the fields marked in red." ? null : e));
  }, [fields]);
  const clear = (k: string) => setFields(({ [k]: _gone, ...rest }) => rest);
  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    clear(k);
  };
  const clearing = (setter: (v: PrivateUpload | null) => void, k: string) => (v: PrivateUpload | null) => {
    setter(v);
    clear(k);
  };

  async function submit() {
    const f: Record<string, string> = {};
    if (!vehicle) f.vehicle = "Choose how you'll deliver";
    if (!front) f.idFrontKey = "Add a photo of your ID";
    if (idType !== "passport" && !back) f.idBackKey = "Add a photo of the back of your ID";
    if (!selfie) f.selfieKey = "Add a selfie holding your ID";
    if (motor && !license) f.licenseKey = "Add a photo of your driver's licence";
    if (!agreed) f.agreed = "Please confirm";
    if (Object.keys(f).length) {
      setFields(f);
      setError("Please fix the fields marked in red.");
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const { application } = await api.rider.apply({
        vehicle: vehicle!,
        plateNumber: motor ? form.plateNumber || null : null,
        city: form.city,
        areas: form.areas,
        idType,
        idFrontKey: front!.key,
        idBackKey: idType === "passport" ? null : (back?.key ?? null),
        selfieKey: selfie!.key,
        licenseKey: motor ? (license?.key ?? null) : null,
        emergencyName: form.emergencyName,
        emergencyPhone: form.emergencyPhone,
      });
      onSent(application);
    } catch (err) {
      const fe = err instanceof ApiError && err.fields ? err.fields : {};
      setFields(fe);
      setError(Object.keys(fe).length ? "Please fix the fields marked in red." : err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 14 }}>
      {initial?.status === "rejected" && initial.statusReason && <Notice tone="info">{`What to fix: ${initial.statusReason}`}</Notice>}
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>How will you deliver?</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup">
        {VEHICLES.map((v) => (
          <Chip
            key={v}
            on={vehicle === v}
            label={RIDER_VEHICLE_LABEL[v]}
            onPress={() => {
              setVehicle(v);
              clear("vehicle");
              clear("licenseKey");
              clear("plateNumber");
            }}
          />
        ))}
      </View>
      {fields.vehicle && <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{fields.vehicle}</Text>}
      {motor && <Field label="Plate number" value={form.plateNumber} onChangeText={set("plateNumber")} error={fields.plateNumber} autoCapitalize="characters" placeholder="e.g. MC-4521" maxLength={20} />}
      <Field label="City or town" value={form.city} onChangeText={set("city")} error={fields.city} placeholder="Monrovia" />
      <Field label="Areas you can cover" value={form.areas} onChangeText={set("areas")} error={fields.areas} hint="e.g. Sinkor, Congo Town, Paynesville" maxLength={300} />

      <Notice tone="info">We check the ID of every rider. Your photos are private: only you and YanaBuy admins see them.</Notice>
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>Type of ID</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(Object.keys(ID_TYPE_LABEL) as IdDocumentType[]).map((t) => (
          <Chip key={t} on={idType === t} label={ID_TYPE_LABEL[t]} onPress={() => {
              setIdType(t);
              clear("idBackKey");
            }} />
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
      {motor && (
        <PrivatePhotoSlot label="Driver's licence" hint="The side with your photo and licence number." value={license} onChange={clearing(setLicense, "licenseKey")} error={fields.licenseKey} />
      )}
      <View style={{ width: "62%" }}>
        <PrivatePhotoSlot label="Selfie holding your ID" hint="Your face and the ID both clear." value={selfie} onChange={clearing(setSelfie, "selfieKey")} shape="portrait" front error={fields.selfieKey} />
      </View>
      <Field label="Emergency contact name" value={form.emergencyName} onChangeText={set("emergencyName")} error={fields.emergencyName} placeholder="Someone we can call" />
      <Field label="Emergency contact phone" value={form.emergencyPhone} onChangeText={set("emergencyPhone")} error={fields.emergencyPhone} keyboardType="phone-pad" placeholder="0886 000 000" />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        onPress={() => {
          setAgreed((v) => !v);
          clear("agreed");
        }}
        style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: agreed ? colors.purple : fields.agreed ? colors.danger : colors.lineStrong, backgroundColor: agreed ? colors.purple : "#fff", alignItems: "center", justifyContent: "center" }}>
          {agreed && <Text style={{ color: "#fff", fontSize: 13, fontFamily: font.bold }}>✓</Text>}
        </View>
        <Text style={{ flex: 1, fontFamily: font.regular, fontSize: 13.5, color: colors.ink }}>
          This is my own ID and my details are true. I&apos;ll deliver safely and hand in cash from cash orders.
        </Text>
      </Pressable>
      {error && <Notice>{error}</Notice>}
      <Button title={initial ? "Send again for review" : "Send application"} onPress={submit} busy={busy} />
    </Card>
  );
}
