import { createApi } from "@yanabuy/shared";
import { browserTokenStore } from "@yanabuy/web-kit";

export const api = createApi({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  // A different key from the shop website, so the two sessions never mix.
  tokens: browserTokenStore("yanabuy.admin.session"),
  onSessionEnded: () => {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) window.location.href = "/login";
  },
});
