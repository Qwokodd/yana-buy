"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EMPTY_WORK_PROFILE, isVideoLink, videoInfo, type MyShop, type PortfolioItem, type WorkProfile } from "@yanabuy/shared";
import { Alert, Button, Field, ImageUpload, TextInput, fieldErrorsOf, inputClass, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { api } from "@/lib/api";

/** Type a word and press Enter (or comma) to add it; tap × to remove. */
function TagInput({ label, hint, values, onChange, max, placeholder }: { label: string; hint?: string; values: string[]; onChange: (v: string[]) => void; max: number; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim().replace(/,$/, "").trim();
    if (v && values.length < max && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v.slice(0, 40)]);
    setDraft("");
  };
  return (
    <Field label={label} hint={hint ?? `Press Enter after each one (up to ${max}).`}>
      {(id) => (
        <div className={`${inputClass} flex h-auto min-h-12 flex-wrap items-center gap-1.5 py-2`}>
          {values.map((v) => (
            <span key={v} className="flex items-center gap-1 rounded-full bg-purple-tint px-2.5 py-1 text-[13px] font-semibold text-purple">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="font-bold">
                ×
              </button>
            </span>
          ))}
          <input
            id={id}
            value={draft}
            onChange={(e) => (e.target.value.endsWith(",") ? (setDraft(e.target.value), setTimeout(add)) : setDraft(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              } else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
            }}
            onBlur={add}
            placeholder={values.length ? "" : placeholder}
            className="min-w-[120px] flex-1 bg-transparent outline-none"
          />
        </div>
      )}
    </Field>
  );
}

export default function WorkProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [shop, setShop] = useState<MyShop | null>(null);
  const [profile, setProfile] = useState<WorkProfile | null>(null);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [video, setVideo] = useState({ url: "", title: "" });

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/sell/profile");
  }, [loading, user, router]);
  useEffect(() => {
    if (!user) return;
    api.shop
      .mine()
      .then((r) => setShop(r.shop))
      .catch(() => {});
    api.shop
      .workProfile()
      .then((r) => {
        setProfile(r.profile);
        setItems(r.items);
      })
      .catch((err) => setNotice({ tone: "danger", text: messageOf(err) }));
  }, [user]);

  const restaurant = shop?.kind === "restaurant";
  const set = <K extends keyof WorkProfile>(k: K, v: WorkProfile[K]) => setProfile((p) => ({ ...(p ?? EMPTY_WORK_PROFILE), [k]: v }));

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!profile) return;
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      const r = await api.shop.saveWorkProfile(profile);
      setProfile(r.profile);
      setNotice({ tone: "success", text: "Saved — it's on your shop page now." });
    } catch (err) {
      setNotice({ tone: "danger", text: messageOf(err) });
      setFields(fieldErrorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  function addVideo() {
    if (!profile) return;
    const url = video.url.trim();
    if (!isVideoLink(url)) return setFields({ video: "Paste a YouTube, TikTok, Instagram, Facebook or Vimeo link (https://…)" });
    if (profile.videos.some((v) => v.url === url)) return setFields({ video: "That video is already added" });
    set("videos", [...profile.videos, { url, title: video.title.trim() || null }]);
    setVideo({ url: "", title: "" });
    setFields({});
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
        <div>
          <Link href="/sell" className="text-[13px] font-bold text-purple hover:underline">
            ← My shop
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-[28px] font-extrabold">{restaurant ? "Profile & gallery" : "Work profile"}</h1>
              <p className="text-sm text-muted">{restaurant ? "Tell people about your kitchen and show off your food." : "Show your best work, your skills and experience — it's what wins customers."}</p>
            </div>
            {shop && (
              <Link href={`/shop/${shop.slug}`} className="inline-flex h-10 items-center rounded-full border border-line-strong px-5 text-sm font-bold text-purple hover:border-purple">
                See it as customers do →
              </Link>
            )}
          </div>
        </div>
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

        {profile && (
          <form onSubmit={save} className="flex flex-col gap-4 rounded-card border border-line bg-white p-6" noValidate>
            <h2 className="font-display text-lg font-extrabold">About you</h2>
            <Field label="Tagline" error={fields.tagline} hint="One line under your name, e.g. “Bridal make-up & gele artist”.">
              {(id) => <TextInput id={id} value={profile.tagline ?? ""} onChange={(e) => set("tagline", e.target.value || null)} maxLength={80} />}
            </Field>
            <Field label="About" error={fields.about} hint="Who you are, how you work, what makes you different.">
              {(id) => <textarea id={id} rows={5} maxLength={2000} value={profile.about ?? ""} onChange={(e) => set("about", e.target.value || null)} className={`${inputClass} h-auto py-3`} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Years of experience" error={fields.yearsExperience}>
                {(id) => (
                  <TextInput
                    id={id}
                    inputMode="numeric"
                    value={profile.yearsExperience ?? ""}
                    onChange={(e) => {
                      const n = e.target.value.replace(/\D/g, "");
                      set("yearsExperience", n ? Math.min(80, Number(n)) : null);
                    }}
                  />
                )}
              </Field>
              <fieldset>
                <legend className="mb-1.5 text-[13px] font-bold">Where you work</legend>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["home", "🚗 I come to the customer"],
                      ["shop", restaurant ? "🏠 Eat in / pick up" : "🏠 At my place"],
                    ] as const
                  ).map(([v, label]) => {
                    const on = profile.servesAt.includes(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set("servesAt", on ? profile.servesAt.filter((x) => x !== v) : [...profile.servesAt, v])}
                        className={`h-11 rounded-full px-4 text-sm font-bold ${on ? "bg-purple text-white" : "border border-line-strong text-soft"}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>
            <TagInput label={restaurant ? "Specialties" : "Skills & specialties"} values={profile.skills} onChange={(v) => set("skills", v)} max={20} placeholder={restaurant ? "e.g. Palm butter, Jollof" : "e.g. Braids, Gele, Wedding photos"} />
            <TagInput label="Certifications & training" values={profile.certifications} onChange={(v) => set("certifications", v)} max={10} placeholder="e.g. Certified electrician" />
            <div className="grid gap-4 sm:grid-cols-2">
              <TagInput label="Areas you serve" values={profile.serviceAreas} onChange={(v) => set("serviceAreas", v)} max={20} placeholder="e.g. Sinkor, Paynesville" />
              <TagInput label="Languages" values={profile.languages} onChange={(v) => set("languages", v)} max={8} placeholder="e.g. English, Kpelle" />
            </div>

            <h2 className="mt-2 font-display text-lg font-extrabold">Videos</h2>
            <p className="-mt-2 text-[13px] text-muted">Links to your videos on YouTube, TikTok, Instagram or Facebook. YouTube videos play right on your page.</p>
            {profile.videos.length > 0 && (
              <ul className="flex flex-col gap-2">
                {profile.videos.map((v) => (
                  <li key={v.url} className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2 text-sm">
                    <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">{videoInfo(v.url).label}</span>
                    <span className="min-w-0 flex-1 truncate">{v.title ?? v.url}</span>
                    <button type="button" onClick={() => set("videos", profile.videos.filter((x) => x.url !== v.url))} className="font-bold text-danger hover:underline">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {profile.videos.length < 12 && (
              <div className="grid gap-2 sm:grid-cols-[1fr_200px_auto] sm:items-end">
                <Field label="Video link" error={fields.video}>
                  {(id) => <TextInput id={id} type="url" value={video.url} onChange={(e) => setVideo({ ...video, url: e.target.value })} placeholder="https://youtu.be/…" invalid={!!fields.video} />}
                </Field>
                <Field label="Title (optional)">{(id) => <TextInput id={id} value={video.title} onChange={(e) => setVideo({ ...video, title: e.target.value })} maxLength={80} />}</Field>
                <Button type="button" variant="outline" onClick={addVideo}>
                  Add video
                </Button>
              </div>
            )}
            <div>
              <Button type="submit" busy={busy}>
                Save profile
              </Button>
            </div>
          </form>
        )}

        {profile && <PortfolioManager items={items} onChange={setItems} restaurant={restaurant} />}
      </main>
    </>
  );
}

function PortfolioManager({ items, onChange, restaurant }: { items: PortfolioItem[]; onChange: (items: PortfolioItem[]) => void; restaurant: boolean }) {
  const [editing, setEditing] = useState<PortfolioItem | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function move(id: string, direction: "up" | "down") {
    try {
      onChange((await api.shop.movePortfolio(id, direction)).items);
    } catch (err) {
      setError(messageOf(err));
    }
  }
  async function remove(it: PortfolioItem) {
    if (!confirm(`Remove “${it.title}”?`)) return;
    try {
      await api.shop.deletePortfolio(it.id);
      onChange(items.filter((x) => x.id !== it.id));
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-extrabold">{restaurant ? "Gallery" : "Portfolio — your past work"}</h2>
          <p className="text-[13px] text-muted">{restaurant ? "Photos of your dishes, your place and events you've catered." : "Each piece of work: up to 10 photos and/or a video, with a short story. Put your best first."}</p>
        </div>
        {editing === null && items.length < 60 && <Button onClick={() => setEditing("new")}>+ Add work</Button>}
      </div>
      {error && <Alert>{error}</Alert>}
      {editing !== null && (
        <PortfolioForm
          item={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(it) => {
            onChange(editing === "new" ? [it, ...items] : items.map((x) => (x.id === it.id ? it : x)));
            setEditing(null);
          }}
        />
      )}
      {items.length === 0 && editing === null && <p className="rounded-2xl bg-ground px-4 py-8 text-center text-sm text-muted">Nothing here yet. Shops with photos of their work get far more bookings.</p>}
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => {
          const cover = it.images[0] ?? (it.videoUrl ? videoInfo(it.videoUrl).thumbnail : null);
          return (
            <li key={it.id} className="flex items-center gap-3 rounded-2xl border border-line p-2.5">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="h-16 w-16 rounded-xl object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-ink text-white">▶</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{it.title}</p>
                <p className="text-[12.5px] text-muted">
                  {it.images.length} {it.images.length === 1 ? "photo" : "photos"}
                  {it.videoUrl ? " · video" : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(it.id, "up")} className="h-8 w-8 rounded-full border border-line-strong font-bold disabled:opacity-30">
                  ↑
                </button>
                <button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(it.id, "down")} className="h-8 w-8 rounded-full border border-line-strong font-bold disabled:opacity-30">
                  ↓
                </button>
                <button type="button" onClick={() => setEditing(it)} className="px-2 text-[13px] font-bold text-purple hover:underline">
                  Edit
                </button>
                <button type="button" onClick={() => remove(it)} className="px-2 text-[13px] font-bold text-danger hover:underline">
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PortfolioForm({ item, onSaved, onCancel }: { item: PortfolioItem | null; onSaved: (it: PortfolioItem) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [images, setImages] = useState<string[]>(item?.images ?? []);
  const [videoUrl, setVideoUrl] = useState(item?.videoUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const input = { title, description: description || null, images, videoUrl: videoUrl.trim() || null };
      const r = item ? await api.shop.updatePortfolio(item.id, input) : await api.shop.addPortfolio(input);
      onSaved(r.item);
    } catch (err) {
      setError(messageOf(err));
      setFields(fieldErrorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-2xl border-2 border-purple/40 bg-purple-tint/30 p-4" noValidate>
      {error && <Alert>{error}</Alert>}
      <Field label="Title" error={fields.title} hint="e.g. “Kebbeh's wedding”, “Kitchen rewiring, Sinkor”.">
        {(id) => <TextInput id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} invalid={!!fields.title} />}
      </Field>
      <ImageUpload api={api} label="Photos" hint="Up to 10. The first one is the cover." images={images} onChange={setImages} max={10} />
      {fields.images && <p className="-mt-2 text-[13px] font-semibold text-danger">{fields.images}</p>}
      <Field label="Video link (optional)" error={fields.videoUrl}>
        {(id) => <TextInput id={id} type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtu.be/…" invalid={!!fields.videoUrl} />}
      </Field>
      <Field label="The story (optional)" error={fields.description} hint="What the customer wanted, what you did, how long it took.">
        {(id) => <textarea id={id} rows={3} maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} h-auto py-3`} />}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>
          {item ? "Save changes" : "Add to portfolio"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
