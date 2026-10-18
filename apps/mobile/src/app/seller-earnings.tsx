import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { ApiError, formatLD, formatLiberianPhone, parseLD, PAYOUT_METHOD_LABEL, type PayoutMethod, type Wallet, type WalletEntry } from "@yanabuy/shared";
import { BackBar } from "@/components/Products";
import { Button, Card, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

const ENTRY: Record<WalletEntry["type"], string> = { sale: "Sale", payout: "Payout", payout_returned: "Payout refused — money back", adjustment: "Correction by YanaBuy", refund: "Refund to buyer" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const errText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export default function SellerEarnings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api.shop
      .wallet()
      .then((r) => {
        setWallet(r.wallet);
        setError(null);
      })
      .catch((err) => setError(errText(err, "Couldn't load your earnings")));
  }, []);
  useFocusEffect(load);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 8 }}>
      <BackBar title="Earnings" onBack={() => (router.canGoBack() ? router.back() : router.replace("/sell"))} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 12 }} keyboardShouldPersistTaps="handled">
        {error && <Notice>{error}</Notice>}
        {notice && <Notice tone="success">{notice}</Notice>}
        {wallet && (
          <>
            <Card style={{ backgroundColor: colors.ink, gap: 2 }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>You can take out</Text>
              <Text style={{ fontFamily: font.display, fontSize: 30, color: "#fff" }}>{formatLD(wallet.balance)}</Text>
              {wallet.pendingPayouts > 0 && <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.amber }}>{formatLD(wallet.pendingPayouts)} on its way to you</Text>}
            </Card>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Stat label="Sold this month" value={wallet.salesThisMonth} />
              <Stat label="Earned this month" value={wallet.earnedThisMonth} />
            </View>
            <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>
              You get the item price minus YanaBuy&apos;s {wallet.commission}% commission when an order is delivered.
            </Text>

            <PayoutRequest
              wallet={wallet}
              onDone={(m) => {
                setNotice(m);
                load();
              }}
            />
            <PayoutDetailsForm
              wallet={wallet}
              onSaved={() => {
                setNotice("Mobile money details saved.");
                load();
              }}
            />

            {wallet.payouts.length > 0 && (
              <Card style={{ gap: 8 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Payouts</Text>
                {wallet.payouts.map((p) => {
                  const tone = p.status === "paid" ? colors.success : p.status === "rejected" ? colors.danger : colors.orange;
                  return (
                    <View key={p.id} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, gap: 2 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>
                          {p.number} · {formatLD(p.amount)}
                        </Text>
                        <Text style={{ fontFamily: font.bold, fontSize: 12.5, color: tone }}>{p.status === "paid" ? "Sent" : p.status === "rejected" ? "Refused" : "Waiting"}</Text>
                      </View>
                      <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>
                        {when(p.createdAt)} · {PAYOUT_METHOD_LABEL[p.method]} {formatLiberianPhone(p.accountPhone)}
                      </Text>
                      {p.status === "rejected" && p.reason && <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{p.reason}</Text>}
                      {p.status === "paid" && p.reference && <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>Transaction {p.reference}</Text>}
                    </View>
                  );
                })}
              </Card>
            )}

            <Card style={{ gap: 8 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>History</Text>
              {wallet.entries.length === 0 && <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted }}>Your earnings show up here when orders are delivered.</Text>}
              {wallet.entries.map((e) => (
                <View key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.semibold, fontSize: 13.5, color: colors.ink }}>
                      {ENTRY[e.type]} {e.orderNumber ?? e.payoutNumber ?? ""}
                    </Text>
                    <Text style={{ fontFamily: font.regular, fontSize: 12, color: colors.muted }}>
                      {when(e.createdAt)}
                      {e.note ? ` · ${e.note}` : ""}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: e.amount < 0 ? colors.danger : colors.success }}>
                    {e.amount < 0 ? "−" : "+"}
                    {formatLD(Math.abs(e.amount))}
                  </Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.muted }}>{label}</Text>
      <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ink }}>{formatLD(value)}</Text>
    </Card>
  );
}

function PayoutRequest({ wallet, onDone }: { wallet: Wallet; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooLow = wallet.balance < wallet.minPayout;

  async function submit() {
    const cents = parseLD(amount);
    if (!cents) return setError("Enter an amount in dollars");
    setBusy(true);
    setError(null);
    try {
      const { payout } = await api.shop.requestPayout(cents);
      setAmount("");
      onDone(`Payout ${payout.number} for ${formatLD(payout.amount)} is requested. YanaBuy sends it to your mobile money, usually within 2 working days.`);
    } catch (err) {
      setError(errText(err, "Couldn't request the payout"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 10 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Take out money</Text>
      {!wallet.payoutDetails ? (
        <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted }}>Add your mobile money details below first.</Text>
      ) : tooLow ? (
        <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted }}>You can take out money once you have at least {formatLD(wallet.minPayout)}.</Text>
      ) : (
        <>
          <Field
            label="Amount ($)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder={String(wallet.balance / 100)}
            hint={`Between ${formatLD(wallet.minPayout)} and ${formatLD(wallet.balance)}.`}
          />
          <Pressable accessibilityRole="button" onPress={() => setAmount(String(wallet.balance / 100))}>
            <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>Take out everything ({formatLD(wallet.balance)})</Text>
          </Pressable>
          <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>
            Sent to {PAYOUT_METHOD_LABEL[wallet.payoutDetails.method]} {formatLiberianPhone(wallet.payoutDetails.phone)} ({wallet.payoutDetails.name}).
          </Text>
        </>
      )}
      {error && <Notice>{error}</Notice>}
      <Button title="Request payout" onPress={submit} busy={busy} disabled={!wallet.payoutDetails || tooLow} />
    </Card>
  );
}

function PayoutDetailsForm({ wallet, onSaved }: { wallet: Wallet; onSaved: () => void }) {
  const d = wallet.payoutDetails;
  const [method, setMethod] = useState<PayoutMethod>(d?.method ?? "mtn_momo");
  const [name, setName] = useState(d?.name ?? "");
  const [phone, setPhone] = useState(d ? formatLiberianPhone(d.phone) : "");
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api.shop.savePayoutDetails({ method, name, phone });
      onSaved();
    } catch (err) {
      const fe = err instanceof ApiError && err.fields ? err.fields : {};
      setFields(fe);
      if (!Object.keys(fe).length) setError(errText(err, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 10 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Where should we send it?</Text>
      <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup">
        {(Object.keys(PAYOUT_METHOD_LABEL) as PayoutMethod[]).map((m) => {
          const on = method === m;
          return (
            <Pressable
              key={m}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setMethod(m)}
              style={{ flex: 1, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.purple : "#fff", borderWidth: on ? 0 : 1, borderColor: colors.lineStrong }}
            >
              <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? "#fff" : colors.textSoft }}>{PAYOUT_METHOD_LABEL[m]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field label="Name on the account" value={name} onChangeText={setName} error={fields.name} />
      <Field label="Mobile money number" value={phone} onChangeText={setPhone} error={fields.phone} keyboardType="phone-pad" placeholder="0770 000 000" />
      {error && <Notice>{error}</Notice>}
      <Button title="Save details" variant="outline" onPress={submit} busy={busy} />
    </Card>
  );
}
