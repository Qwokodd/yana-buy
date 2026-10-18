import { ORDER_STATUS_LABEL, type OrderStatus } from "@yanabuy/shared";
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

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "placed", label: "Placed" },
  { status: "accepted", label: "Shop accepted" },
  { status: "ready", label: "Packed" },
  { status: "picked_up", label: "On the way" },
  { status: "delivered", label: "Delivered" },
];

/** Five dots joined by a line, filled up to where the order is now. */
export function OrderProgress({ status }: { status: OrderStatus }) {
  const at = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Order progress">
      {STEPS.map((s, i) => {
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
  dispute_opened: "A problem was reported",
  dispute_response: "The shop answered the problem",
  dispute_resolved: "YanaBuy decided the problem",
};
