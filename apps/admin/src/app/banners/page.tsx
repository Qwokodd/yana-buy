"use client";

import { useEffect, useState } from "react";
import { COUNTRIES, countryInfo, type AdminBanner, type BannerInput } from "@yanabuy/shared";
import { Alert, Badge, BannerHero, BannerStrip, Button, Field, ImageUpload, TextInput, fieldErrorsOf, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { EmptyPanel, MoveButtons } from "@/components/bits";
import { api } from "@/lib/api";
import { whenTime } from "@/lib/labels";

const PLATFORM_LABEL = { all: "Website & app", web: "Website only", app: "App only" } as const;
const MODE_LABEL = { all: "Goods & Food", goods: "Goods & Services", food: "Food" } as const;
const STATE: Record<AdminBanner["state"], { label: string; tone: "success" | "warn" | "neutral" | "danger" }> = {
  live: { label: "Live", tone: "success" },
  scheduled: { label: "Scheduled", tone: "warn" },
  ended: { label: "Ended", tone: "neutral" },
  off: { label: "Off", tone: "neutral" },
};

const EMPTY: BannerInput = {
  kind: "banner",
  title: "",
  subtitle: null,
  imageUrl: "",
  videoUrl: null,
  linkUrl: null,
  buttonLabel: null,
  advertiser: null,
  placement: "hero",
  platform: "all",
  mode: "all",
  country: null,
  startsAt: null,
  endsAt: null,
  active: true,
};

export default function BannersPage() {
  const [items, setItems] = useState<AdminBanner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminBanner | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .banners()
      .then((res) => setItems(res.items))
      .catch((err) => setError(messageOf(err)));
  }, []);

  const groups = [
    { placement: "hero" as const, title: "Top banners", hint: "The big slides at the top of the home page. Shoppers swipe through them in this order." },
    { placement: "promo" as const, title: "Promos with countdown", hint: "Cards in the Promos row on the home page, each counting down to its end date." },
    { placement: "strip" as const, title: "Ads between products", hint: "Wide cards shown between rows of products as shoppers scroll — good for ads." },
  ];

  async function move(list: AdminBanner[], index: number, by: -1 | 1) {
    const next = [...list];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    const others = (items ?? []).filter((b) => b.placement !== list[0].placement);
    setItems([...others, ...next.map((b, i) => ({ ...b, sortOrder: i }))]);
    try {
      const res = await api.admin.reorderBanners(next.map((b) => b.id));
      setItems(res.items);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function toggle(b: AdminBanner) {
    try {
      const res = await api.admin.updateBanner(b.id, { active: !b.active });
      setItems((prev) => (prev ?? []).map((x) => (x.id === b.id ? res.banner : x)));
      setNotice(res.banner.active ? `“${b.title}” is switched on.` : `“${b.title}” is switched off.`);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function remove(b: AdminBanner) {
    if (!confirm(`Delete “${b.title}”? This can't be undone.`)) return;
    try {
      await api.admin.deleteBanner(b.id);
      setItems((prev) => (prev ?? []).filter((x) => x.id !== b.id));
      if (editing !== "new" && editing?.id === b.id) setEditing(null);
      setNotice(`“${b.title}” deleted.`);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <AdminShell
      title="Banners & ads"
      subtitle="Everything shoppers see at the top of the website and the app."
      actions={
        <Button
          onClick={() => {
            setEditing("new");
            setNotice(null);
          }}
        >
          + New banner or ad
        </Button>
      }
    >
      {error && <Alert>{error}</Alert>}
      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="flex flex-col gap-5">
          {groups.map((g) => {
            const list = (items ?? []).filter((b) => b.placement === g.placement).sort((a, b) => a.sortOrder - b.sortOrder);
            return (
              <section key={g.placement} className="rounded-[20px] border border-line bg-white p-[22px]" aria-label={g.title}>
                <h2 className="font-display text-lg font-extrabold">{g.title}</h2>
                <p className="mb-3 text-[12.5px] text-muted">{g.hint}</p>
                <ul className="flex flex-col">
                  {list.map((b, i) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-t-0">
                      <MoveButtons name={b.title} onUp={i > 0 ? () => move(list, i, -1) : undefined} onDown={i < list.length - 1 ? () => move(list, i, 1) : undefined} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.imageUrl} alt="" className="h-14 w-24 flex-shrink-0 rounded-lg border border-line object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{b.title}</p>
                        {b.kind === "ad" && <p className="truncate text-[12px] font-bold text-purple">Ad · {b.advertiser}</p>}
                        <p className="text-[12px] text-muted">
                          {PLATFORM_LABEL[b.platform]} · {MODE_LABEL[b.mode]} · {b.country ? `${countryInfo(b.country).flag} ${countryInfo(b.country).name} only` : "All countries"}
                          {b.startsAt || b.endsAt ? ` · ${b.startsAt ? whenTime(b.startsAt) : "now"} → ${b.endsAt ? whenTime(b.endsAt) : "no end"}` : ""}
                          {` · ${b.clicks} ${b.clicks === 1 ? "tap" : "taps"}`}
                        </p>
                      </div>
                      <Badge tone={STATE[b.state].tone}>{STATE[b.state].label}</Badge>
                      <button onClick={() => toggle(b)} className="text-[12.5px] font-bold text-soft hover:text-ink">
                        {b.active ? "Switch off" : "Switch on"}
                      </button>
                      <button
                        onClick={() => {
                          setEditing(b);
                          setNotice(null);
                        }}
                        className="text-[12.5px] font-bold text-purple hover:underline"
                      >
                        Edit
                      </button>
                      <button onClick={() => remove(b)} className="text-[12.5px] font-bold text-danger hover:underline">
                        Delete
                      </button>
                    </li>
                  ))}
                  {!items && !error && <li className="py-6 text-center text-sm text-muted">Loading…</li>}
                  {items && list.length === 0 && (
                    <li className="py-6 text-center text-sm text-muted">
                      None yet.{g.placement === "hero" ? " Until you add one, shoppers see the built-in YanaBuy welcome banner." : ""}
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>

        {editing ? (
          <BannerEditor
            key={editing === "new" ? "new" : editing.id}
            banner={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={(saved, isNew) => {
              setItems((prev) => (isNew ? [...(prev ?? []), saved] : (prev ?? []).map((x) => (x.id === saved.id ? saved : x))));
              setEditing(null);
              setNotice(isNew ? `“${saved.title}” is saved${saved.state === "live" ? " and live now" : ""}.` : `“${saved.title}” is updated.`);
            }}
          />
        ) : (
          <EmptyPanel>Press “New banner or ad”, or Edit on one of the list, to change what shoppers see.</EmptyPanel>
        )}
      </div>
    </AdminShell>
  );
}

/** ISO → value for <input type="datetime-local"> (in this computer's time). */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function BannerEditor({ banner, onCancel, onSaved }: { banner: AdminBanner | null; onCancel: () => void; onSaved: (b: AdminBanner, isNew: boolean) => void }) {
  const [form, setForm] = useState<BannerInput>(() => {
    if (!banner) return EMPTY;
    const { id: _id, sortOrder: _s, clicks: _c, state: _st, createdAt: _cr, ...rest } = banner;
    return rest;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const set = <K extends keyof BannerInput>(k: K, v: BannerInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: "title" | "subtitle" | "buttonLabel" | "linkUrl" | "advertiser") => ({
    value: form[k] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value),
    invalid: !!fields[k],
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    const input: BannerInput = {
      ...form,
      subtitle: form.subtitle || null,
      buttonLabel: form.buttonLabel || null,
      linkUrl: form.linkUrl || null,
      advertiser: form.kind === "ad" ? form.advertiser || null : null,
    };
    try {
      const res = banner ? await api.admin.updateBanner(banner.id, input) : await api.admin.createBanner(input);
      onSaved(res.banner, !banner);
    } catch (err) {
      const fe = fieldErrorsOf(err);
      setFields(fe);
      setError(Object.keys(fe).length ? "Please fix the fields marked in red." : messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const radio = <K extends "kind" | "placement" | "platform" | "mode">(k: K, options: { value: BannerInput[K]; label: string }[], label: string) => (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-bold">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={form[k] === o.value}
            onClick={() => set(k, o.value)}
            className={`h-9 rounded-full px-3.5 text-[13px] font-bold ${form[k] === o.value ? "bg-purple text-white" : "border border-line-strong bg-white text-soft"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-[22px]" noValidate aria-label={banner ? "Edit banner" : "New banner"}>
      <h2 className="font-display text-lg font-extrabold">{banner ? "Edit banner" : "New banner or ad"}</h2>

      <div className="flex flex-col gap-1.5">
        <p className="text-[13px] font-bold">Preview</p>
        {form.placement === "hero" ? <BannerHero banner={form} className="!min-h-[190px]" /> : <BannerStrip banner={form} className="max-w-[300px]" />}
      </div>

      {radio("kind", [{ value: "banner", label: "Banner" }, { value: "ad", label: "Paid ad" }], "Type")}
      {form.kind === "ad" && (
        <Field label="Who is the ad for?" error={fields.advertiser} hint="Shown as “Ad · name” so shoppers know it's paid.">
          {(id) => <TextInput id={id} {...text("advertiser")} placeholder="e.g. Lonestar Cell MTN" />}
        </Field>
      )}

      <ImageUpload
        api={api}
        label="Picture"
        hint={form.placement === "hero" ? "Wide picture, about 1600 × 600. Keep the left side calm — text goes there." : "About 800 × 500."}
        images={form.imageUrl ? [form.imageUrl] : []}
        onChange={(urls) => set("imageUrl", urls[0] ?? "")}
        max={1}
        shape="wide"
      />
      {fields.imageUrl && <p className="-mt-2 text-xs font-semibold text-danger">{fields.imageUrl}</p>}
      <VideoUpload url={form.videoUrl} onChange={(url) => set("videoUrl", url)} error={fields.videoUrl} />

      <Field label="Title" error={fields.title}>
        {(id) => <TextInput id={id} {...text("title")} maxLength={80} placeholder="e.g. Rainy season deals" />}
      </Field>
      <Field label="Line under the title (optional)" error={fields.subtitle}>
        {(id) => <TextInput id={id} {...text("subtitle")} maxLength={160} placeholder="e.g. Umbrellas, boots and raincoats from Monrovia shops" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
        <Field label="Button text (optional)" error={fields.buttonLabel}>
          {(id) => <TextInput id={id} {...text("buttonLabel")} maxLength={24} placeholder="Shop now" />}
        </Field>
        <Field label="Opens (optional)" error={fields.linkUrl} hint="A YanaBuy page like /search?q=boots, or a full https:// link.">
          {(id) => <TextInput id={id} {...text("linkUrl")} placeholder="/search?q=boots" />}
        </Field>
      </div>

      {radio(
        "placement",
        [
          { value: "hero", label: "Top banner" },
          { value: "promo", label: "Promo with countdown" },
          { value: "strip", label: "Between products" },
        ],
        "Where on the home page"
      )}
      {radio("platform", [{ value: "all", label: "Website & app" }, { value: "web", label: "Website only" }, { value: "app", label: "App only" }], "Show on")}
      {radio("mode", [{ value: "all", label: "Both sides" }, { value: "goods", label: "Goods & Services" }, { value: "food", label: "Food" }], "Show to shoppers on")}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] font-bold">Show in</legend>
        <div className="flex flex-wrap gap-1.5">
          {[{ value: null, label: "All countries" }, ...COUNTRIES.map((c) => ({ value: c.code, label: `${c.flag} ${c.name}` }))].map((o) => (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={(form.country ?? null) === o.value}
              onClick={() => set("country", o.value)}
              className={`h-9 rounded-full px-3.5 text-[13px] font-bold ${(form.country ?? null) === o.value ? "bg-purple text-white" : "border border-line-strong bg-white text-soft"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts (optional)" error={fields.startsAt} hint="Empty = straight away">
          {(id) => (
            <TextInput id={id} type="datetime-local" value={toLocalInput(form.startsAt)} onChange={(e) => set("startsAt", fromLocalInput(e.target.value))} />
          )}
        </Field>
        <Field
          label={form.placement === "promo" ? "Ends (the countdown runs to this)" : "Ends (optional)"}
          error={fields.endsAt}
          hint={form.placement === "promo" ? "Needed for a promo." : "Empty = keeps running"}
        >
          {(id) => (
            <TextInput id={id} type="datetime-local" value={toLocalInput(form.endsAt)} onChange={(e) => set("endsAt", fromLocalInput(e.target.value))} invalid={!!fields.endsAt} />
          )}
        </Field>
      </div>

      <label className="flex items-center gap-2.5 text-sm font-semibold">
        <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-[rgb(var(--c-purple))]" />
        Switched on
      </label>

      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>
          {banner ? "Save changes" : "Save banner"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** A 5–10 second video ad or promo. Checked for length in the browser before it's uploaded. */
function VideoUpload({ url, onChange, error }: { url: string | null; onChange: (url: string | null) => void; error?: string }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function lengthOf(file: File) {
    return new Promise<number>((resolve, reject) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      const src = URL.createObjectURL(file);
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(src);
        resolve(v.duration);
      };
      v.onerror = () => {
        URL.revokeObjectURL(src);
        reject(new Error("That file can't be played — use an MP4 video"));
      };
      v.src = src;
    });
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    setBusy(true);
    try {
      const seconds = await lengthOf(file);
      if (!Number.isFinite(seconds) || seconds < 4.5 || seconds > 10.5) {
        setProblem(`That video is ${Number.isFinite(seconds) ? `${Math.round(seconds)} seconds` : "an unknown length"} — it must be 5 to 10 seconds.`);
        return;
      }
      if (file.size > 30 * 1024 * 1024) {
        setProblem("The video must be under 30 MB.");
        return;
      }
      const res = await api.uploads.video(file);
      onChange(res.url);
    } catch (err) {
      setProblem(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] font-bold">Video (optional)</p>
      <p className="text-xs text-muted">A 5–10 second MP4. It plays muted on a loop; the picture above is shown while it loads (and to people who turn off motion).</p>
      {url ? (
        <div className="flex flex-wrap items-center gap-3">
          <video src={url} muted loop autoPlay playsInline className="h-24 w-40 rounded-lg border border-line bg-ink object-cover" />
          <Button type="button" size="sm" variant="outline" onClick={() => onChange(null)}>
            Remove video
          </Button>
        </div>
      ) : (
        <label className={`inline-flex h-10 w-fit cursor-pointer items-center rounded-full border border-line-strong bg-white px-4 text-[13px] font-bold text-purple hover:border-purple ${busy ? "opacity-60" : ""}`}>
          {busy ? "Uploading…" : "Upload a video"}
          <input type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" disabled={busy} onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
      )}
      {(problem || error) && <p className="text-xs font-semibold text-danger">{problem ?? error}</p>}
    </div>
  );
}
