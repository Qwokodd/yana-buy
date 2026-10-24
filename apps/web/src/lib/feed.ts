"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductCard, ProductQuery } from "@yanabuy/shared";
import { api } from "@/lib/api";
import { useMode } from "@/lib/mode";

/**
 * Products one page at a time, for endless scrolling. Changing the query starts over.
 * `loadNext` is safe to call repeatedly — it ignores calls while a page is loading or when everything is in.
 */
export function useProductFeed(query: Omit<ProductQuery, "page"> | null) {
  // Food prices depend on delivery / pickup / eat in, so a new choice starts the list over too.
  const { foodHow } = useMode();
  const key = query ? JSON.stringify({ ...query, how: foodHow }) : null;
  const [items, setItems] = useState<ProductCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const page = useRef(0);
  const busy = useRef(false);
  const gen = useRef(0);

  const loadNext = useCallback(async () => {
    if (!key || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    const g = gen.current;
    const next = page.current + 1;
    try {
      const { how: _how, ...q } = JSON.parse(key) as ProductQuery & { how?: string };
      const res = await api.public.products({ ...q, page: next });
      if (g !== gen.current) return;
      page.current = next;
      setTotal(res.total);
      setItems((prev) => {
        const seen = new Set((prev ?? []).map((p) => p.id));
        return [...(prev ?? []), ...res.items.filter((p) => !seen.has(p.id))];
      });
      if (!res.items.length || next * res.pageSize >= res.total) setDone(true);
    } catch (err) {
      if (g !== gen.current) return;
      setError(err instanceof Error ? err.message : "Couldn't load more");
      setItems((prev) => prev ?? []);
    } finally {
      if (g === gen.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [key]);

  useEffect(() => {
    gen.current++;
    page.current = 0;
    busy.current = false;
    setItems(null);
    setTotal(0);
    setDone(false);
    setError(null);
    setLoading(false);
    if (key) void loadNext();
  }, [key, loadNext]);

  return { items, total, done, loading, error, loadNext };
}
