"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatLD, type SourcingRequest } from "@yanabuy/shared";
import { Alert, Button, Field, ImageUpload, TextInput, fieldErrorsOf, inputClass, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { SourcingBadge } from "@/components/SourcingBits";
import { api } from "@/lib/api";

export default function ChinaPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<SourcingRequest[] | null>(null);
  const [form, setForm] = useState({ link: "", description: "", quantity: "1", budget: "" });
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    api.sourcing
      .list()
      .then((r) => setItems(r.items))
      .catch((err) => setError(messageOf(err)));
  }, [user]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFields(({ [k]: _gone, ...rest }) => rest);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return router.push("/login?next=/china");
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const { request } = await api.sourcing.create({
        link: form.link.trim() || null,
        description: form.description,
        quantity: Number(form.quantity) || 0,
        budget: form.budget.trim() || null,
        images,
      });
      router.push(`/china/${request.id}?sent=1`);
    } catch (err) {
      const fe = fieldErrorsOf(err);
      setFields(fe);
      setError(Object.keys(fe).length > 1 ? "Please fix the fields marked in red." : messageOf(err));
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
        <div className="overflow-hidden rounded-sheet bg-ink p-7 text-white">
          <p className="text-3xl" aria-hidden>
            🇨🇳 → 🇱🇷
          </p>
          <h1 className="mt-2 font-display text-[30px] font-extrabold leading-tight">Buy anything from China</h1>
          <p className="mt-2 max-w-xl text-white/80">
            Seen it on Alibaba, 1688, Taobao, Shein or anywhere else? Send us the link or a photo. We quote one price — the item plus shipping to Liberia — and deliver it to
            your door.
          </p>
          <ol className="mt-4 grid gap-2 text-sm text-white/85 sm:grid-cols-4">
            {["1. Send what you want", "2. Get a price", "3. Accept and pay", "4. We ship and deliver"].map((s) => (
              <li key={s} className="rounded-xl bg-white/10 px-3 py-2 font-semibold">
                {s}
              </li>
            ))}
          </ol>
        </div>

        <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-card border border-line bg-white p-6" aria-label="New China request">
          <h2 className="font-display text-lg font-extrabold">What do you want?</h2>
          <Field label="Link to the item (optional)" error={fields.link} hint="Paste the web address of the product page.">
            {(id) => <TextInput id={id} type="url" value={form.link} onChange={set("link")} invalid={!!fields.link} placeholder="https://…" />}
          </Field>
          <Field label="Describe it" error={fields.description}>
            {(id) => (
              <textarea
                id={id}
                rows={3}
                value={form.description}
                onChange={set("description")}
                maxLength={2000}
                aria-invalid={!!fields.description || undefined}
                className={`${inputClass} h-auto resize-none py-3`}
                placeholder="Item, size, colour, model — anything that helps us find the right one"
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="How many?" error={fields.quantity}>
              {(id) => <TextInput id={id} inputMode="numeric" value={form.quantity} onChange={set("quantity")} invalid={!!fields.quantity} />}
            </Field>
            <Field label="Budget (optional)" error={fields.budget}>
              {(id) => <TextInput id={id} value={form.budget} onChange={set("budget")} placeholder="e.g. up to $25 each" />}
            </Field>
          </div>
          <ImageUpload api={api} images={images} onChange={setImages} max={6} label="Photos (optional)" hint="Screenshots or photos of what you want. Add a link or at least one photo." />
          {error && <Alert>{error}</Alert>}
          <div>
            <Button type="submit" size="lg" busy={busy}>
              {user || loading ? "Ask for a price" : "Log in to ask for a price"}
            </Button>
          </div>
        </form>

        {items && items.length > 0 && (
          <section className="flex flex-col gap-3" aria-label="Your China requests">
            <h2 className="font-display text-lg font-extrabold">Your requests</h2>
            <ul className="flex flex-col gap-2">
              {items.map((r) => (
                <li key={r.id}>
                  <Link href={`/china/${r.id}`} className="flex items-center gap-3 rounded-card border border-line bg-white p-4 hover:border-purple">
                    {r.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.images[0]} alt="" className="h-14 w-14 rounded-xl border border-line object-cover" />
                    ) : (
                      <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-purple-tint text-xl" aria-hidden>
                        🇨🇳
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">
                        {r.number} · {r.description}
                      </span>
                      <span className="text-sm text-muted">
                        {r.quantity} pcs{r.quotePrice ? ` · ${formatLD(r.quotePrice)}` : ""}
                      </span>
                    </span>
                    <SourcingBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
