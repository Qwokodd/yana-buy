"use client";

import { useCallback, useEffect, useState } from "react";
import { formatLD, formatLiberianPhone, type ShopifyContact, type ShopifyOrder, type ShopifySummary } from "@yanabuy/shared";
import { Alert, Badge, Button, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { Pager, PillTabs, SearchBox } from "@/components/bits";
import { api } from "@/lib/api";
import { whenTime } from "@/lib/labels";

type Tab = "orders" | "contacts";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const phoneText = (p: string | null) => (p ? (p.startsWith("+231") ? formatLiberianPhone(p) : p) : "—");

export default function ShopifyPage() {
  const [tab, setTab] = useState<Tab>("orders");
  const [summary, setSummary] = useState<ShopifySummary | null>(null);
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<{ items: ShopifyOrder[]; total: number; pageSize: number } | null>(null);
  const [contacts, setContacts] = useState<{ items: ShopifyContact[]; total: number; pageSize: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.admin
      .shopifySummary()
      .then((r) => setSummary(r.summary))
      .catch((err) => setError(messageOf(err)));
  }, []);

  const load = useCallback(() => {
    setError(null);
    if (tab === "orders") {
      setOrders(null);
      api.admin
        .shopifyOrders({ q: q || undefined, page })
        .then(setOrders)
        .catch((err) => setError(messageOf(err)));
    } else {
      setContacts(null);
      api.admin
        .shopifyContacts({ q: q || undefined, page })
        .then(setContacts)
        .catch((err) => setError(messageOf(err)));
    }
  }, [tab, q, page]);
  useEffect(load, [load]);

  async function download() {
    setDownloading(true);
    try {
      const csv = await api.admin.shopifyContactsCsv();
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `yanabuy-shopify-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <AdminShell
      title="Old Shopify store"
      subtitle="Orders and customers brought over from Shopify. Read only — these orders never count towards seller balances or payouts."
      actions={
        <Button variant="outline" busy={downloading} onClick={download}>
          Download contact list (CSV)
        </Button>
      }
    >
      {summary && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Past orders" value={summary.orders} hint={summary.firstOrderAt ? `${day(summary.firstOrderAt)} – ${day(summary.lastOrderAt!)}` : "Not imported yet"} />
          <Stat label="Contacts" value={summary.contacts} hint={`${summary.contactsWithAccount.toLocaleString("en-US")} have a YanaBuy account`} />
          <Stat label="Customers not signed up yet" value={summary.unclaimedAccounts} hint="They sign up with the same number to take over their account" />
          <Stat label="Shops to hand over" value={summary.shopsToHandOver} hint={`of ${summary.importedShops} imported · ${summary.importedProducts.toLocaleString("en-US")} products`} />
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PillTabs
          label="Show"
          tabs={[
            { value: "orders", label: "Past orders" },
            { value: "contacts", label: "Contact list" },
          ]}
          value={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
            setQ("");
            setQuery("");
          }}
        />
        <SearchBox
          value={query}
          onChange={setQuery}
          onSubmit={() => {
            setQ(query.trim());
            setPage(1);
          }}
          placeholder={tab === "orders" ? "Order #, name, phone, email or shop" : "Name, phone, email or city"}
          label={tab === "orders" ? "Search past orders" : "Search contacts"}
        />
      </div>
      {error && <Alert>{error}</Alert>}

      {tab === "orders" ? (
        <section className="overflow-hidden rounded-[20px] border border-line bg-white" aria-label="Past Shopify orders">
          {!orders && <p className="p-6 text-sm text-muted">Loading…</p>}
          {orders?.items.length === 0 && <p className="px-6 py-12 text-center text-sm text-muted">No orders found.</p>}
          <ul>
            {orders?.items.map((o) => (
              <li key={o.id} className="border-b border-line last:border-b-0">
                <button onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left hover:bg-ground/60">
                  <span className="w-24 font-bold">{o.name}</span>
                  <span className="min-w-[160px] flex-1">
                    <span className="block font-semibold">{o.buyerName ?? "—"}</span>
                    <span className="text-xs text-muted">
                      {phoneText(o.phone)}
                      {o.userId ? " · has account" : ""}
                    </span>
                  </span>
                  <span className="min-w-[140px] flex-1 truncate text-[13px] text-soft">{o.vendors ?? ""}</span>
                  <span className="flex gap-1.5">
                    <Badge tone={o.financialStatus === "paid" ? "success" : o.financialStatus?.includes("refund") || o.financialStatus === "voided" ? "danger" : "neutral"}>{o.financialStatus ?? "—"}</Badge>
                    <Badge tone={o.fulfillmentStatus === "fulfilled" ? "success" : "neutral"}>{o.fulfillmentStatus ?? "—"}</Badge>
                  </span>
                  <span className="w-20 text-right font-bold">{formatLD(o.total)}</span>
                  <span className="w-28 text-right text-xs text-muted">{day(o.placedAt)}</span>
                </button>
                {open === o.id && (
                  <div className="grid gap-4 bg-ground/50 px-5 py-4 text-[13.5px] md:grid-cols-2">
                    <div>
                      <p className="mb-1 font-bold">Items</p>
                      <ul className="flex flex-col gap-1">
                        {o.items.map((i, n) => (
                          <li key={n} className="flex justify-between gap-3">
                            <span>
                              {i.quantity} × {i.name}
                              {i.vendor && <span className="text-muted"> · {i.vendor}</span>}
                            </span>
                            <span>{formatLD(i.price * i.quantity)}</span>
                          </li>
                        ))}
                      </ul>
                      <dl className="mt-2 flex flex-col gap-0.5 border-t border-line pt-2">
                        <Row k="Items" v={formatLD(o.subtotal)} />
                        <Row k={`Delivery${o.shippingMethod ? ` (${o.shippingMethod})` : ""}`} v={formatLD(o.shipping)} />
                        {o.discount > 0 && <Row k={`Discount${o.discountCode ? ` (${o.discountCode})` : ""}`} v={`−${formatLD(o.discount)}`} />}
                        {o.refunded > 0 && <Row k="Refunded" v={formatLD(o.refunded)} />}
                        <Row k="Total" v={formatLD(o.total)} bold />
                      </dl>
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="font-bold">Delivery</p>
                      <p>{o.buyerName ?? "—"}</p>
                      <p>{[o.address, o.city].filter(Boolean).join(", ") || "—"}</p>
                      <p>
                        {phoneText(o.phone)}
                        {o.email ? ` · ${o.email}` : ""}
                      </p>
                      <p className="mt-2 text-muted">Paid by: {o.paymentMethod ?? "—"}</p>
                      {o.cancelledAt && <p className="font-semibold text-danger">Cancelled {whenTime(o.cancelledAt)}</p>}
                      {o.notes && <p className="mt-1 whitespace-pre-line rounded-lg bg-white px-3 py-2">Note: {o.notes}</p>}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {orders && <Pager page={page} pages={Math.ceil(orders.total / orders.pageSize)} onPage={setPage} />}
        </section>
      ) : (
        <section className="overflow-x-auto rounded-[20px] border border-line bg-white" aria-label="Contact list">
          {!contacts && <p className="p-6 text-sm text-muted">Loading…</p>}
          {contacts?.items.length === 0 && <p className="px-6 py-12 text-center text-sm text-muted">No contacts found.</p>}
          {contacts && contacts.items.length > 0 && (
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead className="bg-ground text-left text-[12px] font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Phone</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">City</th>
                  <th className="px-4 py-2.5 text-right">Spent</th>
                  <th className="px-4 py-2.5 text-right">Orders</th>
                  <th className="px-4 py-2.5">Marketing OK</th>
                </tr>
              </thead>
              <tbody>
                {contacts.items.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-4 py-2.5 font-semibold">
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                      {c.hasAccount && (
                        <span className="ml-1.5">
                          <Badge tone="success">account</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{phoneText(c.phone)}</td>
                    <td className="px-4 py-2.5 text-soft">{c.email ?? "—"}</td>
                    <td className="px-4 py-2.5 text-soft">{c.city ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">{formatLD(c.totalSpent)}</td>
                    <td className="px-4 py-2.5 text-right">{c.totalOrders}</td>
                    <td className="px-4 py-2.5 text-soft">{[c.acceptsEmail && "email", c.acceptsSms && "SMS"].filter(Boolean).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {contacts && <Pager page={page} pages={Math.ceil(contacts.total / contacts.pageSize)} onPage={setPage} />}
        </section>
      )}
    </AdminShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-[18px] border border-line bg-white p-4">
      <p className="text-[12.5px] font-bold text-muted">{label}</p>
      <p className="font-display text-[26px] font-extrabold">{value.toLocaleString("en-US")}</p>
      <p className="text-[12px] text-muted">{hint}</p>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-extrabold" : ""}`}>
      <dt className={bold ? "" : "text-muted"}>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
