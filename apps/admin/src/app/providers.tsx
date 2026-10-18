"use client";

import { AuthProvider, BrandingProvider } from "@yanabuy/web-kit";
import type { Branding, User } from "@yanabuy/shared";
import { api } from "@/lib/api";

const onlyAdmins = (u: User) => u.role === "admin";

export function Providers({ branding, children }: { branding: Branding; children: React.ReactNode }) {
  return (
    <BrandingProvider initial={branding}>
      <AuthProvider api={api} allow={onlyAdmins} deniedMessage="This account isn't an admin. Use the website to shop or sell.">
        {children}
      </AuthProvider>
    </BrandingProvider>
  );
}
