import { Text, View } from "react-native";
import { BOOKING_STATUS_LABEL, type Booking, type BookingStatus } from "@yanabuy/shared";
import { colors, font } from "@/lib/theme";

export const bookingWhen = (iso: string) =>
  `${new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${iso.slice(11, 16)}`;
export const bookingWhat = (b: Booking) => (b.kind === "table" ? `Table for ${b.partySize}` : (b.product?.name ?? "Appointment"));

const TONE: Record<BookingStatus, { bg: string; fg: string }> = {
  requested: { bg: "#FFF1D6", fg: colors.ink },
  confirmed: { bg: colors.successTint, fg: colors.success },
  declined: { bg: colors.dangerTint, fg: colors.danger },
  cancelled: { bg: colors.ground, fg: colors.muted },
  completed: { bg: colors.purpleTint, fg: colors.purple },
  no_show: { bg: colors.ground, fg: colors.muted },
};

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  const t = TONE[status];
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: t.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 12, color: t.fg }}>{BOOKING_STATUS_LABEL[status]}</Text>
    </View>
  );
}
