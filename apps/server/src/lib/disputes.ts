import { disputeNumber, type OrderDispute } from "@yanabuy/shared";
import type { DisputeRow } from "../db/schema";

export function disputeOut(d: DisputeRow): OrderDispute {
  return {
    id: d.id,
    number: disputeNumber(d.number ?? 0),
    status: d.status,
    reason: d.reason,
    description: d.description,
    photos: d.photos,
    sellerResponse: d.sellerResponse,
    sellerRespondedAt: d.sellerRespondedAt?.toISOString() ?? null,
    outcome: d.outcome,
    refundAmount: d.refundAmount,
    sellerCharge: d.sellerCharge,
    refundReference: d.refundReference,
    decisionNote: d.decisionNote,
    resolvedAt: d.resolvedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}

/** Buyers don't see how much the seller was charged. */
export function forBuyer<T extends { dispute: OrderDispute | null }>(order: T): T {
  return order.dispute ? { ...order, dispute: { ...order.dispute, sellerCharge: null } } : order;
}
