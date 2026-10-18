import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { api } from "./api";
import { useAuth } from "./auth";

interface WishlistValue {
  has: (productId: string) => boolean;
  toggle: (productId: string) => Promise<void>;
  count: number;
}

const Ctx = createContext<WishlistValue>({ has: () => false, toggle: async () => {}, count: 0 });

/** Saved products, kept on the server so phone and website match. */
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
        router.push("/login");
        return;
      }
      const saved = ids.has(productId);
      const flip = (add: boolean) =>
        setIds((prev) => {
          const next = new Set(prev);
          if (add) next.add(productId);
          else next.delete(productId);
          return next;
        });
      flip(!saved);
      try {
        if (saved) await api.me.unsave(productId);
        else await api.me.save(productId);
      } catch {
        flip(saved);
      }
    },
    [ids, user, router]
  );

  const value = useMemo(() => ({ has: (id: string) => ids.has(id), toggle, count: ids.size }), [ids, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWishlist = () => useContext(Ctx);
