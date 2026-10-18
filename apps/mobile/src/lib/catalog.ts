import { useCallback, useEffect, useState } from "react";
import type { Banner, Category } from "@yanabuy/shared";
import { api } from "./api";
import type { Mode } from "./mode";

/** Categories for one side of the app, as the admin set them up. */
export function useCategories(mode: Mode) {
  const [all, setAll] = useState<Category[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setError(false);
    api.public
      .categories()
      .then((res) => setAll(res.items))
      .catch(() => setError(true));
  }, []);
  useEffect(load, [load]);
  return { categories: all?.filter((c) => c.kind === mode) ?? null, error, reload: load };
}

/** Live banners and ads for the phone app on one side. */
export function useBanners(mode: Mode) {
  const [items, setItems] = useState<Banner[] | null>(null);
  const load = useCallback(() => {
    api.public
      .banners({ platform: "app", mode })
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, [mode]);
  useEffect(() => {
    setItems(null);
    load();
  }, [load]);
  return { banners: items, reload: load };
}
