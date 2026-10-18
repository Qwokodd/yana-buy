import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { brandingCss } from "@yanabuy/shared";
import "./globals.css";
import { Providers } from "./providers";
import { getBranding } from "@/lib/branding";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-display" });
const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-body" });

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: { default: `${b.appName} — ${b.tagline || "shop, sell and order food"}`, template: `%s · ${b.appName}` },
    description: "Buy from Liberian shops, book services and order food — all in one place.",
    icons: { icon: b.faviconUrl ?? "/favicon.svg" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await getBranding();
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <head>
        {/* Brand colours set by admins (Admin → Branding). */}
        <style dangerouslySetInnerHTML={{ __html: brandingCss(branding) }} />
      </head>
      <body className="min-h-screen bg-ground font-body">
        <Providers branding={branding}>{children}</Providers>
      </body>
    </html>
  );
}
