import type { UserRole } from "@yanabuy/shared";

export const ROLE_LABEL: Record<UserRole, string> = { buyer: "Buyer", vendor: "Vendor", rider: "Rider", admin: "Admin" };

export function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function whenTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
