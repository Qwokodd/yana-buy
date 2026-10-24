import { createApi } from "@yanabuy/shared";
import { browserDeviceStore, browserTokenStore } from "@yanabuy/web-kit";
import { currentCountry } from "./country";
import { currentFoodHow } from "./mode";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const api = createApi({
  baseUrl: API_URL,
  tokens: browserTokenStore("yanabuy.session"),
  // "Trust this device": skips the login code here for 30 days.
  device: browserDeviceStore("yanabuy.device"),
  country: currentCountry,
  foodHow: currentFoodHow,
});
