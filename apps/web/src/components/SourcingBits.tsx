import { SOURCING_STATUS_LABEL, SOURCING_STEPS, type SourcingStatus } from "@yanabuy/shared";
import { Badge } from "@yanabuy/web-kit";

const TONE: Record<SourcingStatus, "warn" | "purple" | "success" | "danger" | "neutral"> = {
  pending: "neutral",
  quoted: "warn",
  accepted: "purple",
  ordered: "purple",
  shipped: "purple",
  arrived: "purple",
  delivered: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export function SourcingBadge({ status }: { status: SourcingStatus }) {
  return <Badge tone={TONE[status]}>{SOURCING_STATUS_LABEL[status]}</Badge>;
}

const SHORT: Record<string, string> = { accepted: "Accepted", ordered: "Ordered", shipped: "Shipped", arrived: "In Liberia", delivered: "Delivered" };

/** Accepted → ordered → shipped → arrived → delivered. */
export function SourcingProgress({ status }: { status: SourcingStatus }) {
  const at = SOURCING_STEPS.indexOf(status);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Progress">
      {SOURCING_STEPS.map((s, i) => {
        const done = at >= i;
        return (
          <li key={s} className="flex flex-col items-center gap-1.5 text-center" aria-current={i === at ? "step" : undefined}>
            <span className="relative flex w-full items-center justify-center">
              {i > 0 && <span className={`absolute right-1/2 top-1/2 h-1 w-full -translate-y-1/2 ${at >= i ? "bg-purple" : "bg-line-strong"}`} />}
              <span className={`relative z-10 h-4 w-4 rounded-full border-2 ${done ? "border-purple bg-purple" : "border-line-strong bg-white"}`} />
            </span>
            <span className={`text-[11.5px] font-bold ${done ? "text-ink" : "text-muted"}`}>{SHORT[s]}</span>
          </li>
        );
      })}
    </ol>
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
