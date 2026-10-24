import { Pressable, Text, View } from "react-native";
import { FULFILMENT_LABEL, orderStatusLabel, type Fulfilment, type OrderStatus } from "@yanabuy/shared";
import { colors, font } from "@/lib/theme";

export function StatusPill({ status, fulfilment = "delivery" }: { status: OrderStatus; fulfilment?: Fulfilment }) {
  const tone =
    status === "delivered"
      ? { bg: colors.successTint, fg: colors.success }
      : status === "cancelled"
        ? { bg: colors.dangerTint, fg: colors.danger }
        : status === "placed"
          ? { bg: colors.warnTint, fg: colors.warn }
          : { bg: colors.purpleTint, fg: colors.purple };
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
      <Text style={{ fontFamily: font.extrabold, fontSize: 11.5, color: tone.fg }}>{orderStatusLabel(status, fulfilment)}</Text>
    </View>
  );
}

/** "Eat in" / "Pickup" chip (nothing for delivery, the usual case). */
export function FulfilmentPill({ fulfilment }: { fulfilment: Fulfilment }) {
  if (fulfilment === "delivery") return null;
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: colors.warnTint, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
      <Text style={{ fontFamily: font.extrabold, fontSize: 11.5, color: colors.ink }}>{FULFILMENT_LABEL[fulfilment]}</Text>
    </View>
  );
}

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "placed", label: "Placed" },
  { status: "accepted", label: "Accepted" },
  { status: "ready", label: "Packed" },
  { status: "picked_up", label: "On the way" },
  { status: "delivered", label: "Delivered" },
];

const VISIT_STEPS = (f: Fulfilment): { status: OrderStatus; label: string }[] => [
  { status: "placed", label: "Placed" },
  { status: "accepted", label: "Preparing" },
  { status: "ready", label: f === "eat_in" ? "Ready to serve" : "Ready" },
  { status: "delivered", label: f === "eat_in" ? "Served" : "Collected" },
];

export function Progress({ status, fulfilment = "delivery" }: { status: OrderStatus; fulfilment?: Fulfilment }) {
  const steps = fulfilment === "delivery" ? STEPS : VISIT_STEPS(fulfilment);
  const at = steps.findIndex((s) => s.status === status);
  return (
    <View style={{ flexDirection: "row" }} accessibilityLabel={`Progress: ${orderStatusLabel(status, fulfilment)}`}>
      {steps.map((s, i) => (
        <View key={s.status} style={{ flex: 1, alignItems: "center", gap: 6 }}>
          <View style={{ width: "100%", height: 16, alignItems: "center", justifyContent: "center" }}>
            {i > 0 && <View style={{ position: "absolute", right: "50%", left: "-50%", height: 3, backgroundColor: at >= i ? colors.purple : colors.lineStrong }} />}
            <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: at >= i ? colors.purple : colors.lineStrong, backgroundColor: at >= i ? colors.purple : "#fff" }} />
          </View>
          <Text style={{ fontFamily: font.bold, fontSize: 10.5, color: at >= i ? colors.ink : colors.muted, textAlign: "center" }}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

export const EVENT_LABEL: Record<string, string> = {
  placed: "Order placed",
  accepted: "The shop accepted the order",
  ready: "Packed and ready for the rider",
  picked_up: "The rider picked it up",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rider_assigned: "A rider was assigned",
  rider_removed: "Rider changed",
  rider_offered: "Asked a rider to deliver",
  rider_broadcast: "Riders nearby were told it's ready",
  rider_declined: "A rider said no",
  rider_offer_cancelled: "Rider request cancelled",
  dispute_opened: "A problem was reported",
  dispute_response: "The shop answered the problem",
  dispute_resolved: "YanaBuy decided the problem",
};

/** A small − 3 + control. */
export function Stepper({ value, onChange, max = 99, label }: { value: number; onChange: (v: number) => void; max?: number; label: string }) {
  const btn = (text: string, next: number, disabled: boolean, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={disabled}
      onPress={() => onChange(next)}
      style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: 18, color: colors.purple }}>{text}</Text>
    </Pressable>
  );
  return (
    <View accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 999 }}>
      {btn("−", value - 1, value <= 0, `Fewer ${label}`)}
      <Text style={{ minWidth: 24, textAlign: "center", fontFamily: font.bold, fontSize: 14, color: colors.ink }}>{value}</Text>
      {btn("+", value + 1, value >= max, `More ${label}`)}
    </View>
  );
}
