import { FULFILMENT_LABEL, orderStatusLabel, type Fulfilment, type OrderStatus } from "@yanabuy/shared";
import { Badge } from "@yanabuy/web-kit";

const TONE: Record<OrderStatus, "warn" | "purple" | "success" | "danger"> = {
  awaiting_payment: "warn",
  placed: "warn",
  accepted: "purple",
  ready: "purple",
  picked_up: "purple",
  delivered: "success",
  cancelled: "danger",
};

export function OrderStatusBadge({ status, fulfilment = "delivery" }: { status: OrderStatus; fulfilment?: Fulfilment }) {
  return <Badge tone={TONE[status]}>{orderStatusLabel(status, fulfilment)}</Badge>;
}

/** "Eat in" / "Pickup" chip (nothing for delivery, the usual case). */
export function FulfilmentBadge({ fulfilment }: { fulfilment: Fulfilment }) {
  if (fulfilment === "delivery") return null;
  return <span className="rounded-full bg-orange-tint px-2.5 py-0.5 text-[12px] font-bold text-ink">{FULFILMENT_LABEL[fulfilment]}</span>;
}

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "placed", label: "Placed" },
  { status: "accepted", label: "Shop accepted" },
  { status: "ready", label: "Packed" },
  { status: "picked_up", label: "On the way" },
  { status: "delivered", label: "Delivered" },
];

const VISIT_STEPS = (f: Fulfilment): { status: OrderStatus; label: string }[] => [
  { status: "placed", label: "Placed" },
  { status: "accepted", label: "Preparing" },
  { status: "ready", label: f === "eat_in" ? "Ready to serve" : "Ready to collect" },
  { status: "delivered", label: f === "eat_in" ? "Served" : "Collected" },
];

/** Dots joined by a line, filled up to where the order is now. */
export function OrderProgress({ status, fulfilment = "delivery" }: { status: OrderStatus; fulfilment?: Fulfilment }) {
  const steps = fulfilment === "delivery" ? STEPS : VISIT_STEPS(fulfilment);
  const at = steps.findIndex((s) => s.status === status);
  return (
    <ol className={`grid ${steps.length === 5 ? "grid-cols-5" : "grid-cols-4"} gap-1`} aria-label="Order progress">
      {steps.map((s, i) => {
        const done = at >= i;
        return (
          <li key={s.status} className="flex flex-col items-center gap-1.5 text-center" aria-current={i === at ? "step" : undefined}>
            <span className="relative flex w-full items-center justify-center">
              {i > 0 && <span className={`absolute right-1/2 top-1/2 h-1 w-full -translate-y-1/2 ${at >= i ? "bg-purple" : "bg-line-strong"}`} />}
              <span className={`relative z-10 h-4 w-4 rounded-full border-2 ${done ? "border-purple bg-purple" : "border-line-strong bg-white"}`} />
            </span>
            <span className={`text-[11.5px] font-bold ${done ? "text-ink" : "text-muted"}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export const EVENT_LABEL: Record<string, string> = {
  placed: "Order placed",
  accepted: "The shop accepted your order",
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
