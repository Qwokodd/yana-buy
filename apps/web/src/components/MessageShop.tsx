"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { messageOf, useAuth } from "@yanabuy/web-kit";
import { api } from "@/lib/api";

/** Opens the chat with a shop (logging in first if needed). */
export function MessageShopButton({
  shopId,
  productId,
  orderId,
  label = "Message the shop",
  className = "",
}: {
  shopId: string;
  productId?: string;
  orderId?: string;
  label?: string;
  className?: string;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    if (!user) return router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    setBusy(true);
    setError(null);
    try {
      const { conversation } = await api.chats.start({ shopId });
      const params = new URLSearchParams({ c: conversation.id });
      if (productId) params.set("product", productId);
      if (orderId) params.set("order", orderId);
      router.push(`/messages?${params}`);
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className={`inline-flex items-center justify-center gap-2 rounded-full border-2 border-purple px-5 font-bold text-purple hover:bg-purple hover:text-white disabled:opacity-60 ${className || "h-11 text-sm"}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        {busy ? "Opening…" : label}
      </button>
      {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
    </>
  );
}
