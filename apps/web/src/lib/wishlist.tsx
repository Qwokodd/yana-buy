"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@yanabuy/web-kit";
import { api } from "@/lib/api";

interface WishlistValue {
  has: (productId: string) => boolean;
  toggle: (productId: string) => Promise<void>;
  count: number;
}

const Ctx = createContext<WishlistValue>({ has: () => false, toggle: async () => {}, count: 0 });

/** Which products the person saved, kept on the server so it's the same on phone and web. */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return setIds(new Set());
    api.me
      .wishlistIds()
      .then((r) => setIds(new Set(r.ids)))
      .catch(() => {});
  }, [user]);

  const toggle = useCallback(
    async (productId: string) => {
      if (!user) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const saved = ids.has(productId);
      setIds((prev) => {
        const next = new Set(prev);
        if (saved) next.delete(productId);
        else next.add(productId);
        return next;
      });
      try {
        if (saved) await api.me.unsave(productId);
        else await api.me.save(productId);
      } catch {
        // Put it back if the server said no.
        setIds((prev) => {
          const next = new Set(prev);
          if (saved) next.add(productId);
          else next.delete(productId);
          return next;
        });
      }
    },
    [ids, user, router]
  );

  const value = useMemo(() => ({ has: (id: string) => ids.has(id), toggle, count: ids.size }), [ids, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWishlist = () => useContext(Ctx);
