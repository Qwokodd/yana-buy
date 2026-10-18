"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Banner } from "@yanabuy/shared";
import { api } from "@/lib/api";

/** Wraps a banner in its link (if it has one) and counts the tap. */
export function BannerLink({ banner, children, className = "" }: { banner: Banner; children: ReactNode; className?: string }) {
  if (!banner.linkUrl) return <div className={className}>{children}</div>;
  const count = () => void api.public.bannerClick(banner.id);
  const label = banner.buttonLabel ? `${banner.title} — ${banner.buttonLabel}` : banner.title;
  if (banner.linkUrl.startsWith("/")) {
    return (
      <Link href={banner.linkUrl} onClick={count} aria-label={label} className={`block ${className}`}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={banner.linkUrl}
      onClick={count}
      target="_blank"
      rel={banner.kind === "ad" ? "noopener noreferrer sponsored" : "noopener noreferrer"}
      aria-label={label}
      className={`block ${className}`}
    >
      {children}
    </a>
  );
}
