import { cache } from "react";
import { fetchBranding } from "@yanabuy/shared";

/** Branding for this page render (fetched once per request, shared by metadata and layout). */
export const getBranding = cache(() => fetchBranding(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"));
