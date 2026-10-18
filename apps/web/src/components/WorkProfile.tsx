"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatLD, videoInfo, type PortfolioItem, type ProductCard, type PublicShop, type WorkProfile } from "@yanabuy/shared";

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full border border-line-strong bg-white px-3 py-1 text-[13px] font-semibold text-soft">{children}</span>
);

function ChipRow({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((s) => (
          <Chip key={s}>{s}</Chip>
        ))}
      </div>
    </div>
  );
}

/** About, experience, skills, languages and where they work. */
export function AboutWork({ shop, profile }: { shop: PublicShop; profile: WorkProfile }) {
  const facts = [
    profile.yearsExperience ? `${profile.yearsExperience}+ years' experience` : null,
    shop.ratingCount ? `★ ${shop.rating} from ${shop.ratingCount} ${shop.ratingCount === 1 ? "review" : "reviews"}` : null,
    profile.servesAt.includes("home") ? "🚗 Comes to you" : null,
    profile.servesAt.includes("shop") ? "🏠 At our place" : null,
  ].filter(Boolean) as string[];
  return (
    <section aria-label={`About ${shop.name}`} className="flex flex-col gap-4 rounded-card border border-line bg-white p-5">
      {facts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {facts.map((f) => (
            <span key={f} className="rounded-full bg-purple-tint px-3 py-1 text-[13px] font-bold text-purple">
              {f}
            </span>
          ))}
        </div>
      )}
      {(profile.about || shop.description) && <p className="whitespace-pre-line text-[15px] leading-relaxed text-soft">{profile.about || shop.description}</p>}
      <ChipRow label="Skills" items={profile.skills} />
      <ChipRow label="Certifications" items={profile.certifications} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChipRow label="Works in" items={profile.serviceAreas} />
        <ChipRow label="Speaks" items={profile.languages} />
      </div>
    </section>
  );
}

function VideoCard({ url, title }: { url: string; title: string | null }) {
  const v = videoInfo(url);
  if (v.embedUrl)
    return (
      <figure className="overflow-hidden rounded-card border border-line bg-white">
        <div className="aspect-video">
          <iframe src={v.embedUrl} title={title ?? "Video"} className="h-full w-full" loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen />
        </div>
        {title && <figcaption className="px-4 py-2.5 text-sm font-semibold">{title}</figcaption>}
      </figure>
    );
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex aspect-video flex-col items-center justify-center gap-2 rounded-card border border-line bg-ink p-4 text-center text-white hover:opacity-90">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-2xl">▶</span>
      <span className="font-bold">{title ?? `Watch on ${v.label}`}</span>
      <span className="text-[12px] text-white/70">Opens {v.label}</span>
    </a>
  );
}

export function VideosSection({ videos }: { videos: WorkProfile["videos"] }) {
  if (!videos.length) return null;
  return (
    <section aria-labelledby="videos-h" className="flex flex-col gap-3">
      <h2 id="videos-h" className="font-display text-xl font-extrabold">
        Videos
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => (
          <VideoCard key={v.url} url={v.url} title={v.title} />
        ))}
      </div>
    </section>
  );
}

/** Past work as a photo grid; opening one shows all its photos, the story and any video. */
export function PortfolioSection({ slug, count, label = "Our work" }: { slug: string; count: number; label?: string }) {
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [open, setOpen] = useState<PortfolioItem | null>(null);
  const [photo, setPhoto] = useState(0);
  useEffect(() => {
    if (!count) return;
    import("@/lib/api").then(({ api }) =>
      api.public
        .portfolio(slug)
        .then((r) => setItems(r.items))
        .catch(() => setItems([]))
    );
  }, [slug, count]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setPhoto((p) => Math.min(p + 1, open.images.length - 1));
      if (e.key === "ArrowLeft") setPhoto((p) => Math.max(p - 1, 0));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  if (!count) return null;

  return (
    <section aria-labelledby="work-h" className="flex flex-col gap-3">
      <h2 id="work-h" className="font-display text-xl font-extrabold">
        {label} <span className="text-base font-bold text-muted">· {count}</span>
      </h2>
      {items === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: Math.min(count, 4) }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-card bg-line" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((it) => {
            const cover = it.images[0] ?? (it.videoUrl ? videoInfo(it.videoUrl).thumbnail : null);
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  setOpen(it);
                  setPhoto(0);
                }}
                className="group relative aspect-square overflow-hidden rounded-card bg-ink text-left"
              >
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <span className="flex h-full items-center justify-center text-3xl text-white">▶</span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2.5 pt-8 text-[13.5px] font-bold text-white">{it.title}</span>
                {(it.images.length > 1 || it.videoUrl) && (
                  <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11.5px] font-bold text-white">
                    {it.images.length > 1 ? `${it.images.length} photos` : ""}
                    {it.images.length > 1 && it.videoUrl ? " · " : ""}
                    {it.videoUrl ? "▶ video" : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <div role="dialog" aria-modal="true" aria-label={open.title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(null)}>
          <div className="flex max-h-full w-full max-w-3xl flex-col overflow-auto rounded-sheet bg-white" onClick={(e) => e.stopPropagation()}>
            {open.images.length > 0 && (
              <div className="relative bg-ink">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={open.images[photo]} alt={`${open.title} — photo ${photo + 1}`} className="mx-auto max-h-[60vh] w-auto object-contain" />
                {open.images.length > 1 && (
                  <>
                    <button type="button" aria-label="Previous photo" disabled={photo === 0} onClick={() => setPhoto(photo - 1)} className="absolute left-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white/85 font-bold disabled:opacity-30">
                      ‹
                    </button>
                    <button type="button" aria-label="Next photo" disabled={photo === open.images.length - 1} onClick={() => setPhoto(photo + 1)} className="absolute right-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white/85 font-bold disabled:opacity-30">
                      ›
                    </button>
                    <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-0.5 text-[12px] font-bold text-white">
                      {photo + 1} / {open.images.length}
                    </span>
                  </>
                )}
              </div>
            )}
            <div className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-xl font-extrabold">{open.title}</h3>
                <button type="button" onClick={() => setOpen(null)} className="rounded-full border border-line-strong px-3 py-1 text-sm font-bold">
                  Close
                </button>
              </div>
              {open.description && <p className="whitespace-pre-line text-[15px] text-soft">{open.description}</p>}
              {open.videoUrl && <VideoCard url={open.videoUrl} title={null} />}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Their services with prices, each with a Book button. */
export function ServicesMenu({ slug, services }: { slug: string; services: ProductCard[] }) {
  if (!services.length) return null;
  return (
    <section aria-labelledby="services-h" className="flex flex-col gap-3">
      <h2 id="services-h" className="font-display text-xl font-extrabold">
        Services & prices
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
        {services.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            <Link href={`/p/${p.id}`} className="min-w-0 flex-1">
              <span className="block font-bold hover:text-purple">{p.name}</span>
              <span className="text-[13px] text-muted">{p.hasOptions ? `from ${formatLD(p.price)}` : formatLD(p.price)}</span>
            </Link>
            <Link href={`/shop/${slug}/book?product=${p.id}`} className="inline-flex h-9 items-center rounded-full bg-amber px-4 text-[13px] font-bold text-ink hover:brightness-95">
              Book
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
