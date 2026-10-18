import { BOOKING_STATUS_LABEL, type Booking, type BookingStatus } from "@yanabuy/shared";

export const bookingWhen = (iso: string) =>
  `${new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${iso.slice(11, 16)}`;

const TONE: Record<BookingStatus, string> = {
  requested: "bg-amber-tint text-ink",
  confirmed: "bg-success-tint text-success",
  declined: "bg-danger-tint text-danger",
  cancelled: "bg-ground text-muted",
  completed: "bg-purple-tint text-purple",
  no_show: "bg-ground text-muted",
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${TONE[status]}`}>{BOOKING_STATUS_LABEL[status]}</span>;
}

export const bookingWhat = (b: Booking) => (b.kind === "table" ? `Table for ${b.partySize}` : (b.product?.name ?? "Appointment"));
