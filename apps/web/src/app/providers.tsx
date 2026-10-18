"use client";

import type { Branding } from "@yanabuy/shared";
import { AuthProvider, BrandingProvider } from "@yanabuy/web-kit";
import { ModeProvider } from "@/lib/mode";
import { CountryProvider } from "@/lib/country";
import { CartProvider } from "@/lib/cart";
import { WishlistProvider } from "@/lib/wishlist";
import { api } from "@/lib/api";
import { EmailGate } from "@/components/EmailGate";

export function Providers({ branding, children }: { branding: Branding; children: React.ReactNode }) {
  return (
    <BrandingProvider initial={branding}>
      <AuthProvider api={api}>
        <EmailGate />
        <ModeProvider>
          <CartProvider>
            <WishlistProvider>
              <CountryProvider>{children}</CountryProvider>
            </WishlistProvider>
          </CartProvider>
        </ModeProvider>
      </AuthProvider>
    </BrandingProvider>
  );
}
