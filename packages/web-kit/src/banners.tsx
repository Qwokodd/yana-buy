"use client";

import { useEffect, useState } from "react";
import type { Banner } from "@yanabuy/shared";

type Shown = Pick<Banner, "kind" | "title" | "subtitle" | "imageUrl" | "buttonLabel" | "advertiser"> & { videoUrl?: string | null };

/**
 * The banner's picture, or its 5–10 second video: muted, looping, plays inline.
 * People who ask for less motion just see the cover picture.
 */
export function BannerMedia({ banner, className = "absolute inset-0 h-full w-full object-cover" }: { banner: Shown; className?: string }) {
  const [still, setStill] = useState(false);
  useEffect(() => {
    setStill(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }, []);
  if (banner.videoUrl && !still) {
    return <video src={banner.videoUrl} poster={banner.imageUrl || undefined} autoPlay muted loop playsInline preload="metadata" aria-hidden="true" className={className} />;
  }
  if (!banner.imageUrl) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={banner.imageUrl} alt="" className={className} />;
}

function AdLabel({ banner }: { banner: Shown }) {
  if (banner.kind !== "ad") return null;
  return (
    <span className="self-start rounded-full bg-white/90 px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-ink">
      Ad{banner.advertiser ? ` · ${banner.advertiser}` : ""}
    </span>
  );
}

/** Big banner at the top of the home page. The picture fills it; text sits on a dark fade. */
export function BannerHero({ banner, className = "" }: { banner: Shown; className?: string }) {
  return (
    <div className={`relative flex min-h-[250px] overflow-hidden rounded-sheet bg-ink ${className}`}>
      <BannerMedia banner={banner} />
      <div className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/55 to-transparent" />
      <div className="relative flex max-w-[460px] flex-col justify-center gap-2.5 px-8 py-10 sm:px-12">
        <AdLabel banner={banner} />
        <p className="font-display text-[30px] font-extrabold leading-[1.05] text-white sm:text-[38px]">{banner.title || "Banner title"}</p>
        {banner.subtitle && <p className="text-[15px] text-white/85">{banner.subtitle}</p>}
        {banner.buttonLabel && (
          <span className="mt-2 self-start rounded-full bg-amber px-5 py-2.5 text-sm font-bold text-ink">{banner.buttonLabel}</span>
        )}
      </div>
    </div>
  );
}

/** Smaller promo card, shown in a row under the hero. */
export function BannerStrip({ banner, className = "" }: { banner: Shown; className?: string }) {
  return (
    <div className={`relative flex min-h-[150px] overflow-hidden rounded-card bg-purple ${className}`}>
      <BannerMedia banner={banner} />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/30 to-transparent" />
      <div className="relative mt-auto flex flex-col gap-1 p-5">
        <AdLabel banner={banner} />
        <p className="font-display text-[20px] font-extrabold leading-tight text-white">{banner.title || "Banner title"}</p>
        {banner.subtitle && <p className="text-[13px] text-white/85">{banner.subtitle}</p>}
      </div>
    </div>
  );
}
