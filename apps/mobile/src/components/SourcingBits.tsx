import { Text, View } from "react-native";
import { SOURCING_STATUS_LABEL, SOURCING_STEPS, type SourcingStatus } from "@yanabuy/shared";
import { colors, font } from "@/lib/theme";

export function SourcingPill({ status }: { status: SourcingStatus }) {
  const tone =
    status === "delivered" ? [colors.successTint, colors.success] : status === "rejected" ? [colors.dangerTint, colors.danger] : status === "quoted" ? ["#FFF1D6", colors.ink] : [colors.purpleTint, colors.purple];
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: tone[0], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 12, color: tone[1] }}>{SOURCING_STATUS_LABEL[status]}</Text>
    </View>
  );
}

const SHORT: Record<string, string> = { accepted: "Accepted", ordered: "Ordered", shipped: "Shipped", arrived: "In Liberia", delivered: "Delivered" };

export function SourcingProgress({ status }: { status: SourcingStatus }) {
  const at = SOURCING_STEPS.indexOf(status);
  return (
    <View style={{ flexDirection: "row" }} accessible accessibilityLabel={`Progress: ${SOURCING_STATUS_LABEL[status]}`}>
      {SOURCING_STEPS.map((s, i) => (
        <View key={s} style={{ flex: 1, alignItems: "center", gap: 6 }}>
          <View style={{ width: "100%", height: 16, alignItems: "center", justifyContent: "center" }}>
            {i > 0 && <View style={{ position: "absolute", right: "50%", width: "100%", height: 4, backgroundColor: at >= i ? colors.purple : colors.lineStrong }} />}
            <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: at >= i ? colors.purple : colors.lineStrong, backgroundColor: at >= i ? colors.purple : "#fff" }} />
          </View>
          <Text style={{ fontFamily: font.bold, fontSize: 10.5, color: at >= i ? colors.ink : colors.muted }}>{SHORT[s]}</Text>
        </View>
      ))}
    </View>
  );
}

export const SOURCING_EVENT: Record<string, string> = {
  pending: "Request sent",
  quoted: "YanaBuy sent a quote",
  accepted: "Quote accepted",
  ordered: "Ordered from the supplier in China",
  shipped: "Shipped to Liberia",
  arrived: "Arrived in Liberia",
  delivered: "Delivered",
  rejected: "YanaBuy couldn't source it",
  cancelled: "Cancelled",
  payment_failed: "Payment didn't go through",
};
