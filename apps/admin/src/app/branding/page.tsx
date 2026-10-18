"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { brandCssVars, contrastRatio, DEFAULT_BRANDING, HEX_COLOR, type BrandColors, type Branding } from "@yanabuy/shared";
import { Alert, BrandingProvider, Button, Field, ImageUpload, Logo, TextInput, fieldErrorsOf, messageOf, useBranding } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { whenTime } from "@/lib/labels";

type Form = Omit<Branding, "updatedAt">;

const COLOR_FIELDS: { key: keyof BrandColors; label: string; hint: string }[] = [
  { key: "primary", label: "Main colour", hint: "Headers and main buttons" },
  { key: "ink", label: "Dark colour", hint: "Headings and dark panels" },
  { key: "goods", label: "Goods & Services colour", hint: "Highlights on the shopping side" },
  { key: "food", label: "Food colour", hint: "Highlights on the food side" },
];

/** Readability warnings, so a colour change can't make text hard to read. */
function warnings(c: BrandColors) {
  const out: string[] = [];
  const ok = (hex: string) => HEX_COLOR.test(hex);
  if (ok(c.primary) && contrastRatio(c.primary, "#FFFFFF") < 4.5) out.push("White text on the main colour is hard to read. Pick a darker main colour.");
  if (ok(c.ink) && contrastRatio(c.ink, "#FFFFFF") < 7) out.push("The dark colour isn't dark enough for headings.");
  if (ok(c.goods) && ok(c.ink) && contrastRatio(c.goods, c.ink) < 4.5) out.push("Dark text on the Goods colour is hard to read. Pick a lighter Goods colour.");
  if (ok(c.food) && ok(c.ink) && contrastRatio(c.food, c.ink) < 4.5) out.push("Dark text on the Food colour is hard to read. Pick a lighter Food colour.");
  return out;
}

export default function BrandingPage() {
  const { setBranding } = useBranding();
  const [saved, setSaved] = useState<Branding | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    api.admin
      .branding()
      .then((res) => {
        setSaved(res.branding);
        const { updatedAt: _u, ...rest } = res.branding;
        setForm(rest);
      })
      .catch((err) => setError(messageOf(err)));
  }, []);

  if (!form) {
    return (
      <AdminShell title="Branding" subtitle="Your app's name, logo and colours.">
        {error ? <Alert>{error}</Alert> : <p className="text-sm text-muted">Loading…</p>}
      </AdminShell>
    );
  }

  const setColor = (k: keyof BrandColors, v: string) => setForm((f) => f && { ...f, colors: { ...f.colors, [k]: v } });
  const colorsValid = Object.values(form.colors).every((v) => HEX_COLOR.test(v));
  const problems = warnings(form.colors);
  const savedForm = saved ? (({ updatedAt: _u, ...r }) => r)(saved) : null;
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  async function save(next: Form, message: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    setFields({});
    try {
      const res = await api.admin.saveBranding(next);
      setSaved(res.branding);
      const { updatedAt: _u, ...rest } = res.branding;
      setForm(rest);
      setBranding(res.branding);
      setNotice(message);
    } catch (err) {
      setError(messageOf(err));
      setFields(fieldErrorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  const previewStyle = colorsValid
    ? (Object.fromEntries(brandCssVars(form.colors).split(";").map((p) => p.split(":"))) as CSSProperties)
    : undefined;
  const previewBranding: Branding = { ...form, updatedAt: null };

  return (
    <AdminShell
      title="Branding"
      subtitle={`Your app's name, logo and colours — on the website, this console and the phone app.${saved?.updatedAt ? ` Last changed ${whenTime(saved.updatedAt)}.` : ""}`}
    >
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_1.1fr]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(form, "Saved. The website shows the new branding now; the phone app picks it up the next time it opens.");
          }}
          className="flex flex-col gap-5 rounded-[20px] border border-line bg-white p-[22px]"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="App name" error={fields.appName}>
              {(id) => <TextInput id={id} value={form.appName} maxLength={30} onChange={(e) => setForm({ ...form, appName: e.target.value })} invalid={!!fields.appName} />}
            </Field>
            <Field label="Tagline" error={fields.tagline} hint="Shown in the browser tab title.">
              {(id) => <TextInput id={id} value={form.tagline} maxLength={80} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ImageUpload
              api={api}
              label="Logo"
              hint="Square or wide PNG with a see-through background works best. Empty = the YanaBuy bag."
              images={form.logoUrl ? [form.logoUrl] : []}
              onChange={(urls) => setForm({ ...form, logoUrl: urls[0] ?? null })}
              max={1}
            />
            <ImageUpload
              api={api}
              label="Browser icon"
              hint="The small picture on the browser tab. Square, at least 64 × 64."
              images={form.faviconUrl ? [form.faviconUrl] : []}
              onChange={(urls) => setForm({ ...form, faviconUrl: urls[0] ?? null })}
              max={1}
            />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[13px] font-bold">Colours</legend>
            <div className="grid gap-3">
              {COLOR_FIELDS.map((c) => {
                const value = form.colors[c.key];
                const bad = !HEX_COLOR.test(value) || !!fields[`colors.${c.key}`];
                return (
                  <div key={c.key} className="flex items-center gap-3 rounded-2xl border border-line p-3">
                    <input
                      type="color"
                      aria-label={`${c.label} picker`}
                      value={HEX_COLOR.test(value) ? value : "#000000"}
                      onChange={(e) => setColor(c.key, e.target.value.toUpperCase())}
                      className="h-11 w-11 flex-shrink-0 cursor-pointer rounded-xl border border-line-strong bg-white p-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`hex-${c.key}`} className="block text-[13px] font-bold">
                        {c.label}
                      </label>
                      <p className="text-[11.5px] text-muted">{c.hint}</p>
                    </div>
                    <input
                      id={`hex-${c.key}`}
                      value={value}
                      onChange={(e) => setColor(c.key, e.target.value.trim())}
                      aria-invalid={bad || undefined}
                      maxLength={7}
                      className="h-10 w-[92px] rounded-[10px] border border-line-strong px-2 font-mono text-[13px] uppercase outline-none focus:border-purple aria-[invalid=true]:border-danger"
                    />
                  </div>
                );
              })}
            </div>
            {!colorsValid && <p className="text-xs font-semibold text-danger">Colours must look like #491F67.</p>}
            {problems.map((p) => (
              <Alert key={p} tone="warn">
                {p}
              </Alert>
            ))}
          </fieldset>

          {notice && <Alert tone="success">{notice}</Alert>}
          {error && <Alert>{error}</Alert>}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={busy} disabled={!colorsValid || !dirty}>
              Save branding
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (!confirm("Go back to the original YanaBuy name, bag logo and colours?")) return;
                const { updatedAt: _u, ...defaults } = DEFAULT_BRANDING;
                save(defaults, "Back to the original YanaBuy branding.");
              }}
            >
              Reset to YanaBuy defaults
            </Button>
          </div>
          <p className="text-[12px] text-muted">
            The icon on phone home screens is part of the app itself, so it only changes when a new version of the app is published to the app stores.
          </p>
        </form>

        <section aria-label="Preview" className="flex flex-col gap-4" style={previewStyle}>
          <BrandingProvider key={JSON.stringify(previewBranding)} initial={previewBranding}>
            <p className="text-[13px] font-bold">Preview — website</p>
            <div className="overflow-hidden rounded-[20px] border border-line bg-ground">
              <div className="flex h-16 items-center gap-4 bg-purple px-5">
                <Logo size={26} />
                <div className="h-9 flex-1 rounded-full bg-white" />
                <div className="flex rounded-full bg-white/10 p-1">
                  <span className="rounded-full bg-amber px-3 py-1.5 text-xs font-bold text-ink">Goods</span>
                  <span className="px-3 py-1.5 text-xs font-bold text-white">Food</span>
                </div>
              </div>
              <div className="grid grid-cols-[2fr_1fr] gap-3 p-4">
                <div className="relative h-32 overflow-hidden rounded-2xl bg-ink p-5">
                  <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-amber" />
                  <p className="relative max-w-[60%] font-display text-xl font-extrabold leading-tight text-white">Shop Liberian shops in one place</p>
                </div>
                <div className="relative h-32 overflow-hidden rounded-2xl bg-orange p-4">
                  <p className="relative font-display text-base font-extrabold leading-tight text-ink">Order from local kitchens</p>
                </div>
              </div>
              <div className="flex gap-2 px-4 pb-4">
                <span className="rounded-full bg-purple px-4 py-2 text-xs font-bold text-white">Main button</span>
                <span className="rounded-full bg-amber px-4 py-2 text-xs font-bold text-ink">Goods button</span>
                <span className="rounded-full bg-orange px-4 py-2 text-xs font-bold text-ink">Food button</span>
              </div>
            </div>

            <p className="text-[13px] font-bold">Preview — phone app</p>
            <div className="w-[260px] overflow-hidden rounded-[28px] border-[6px] border-ink bg-ground">
              <div className="flex flex-col gap-2.5 rounded-b-[20px] bg-purple px-4 pb-4 pt-5">
                <Logo size={22} />
                <div className="h-8 rounded-full bg-white" />
                <div className="flex rounded-full bg-white/10 p-1">
                  <span className="flex-1 rounded-full bg-orange py-1.5 text-center text-[11px] font-bold text-ink">Food</span>
                  <span className="flex-1 py-1.5 text-center text-[11px] font-bold text-white">Goods</span>
                </div>
              </div>
              <div className="p-3">
                <div className="h-16 rounded-xl bg-ink" />
              </div>
            </div>
          </BrandingProvider>
        </section>
      </div>
    </AdminShell>
  );
}
