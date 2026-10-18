import { createApi } from "@yanabuy/shared";
import { browserTokenStore } from "@yanabuy/web-kit";
import { currentCountry } from "./country";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const api = createApi({
  baseUrl: API_URL,
  tokens: browserTokenStore("yanabuy.session"),
  country: currentCountry,
});
