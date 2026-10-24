"use client";

import { useEffect, useState } from "react";
import { formatLD, SOURCING_STATUS_LABEL, type AuditEntry, type SourcingStatus } from "@yanabuy/shared";
import { Alert, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { whenTime } from "@/lib/labels";

const BRANDING_PART: Record<string, string> = {
  appName: "app name",
  tagline: "tagline",
  logoUrl: "logo",
  faviconUrl: "browser icon",
  colors: "colours",
};

/** "logoUrl, colors" → "logo, colours" */
function brandingParts(changed?: string) {
  if (!changed || changed === "nothing") return "no changes";
  return changed
    .split(",")
    .map((k) => BRANDING_PART[k.trim()] ?? k.trim())
    .join(", ");
}

const fmt = (cents: unknown) => formatLD(Number(cents));

/** Turns an audit entry into a plain sentence. */
function describe(e: AuditEntry) {
  const d = (e.details ?? {}) as Record<string, string>;
  const who = d.name ? `${d.name}` : "an account";
  switch (e.action) {
    case "user.block":
      return `blocked ${who} — “${d.reason}”`;
    case "user.unblock":
      return `unblocked ${who}`;
    case "user.role_change":
      return `changed ${who} from ${d.from} to ${d.to}`;
    case "shop.approve":
      return `approved the shop “${d.name}” (${d.owner})`;
    case "shop.reject":
      return `sent “${d.name}” back — “${d.reason}”`;
    case "shop.suspend":
      return `suspended “${d.name}” — “${d.reason}”`;
    case "shop.reinstate":
      return `reinstated “${d.name}”`;
    case "product.approve":
      return `approved the product “${d.name}” (${d.shop})`;
    case "product.reject":
      return `sent the product “${d.name}” back — “${d.reason}”`;
    case "product.remove":
      return `removed the product “${d.name}” — “${d.reason}”`;
    case "product.restore":
      return `put “${d.name}” back on sale`;
    case "product.feature":
      return `featured “${d.name}” on the home page`;
    case "product.unfeature":
      return `stopped featuring “${d.name}”`;
    case "order.assign":
      return `gave order ${d.number} to ${d.rider}`;
    case "order.unassign":
      return `took order ${d.number} away from ${d.rider ?? "its rider"}`;
    case "order.cancel":
      return `cancelled order ${d.number} — “${d.reason}”`;
    case "settings.delivery":
      return "changed the delivery fees";
    case "payout.paid":
      return `paid ${d.shop} ${fmt(d.amount)} (transaction ${d.reference})`;
    case "payout.reject":
      return `refused a ${fmt(d.amount)} payout to ${d.shop} — “${d.reason}”`;
    case "wallet.adjust":
      return `corrected ${d.shop}'s balance by ${fmt(d.amount)} — “${d.note}”`;
    case "cash.received":
      return `received ${fmt(d.amount)} cash from ${d.rider}`;
    case "rider.approve":
      return `approved ${d.name} as a rider`;
    case "rider.reject":
      return `sent back ${d.name}'s rider application — “${d.reason}”`;
    case "rider.suspend":
      return `suspended rider ${d.name} — “${d.reason}”`;
    case "rider.reinstate":
      return `reinstated rider ${d.name}`;
    case "review.hide":
      return `hid a ${d.rating}★ review — “${d.reason}”`;
    case "review.unhide":
      return `showed a ${d.rating}★ review again`;
    case "chat.view":
      return `read the chat between ${d.buyer} and ${d.shop}`;
    case "chat.note":
      return `wrote as YanaBuy in the chat between ${d.buyer} and ${d.shop}`;
    case "dispute.resolve":
      return `decided dispute ${d.number}: ${
        d.outcome === "no_refund" ? "no refund" : `refund ${fmt(d.refund)}${Number(d.sellerCharge) ? `, ${fmt(d.sellerCharge)} from the seller` : ""}`
      }`;
    case "sourcing.quote":
      return `quoted ${d.number}: ${fmt(d.price)}, about ${d.days} days`;
    case "sourcing.reject":
      return `turned down China request ${d.number} — “${d.reason}”`;
    case "sourcing.status":
      return `marked ${d.number} as ${SOURCING_STATUS_LABEL[d.status as SourcingStatus]?.toLowerCase() ?? d.status}`;
    case "settings.finance":
      return `set commission to ${d.goodsCommission}% (shops), ${d.foodCommission}% (restaurant delivery) and ${d.pickupCommission ?? "–"}% (restaurant pickup)`;
    case "category.create":
      return `added the category “${d.name}” (${d.kind === "food" ? "Food" : "Goods & Services"})`;
    case "category.update":
      return d.from ? `renamed the category “${d.from}” to “${d.name}”` : `edited the category “${d.name}”`;
    case "category.hide":
      return `hid the category “${d.name}”`;
    case "category.show":
      return `showed the category “${d.name}” again`;
    case "category.delete":
      return `deleted the category “${d.name}”`;
    case "category.reorder":
      return "reordered categories";
    case "banner.create":
      return `added the banner “${d.title}”`;
    case "ad.create":
      return `added the ad “${d.title}”`;
    case "banner.update":
      return `edited the banner “${d.title}”`;
    case "banner.on":
      return `switched on “${d.title}”`;
    case "banner.off":
      return `switched off “${d.title}”`;
    case "banner.delete":
      return `deleted the banner “${d.title}”`;
    case "branding.update":
      return `changed the branding (${brandingParts(d.changed)})`;
    default:
      return e.action.replace(/[._]/g, " ");
  }
}

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .auditLog()
      .then((res) => setItems(res.items))
      .catch((err) => setError(messageOf(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminShell title="Audit log" subtitle="Every change an admin makes, newest first.">
      {error && <Alert>{error}</Alert>}
      <div className="overflow-hidden rounded-card border border-line bg-white">
        {items.map((e) => (
          <div key={e.id} className="flex items-baseline gap-4 border-t border-[#F0EAF2] px-5 py-3 text-sm first:border-t-0">
            <span className="w-32 flex-shrink-0 text-xs text-muted">{whenTime(e.createdAt)}</span>
            <span>
              <strong>{e.admin.fullName}</strong> {describe(e)}
            </span>
          </div>
        ))}
        {!loading && items.length === 0 && <p className="px-6 py-12 text-center text-sm text-muted">No admin actions yet.</p>}
        {loading && <p className="px-6 py-12 text-center text-sm text-muted">Loading…</p>}
      </div>
    </AdminShell>
  );
}
