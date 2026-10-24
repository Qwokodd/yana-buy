"use client";

import { useEffect, useState } from "react";
import type { Banner } from "@yanabuy/shared";
import { BannerHero } from "@yanabuy/web-kit";
import { BannerLink } from "./BannerLink";

/** The admin's top banners, one at a time. Moves on every 6 seconds unless the shopper is pointing at it. */
export function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;

  useEffect(() => setIndex(0), [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // A video ad gets its full 10 seconds; pictures move on after 6.
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), banners[index]?.videoUrl ? 10000 : 6000);
    return () => clearTimeout(t);
  }, [count, paused, index, banners]);

  const current = banners[Math.min(index, count - 1)];
  if (!current) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured"
    >
      <BannerLink banner={current} className="h-full">
        <BannerHero banner={current} className="h-full" />
      </BannerLink>
      {count > 1 && (
        <div className="absolute bottom-4 left-8 flex items-center gap-1.5 sm:left-12">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show banner ${i + 1} of ${count}`}
              aria-current={i === index ? "true" : undefined}
              className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-amber" : "w-2 bg-white/60 hover:bg-white"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
