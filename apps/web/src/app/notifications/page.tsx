"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AppNotification } from "@yanabuy/shared";
import { Alert, Button, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { api } from "@/lib/api";

const ICON: Record<string, string> = { order: "📦", chat: "💬", price_drop: "🏷️", booking: "📅", payout: "💵", dispute: "⚠️", shop: "🏬", product: "🛍️", system: "🔔" };

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function NotificationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/notifications");
  }, [loading, user, router]);
  useEffect(() => {
    if (!user) return;
    api.me
      .notifications()
      .then((r) => {
        setItems(r.items);
        setMore(r.items.length === 30);
        // Opening the page counts as seeing them.
        if (r.unread) api.me.markRead().then(() => window.dispatchEvent(new Event("yb:notifications"))).catch(() => {});
      })
      .catch((err) => setError(messageOf(err)));
  }, [user]);

  const loadMore = () => {
    const last = items?.[items.length - 1];
    if (!last) return;
    api.me.notifications(last.createdAt).then((r) => {
      setItems((prev) => [...(prev ?? []), ...r.items]);
      setMore(r.items.length === 30);
    });
  };

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8 sm:px-8">
        <h1 className="font-display text-[28px] font-extrabold">Notifications</h1>
        {error && <Alert>{error}</Alert>}
        {items === null && !error && <p className="text-muted">Loading…</p>}
        {items?.length === 0 && <p className="rounded-card border border-line bg-white px-6 py-12 text-center text-sm text-muted">Nothing yet. Order updates, messages and price drops show up here.</p>}
        <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-white">
          {items?.map((n) => (
            <li key={n.id} className="border-b border-line last:border-b-0">
              <button onClick={() => n.link && router.push(n.link)} className={`flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-ground/60 ${n.read ? "" : "bg-purple-tint/40"}`}>
                <span className="text-xl" aria-hidden="true">
                  {ICON[n.type] ?? "🔔"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{n.title}</span>
                  {n.body && <span className="block text-sm text-soft">{n.body}</span>}
                  <span className="text-xs text-muted">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.read && <span className="mt-2 h-2.5 w-2.5 rounded-full bg-purple" aria-label="New" />}
              </button>
            </li>
          ))}
        </ul>
        {items && more && (
          <Button variant="outline" onClick={loadMore}>
            Show older
          </Button>
        )}
      </main>
    </>
  );
}
