import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { formatLiberianPhone, type Booking, type BookingSettings, type MyShop } from "@yanabuy/shared";
import { BookingStatusPill, bookingWhat, bookingWhen } from "@/components/BookingBits";
import { BackBar } from "@/components/Products";
import { Button, Card, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

type Tab = "requests" | "upcoming" | "past" | "settings";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TAB_LABEL: Record<Tab, string> = { requests: "New", upcoming: "Coming up", past: "Past", settings: "Settings" };

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", borderWidth: on ? 0 : 1, borderColor: colors.lineStrong, backgroundColor: on ? colors.purple : "#fff" }}>
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? "#fff" : colors.textSoft }}>{label}</Text>
    </Pressable>
  );
}

export default function SellerBookings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [shop, setShop] = useState<MyShop | null>(null);
  const [tab, setTab] = useState<Tab>("requests");
  const [items, setItems] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const table = shop?.kind === "restaurant";

  useEffect(() => {
    api.shop
      .mine()
      .then((r) => setShop(r.shop))
      .catch(() => {});
  }, []);
  const load = useCallback(() => {
    if (tab === "settings") return;
    setItems(null);
    api.bookings
      .forShop(tab)
      .then((r) => {
        setItems(r.items);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load bookings"));
  }, [tab]);
  useFocusEffect(load);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title={table ? "Table bookings" : "Appointments"} onBack={() => (router.canGoBack() ? router.back() : router.replace("/sell"))} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 8, paddingBottom: 10 }}>
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <Chip key={t} on={tab === t} label={TAB_LABEL[t]} onPress={() => setTab(t)} />
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 10 }} keyboardShouldPersistTaps="handled">
        {error && <Notice>{error}</Notice>}
        {tab === "settings" ? (
          <SettingsForm table={table} />
        ) : (
          <>
            {items === null && !error && <Text style={{ fontFamily: font.regular, color: colors.muted }}>Loading…</Text>}
            {items?.length === 0 && <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 24 }}>Nothing here.</Text>}
            {items?.map((b) => <Row key={b.id} b={b} onChanged={(u) => setItems((xs) => xs?.map((x) => (x.id === u.id ? u : x)) ?? null)} />)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ b, onChanged }: { b: Booking; onChanged: (b: Booking) => void }) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<"decline" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const past = new Date(b.startsAt).getTime() < Date.now();

  async function run(step: "confirm" | "decline" | "complete" | "no-show" | "cancel", why?: string) {
    setBusy(true);
    setError(null);
    try {
      onChanged((await api.bookings.step(b.id, step, why)).booking);
      setAsking(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink, flex: 1 }}>{bookingWhen(b.startsAt)}</Text>
        <BookingStatusPill status={b.status} />
      </View>
      <Text style={{ fontFamily: font.semibold, fontSize: 14, color: colors.textSoft }}>{`${bookingWhat(b)} · ${b.durationMinutes} min · ${b.number}`}</Text>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`tel:${b.contactPhone}`).catch(() => {})}>
        <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.ink }}>
          {`${b.contactName} · `}
          <Text style={{ color: colors.purple, fontFamily: font.bold }}>{formatLiberianPhone(b.contactPhone)}</Text>
        </Text>
      </Pressable>
      {b.note ? <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>{`“${b.note}”`}</Text> : null}
      {b.statusNote ? <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>{b.statusNote}</Text> : null}
      {error && <Notice>{error}</Notice>}
      {asking ? (
        <View style={{ gap: 8 }}>
          <Field label="Why? (the customer sees this)" value={reason} onChangeText={setReason} multiline style={{ height: 64, paddingTop: 10, textAlignVertical: "top" }} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button title="Back" variant="outline" onPress={() => setAsking(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title={asking === "decline" ? "Decline" : "Cancel booking"} variant="danger" busy={busy} disabled={reason.trim().length < 3} onPress={() => run(asking, reason.trim())} />
            </View>
          </View>
        </View>
      ) : b.status === "requested" ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button title="Confirm" busy={busy} onPress={() => run("confirm")} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Decline" variant="outline" onPress={() => setAsking("decline")} />
          </View>
        </View>
      ) : b.status === "confirmed" ? (
        past ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button title="They came" busy={busy} onPress={() => run("complete")} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="No-show" variant="outline" busy={busy} onPress={() => run("no-show")} />
            </View>
          </View>
        ) : (
          <Button title="Cancel booking" variant="outline" onPress={() => setAsking("cancel")} />
        )
      ) : null}
    </Card>
  );
}

function SettingsForm({ table }: { table: boolean }) {
  const [s, setS] = useState<BookingSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  useEffect(() => {
    api.bookings
      .settings()
      .then((r) => setS(r.settings))
      .catch((err) => setNotice({ tone: "danger", text: err instanceof Error ? err.message : "Couldn't load settings" }));
  }, []);
  if (!s) return notice ? <Notice>{notice.text}</Notice> : null;
  const set = <K extends keyof BookingSettings>(k: K, v: BookingSettings[K]) => setS({ ...s, [k]: v });
  const num = (k: keyof BookingSettings) => ({
    value: String(s[k] ?? ""),
    keyboardType: "number-pad" as const,
    onChangeText: (v: string) => set(k, (Number(v.replace(/\D/g, "")) || 0) as never),
  });

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const saved = (await api.bookings.saveSettings(s!)).settings;
      setS(saved);
      setNotice({ tone: "success", text: saved.enabled ? "Saved — customers can book now." : "Saved. Bookings are switched off." });
    } catch (err) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : "Couldn't save" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink, flex: 1 }}>{table ? "Take table bookings online" : "Take appointments online"}</Text>
        <Switch value={s.enabled} onValueChange={(v) => set("enabled", v)} trackColor={{ true: colors.purple, false: colors.lineStrong }} />
      </View>
      {!table && <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>Mark a product as a bookable service in your products to let people book it.</Text>}
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>Open days</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {DAYS.map((d, i) => {
          const on = s.days.includes(i);
          return <Chip key={d} on={on} label={d} onPress={() => set("days", on ? s.days.filter((x) => x !== i) : [...s.days, i].sort())} />;
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label="Opens (HH:MM)" value={s.opens} onChangeText={(v) => set("opens", v)} maxLength={5} placeholder="09:00" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Closes (HH:MM)" value={s.closes} onChangeText={(v) => set("closes", v)} maxLength={5} placeholder="18:00" />
        </View>
      </View>
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>Times every</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {[15, 30, 45, 60, 90, 120].map((m) => (
          <Chip key={m} on={s.slotMinutes === m} label={`${m} min`} onPress={() => set("slotMinutes", m)} />
        ))}
      </View>
      <Field label={table ? "Tables per time" : "Bookings per time (e.g. staff)"} {...num("perSlot")} />
      {table && <Field label="Biggest group online" {...num("maxPartySize")} />}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label="Hours ahead (min)" {...num("leadHours")} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Days ahead (max)" {...num("daysAhead")} />
        </View>
      </View>
      <Field
        label="Note for customers (optional)"
        value={s.note ?? ""}
        onChangeText={(v) => set("note", v || null)}
        maxLength={300}
        placeholder={table ? "e.g. We hold tables for 15 minutes" : "e.g. Please come 10 minutes early"}
      />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <Button title="Save booking settings" busy={busy} onPress={save} />
    </Card>
  );
}
