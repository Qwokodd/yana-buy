import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { formatLD, formatLiberianPhone, PAYMENT_METHOD_LABEL, type Payment } from "@yanabuy/shared";
import { Button, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { colors, font } from "@/lib/theme";

/** Waits for the buyer to approve the mobile money prompt on their phone. */
export default function PayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const check = async () => {
      try {
        const { payment: p } = await api.orders.payment(id);
        if (stopped) return;
        setPayment(p);
        setError(null);
        if (p.status === "successful" && !done.current) {
          done.current = true;
          if (p.sourcingId) return router.replace({ pathname: "/china/[id]", params: { id: p.sourcingId } });
          cart.clear();
          if (p.orderIds.length === 1) router.replace({ pathname: "/order/[id]", params: { id: p.orderIds[0], placed: "1" } });
          else router.replace({ pathname: "/orders", params: { placed: String(p.orderIds.length) } });
          return;
        }
        if (p.status !== "pending") return;
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : "Couldn't check the payment");
      }
      timer = setTimeout(check, 3000);
    };
    check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const failed = payment && (payment.status === "failed" || payment.status === "expired");
  const title = { fontFamily: font.display, fontSize: 24, color: colors.ink, textAlign: "center" as const };
  const body = { fontFamily: font.regular, fontSize: 15, color: colors.textSoft, textAlign: "center" as const, lineHeight: 22 };

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 60, paddingHorizontal: 24, alignItems: "center", gap: 14 }}>
      {!payment ? (
        error ? <Notice>{error}</Notice> : <ActivityIndicator color={colors.purple} />
      ) : failed ? (
        <>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.dangerTint, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: font.extrabold, fontSize: 30, color: colors.danger }}>!</Text>
          </View>
          <Text style={title}>{payment.status === "expired" ? "The payment timed out" : "The payment didn't go through"}</Text>
          <Text style={body}>
            {payment.status === "expired" ? "It wasn't approved within 10 minutes, so no money was taken." : "It was declined or cancelled, so no money was taken."}{" "}
            {payment.sourcingId ? "Your China request is still open, so you can try again." : "Your order was cancelled — the items are still in your cart."}
          </Text>
          <Button
            title="Try again"
            onPress={() => (payment.sourcingId ? router.replace({ pathname: "/china/[id]", params: { id: payment.sourcingId } }) : router.replace("/checkout"))}
            style={{ alignSelf: "stretch" }}
          />
          {!payment.sourcingId && <Button title="Back to cart" variant="outline" onPress={() => router.replace("/cart")} style={{ alignSelf: "stretch" }} />}
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.purple} accessibilityLabel="Waiting for payment" />
          <Text style={title}>Check your phone</Text>
          <Text style={body}>
            We sent a payment request for <Text style={{ fontFamily: font.bold, color: colors.ink }}>{formatLD(payment.amount)}</Text> to{" "}
            <Text style={{ fontFamily: font.bold, color: colors.ink }}>{formatLiberianPhone(payment.payerPhone)}</Text> on {PAYMENT_METHOD_LABEL[payment.method]}. Enter your PIN to approve it.
          </Text>
          <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted, textAlign: "center" }}>No prompt? Open your MoMo menu and check for approvals waiting. This screen updates by itself.</Text>
          {error && <Notice>{error}</Notice>}
        </>
      )}
    </View>
  );
}
