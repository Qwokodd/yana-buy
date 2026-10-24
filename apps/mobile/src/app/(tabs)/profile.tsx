import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { formatLiberianPhone, formatPhone, ApiError } from "@yanabuy/shared";
import { AvatarPicker } from "@/components/AvatarPicker";
import { Button, Card, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { workspaceTitle } from "@/lib/workspace";
import { colors, font } from "@/lib/theme";
import { EmailConfirm } from "@/components/EmailConfirm";
import { PhoneConfirm } from "@/components/LoginCode";

const ROLE = { buyer: "Buyer", vendor: "Seller", rider: "Rider", admin: "Admin" } as const;

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, loading, setUser, logout, reload } = useAuth();
  const [form, setForm] = useState({ fullName: "", city: "" });
  const [changingEmail, setChangingEmail] = useState(false);
  const [changingPhone, setChangingPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [unread, setUnread] = useState(0);
  const [alerts, setAlerts] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      // Pick up role changes (e.g. a rider or shop application was approved).
      reload().catch(() => {});
      api.chats
        .unread()
        .then((r) => setUnread(r.count))
        .catch(() => {});
      api.me
        .unread()
        .then((r) => setAlerts(r.unread))
        .catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id])
  );

  useEffect(() => {
    if (user) setForm({ fullName: user.fullName, city: user.city ?? "" });
  }, [user]);

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.ground }} />;

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 18, paddingHorizontal: 18, gap: 16 }}>
        <Text style={{ fontFamily: font.display, fontSize: 26, color: colors.ink }}>Profile</Text>
        <Card style={{ gap: 12 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Log in to YanaBuy</Text>
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted, lineHeight: 20 }}>
            Save your details, track orders and open your own shop.
          </Text>
          <Button title="Log in" onPress={() => router.push("/login")} />
          <Button title="Create an account" variant="outline" onPress={() => router.push("/register")} />
        </Card>
        <Pressable accessibilityRole="button" accessibilityLabel="Become a rider" onPress={() => router.push("/ride")}>
          <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>🏍️ Want to deliver?</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>Become a YanaBuy rider</Text>
            </View>
            <Text style={{ fontFamily: font.bold, fontSize: 20, color: colors.purple }}>›</Text>
          </Card>
        </Pressable>
      </View>
    );
  }

  async function savePhoto(url: string | null) {
    const res = await api.me.update({ avatarUrl: url });
    setUser(res.user);
    setNotice({ tone: "success", text: url ? "Profile photo updated." : "Profile photo removed." });
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      const res = await api.me.update({ fullName: form.fullName, city: form.city || null });
      setUser(res.user);
      setNotice({ tone: "success", text: "Your details are saved." });
    } catch (err) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : "Couldn't save" });
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.ground }} contentContainerStyle={{ paddingTop: insets.top + 18, paddingHorizontal: 18, paddingBottom: 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: font.display, fontSize: 26, color: colors.ink }}>Profile</Text>
          <View style={{ backgroundColor: colors.purpleTint, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
            <Text style={{ fontFamily: font.extrabold, fontSize: 12, color: colors.purple }}>{ROLE[user.role]}</Text>
          </View>
        </View>

        <Card style={{ alignItems: "center", gap: 6, paddingVertical: 22 }}>
          <AvatarPicker name={user.fullName} url={user.avatarUrl} onChange={savePhoto} />
          <Text style={{ marginTop: 6, fontFamily: font.display, fontSize: 20, color: colors.ink }}>{user.fullName}</Text>
          <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted }}>{user.phone ? formatLiberianPhone(user.phone) : user.email}</Text>
        </Card>

        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

        {user.role === "rider" && (
          <Pressable accessibilityRole="button" accessibilityLabel="My deliveries" onPress={() => router.push("/rider")} style={{ backgroundColor: colors.purple, borderRadius: 20, padding: 18 }}>
            <Text style={{ fontFamily: font.display, fontSize: 18, color: "#fff" }}>My deliveries</Text>
            <Text style={{ marginTop: 4, fontFamily: font.regular, fontSize: 13.5, color: "rgba(255,255,255,0.85)" }}>Pickups and drop-offs the YanaBuy team gave you.</Text>
          </Pressable>
        )}

        <Pressable accessibilityRole="button" accessibilityLabel="Your orders" onPress={() => router.push("/orders")}>
          <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Your orders</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>Track deliveries and see what you've bought</Text>
            </View>
            <Text style={{ fontFamily: font.bold, fontSize: 20, color: colors.purple }}>›</Text>
          </Card>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Messages, ${unread} unread` : "Messages"} onPress={() => router.push("/messages")}>
          <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Messages</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>Chats with shops</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {unread > 0 && (
                <View style={{ backgroundColor: colors.amber, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontFamily: font.extrabold, fontSize: 12, color: colors.ink }}>{unread}</Text>
                </View>
              )}
              <Text style={{ fontFamily: font.bold, fontSize: 20, color: colors.purple }}>›</Text>
            </View>
          </Card>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={alerts ? `Notifications, ${alerts} new` : "Notifications"} onPress={() => router.push("/notifications")}>
          <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Notifications</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>Order updates, messages, price drops</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {alerts > 0 && (
                <View style={{ backgroundColor: colors.amber, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontFamily: font.extrabold, fontSize: 12, color: colors.ink }}>{alerts}</Text>
                </View>
              )}
              <Text style={{ fontFamily: font.bold, fontSize: 20, color: colors.purple }}>›</Text>
            </View>
          </Card>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Wishlist" onPress={() => router.push("/wishlist")}>
          <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Wishlist</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>Things you saved</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 20, color: colors.purple }}>›</Text>
            </View>
          </Card>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Bookings" onPress={() => router.push("/bookings")}>
          <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Bookings</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>Tables and appointments</Text>
            </View>
            <Text style={{ fontFamily: font.bold, fontSize: 20, color: colors.purple }}>›</Text>
          </Card>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Buy from China" onPress={() => router.push("/china")}>
          <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>🇨🇳 Buy from China</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>Your China requests and quotes</Text>
            </View>
            <Text style={{ fontFamily: font.bold, fontSize: 20, color: colors.purple }}>›</Text>
          </Card>
        </Pressable>
        {user.role === "buyer" && (
          <Pressable accessibilityRole="button" accessibilityLabel="Become a rider" onPress={() => router.push("/ride")}>
            <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>🏍️ Become a rider</Text>
                <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>Deliver orders with YanaBuy and earn</Text>
              </View>
              <Text style={{ fontFamily: font.bold, fontSize: 20, color: colors.purple }}>›</Text>
            </Card>
          </Pressable>
        )}

        <Card style={{ gap: 14 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Your details</Text>
          <Field label="Full name" value={form.fullName} onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))} error={fields.fullName} autoComplete="name" />
          <Field label="City (optional)" value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} placeholder="Monrovia" />
          <Button title="Save details" onPress={save} busy={busy} />
        </Card>

        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Phone number</Text>
            {user.phone ? (
              <Text style={{ fontFamily: font.bold, fontSize: 12, color: user.phoneVerified ? colors.success : colors.danger }}>{user.phoneVerified ? "Confirmed" : "Not confirmed"}</Text>
            ) : null}
          </View>
          <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>You can log in with this number. We text your login codes and order updates to it.</Text>
          {user.phone && !changingPhone ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 14.5, color: colors.ink, flexShrink: 1 }}>{formatPhone(user.phone)}</Text>
              {user.canVerifyBy?.includes("sms") && (
                <Pressable accessibilityRole="button" onPress={() => setChangingPhone(true)}>
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.purple }}>Change</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <PhoneConfirm
              user={user}
              changing={changingPhone}
              onDone={(u) => {
                setUser(u);
                setChangingPhone(false);
                setNotice({ tone: "success", text: `Phone number confirmed: ${formatPhone(u.phone)}` });
              }}
            />
          )}
        </Card>

        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Email</Text>
            {user.email ? (
              <Text style={{ fontFamily: font.bold, fontSize: 12, color: user.emailVerified ? colors.success : colors.danger }}>{user.emailVerified ? "Confirmed" : "Not confirmed"}</Text>
            ) : null}
          </View>
          <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>You can log in with your email too. We email you about your orders, messages and account.</Text>
          {user.email && user.emailVerified && !changingEmail ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 14.5, color: colors.ink, flexShrink: 1 }}>{user.email}</Text>
              <Pressable accessibilityRole="button" onPress={() => setChangingEmail(true)}>
                <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.purple }}>Change</Text>
              </Pressable>
            </View>
          ) : (
            <EmailConfirm
              user={user}
              changing={changingEmail}
              onDone={(u) => {
                setUser(u);
                setChangingEmail(false);
                setNotice({ tone: "success", text: `Email confirmed: ${u.email}` });
              }}
            />
          )}
        </Card>

        {(user.role === "buyer" || user.role === "vendor") && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={user.role === "vendor" ? workspaceTitle(user) : "Open a shop or restaurant"}
            onPress={() => router.push("/sell")}
            style={{ backgroundColor: colors.ink, borderRadius: 20, padding: 18, overflow: "hidden" }}
          >
            <View style={{ position: "absolute", right: -40, top: -40, width: 130, height: 130, borderRadius: 65, backgroundColor: colors.amber }} />
            <Text style={{ fontFamily: font.display, fontSize: 18, color: "#fff" }}>{user.role === "vendor" ? workspaceTitle(user) : "Have something to sell?"}</Text>
            <Text style={{ marginTop: 4, maxWidth: 240, fontFamily: font.regular, fontSize: 13.5, color: "rgba(255,255,255,0.8)", lineHeight: 19 }}>
              {user.role === "vendor" ? (user.myShop?.kind === "restaurant" ? "Manage your menu, orders and restaurant details." : "Manage your products, orders and shop details.") : "Open a shop or restaurant. It's free — we just check your ID first."}
            </Text>
            <View style={{ marginTop: 12, alignSelf: "flex-start", backgroundColor: colors.amber, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: colors.ink }}>{user.role === "vendor" ? (user.myShop?.kind === "restaurant" ? "Go to my restaurant" : "Go to my shop") : "Start selling"}</Text>
            </View>
          </Pressable>
        )}

        <Pressable accessibilityRole="button" onPress={logout} style={{ paddingVertical: 12 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.danger }}>Log out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
