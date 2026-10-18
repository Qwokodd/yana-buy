"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatLD, parseLD, type Category, type MyProduct, type MyShop, type ProductInput } from "@yanabuy/shared";
import { Alert, Badge, Button, Field, ImageUpload, TextInput, fieldErrorsOf, inputClass, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { collectOptions, draftFrom, OptionsEditor, type OptionsDraft } from "@/components/OptionsEditor";
import { api } from "@/lib/api";

const STATUS: Record<MyProduct["status"], { label: string; tone: "warn" | "success" | "neutral" | "danger" }> = {
  pending: { label: "Waiting for review", tone: "warn" },
  approved: { label: "On sale", tone: "success" },
  rejected: { label: "Needs changes", tone: "danger" },
  removed: { label: "Removed by YanaBuy", tone: "danger" },
};

export default function SellerProductsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [shop, setShop] = useState<MyShop | null | undefined>(undefined);
  const [items, setItems] = useState<MyProduct[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<MyProduct | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/sell/products");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([api.shop.mine(), api.shop.products()])
      .then(([s, p]) => {
        setShop(s.shop);
        setItems(p.items);
        if (s.shop) {
          api.public
            .categories(s.shop.kind === "restaurant" ? "food" : "goods")
            .then((c) => setCategories(c.items))
            .catch(() => {});
        }
        const id = new URLSearchParams(window.location.search).get("edit");
        if (id === "new") setEditing("new");
        else if (id) setEditing(p.items.find((x) => x.id === id) ?? null);
      })
      .catch((err) => setError(messageOf(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user || shop === undefined) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-4 py-16 text-muted">{error ? <Alert>{error}</Alert> : "Loading…"}</main>
      </>
    );
  }

  if (!shop || shop.status !== "approved") {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-12">
          <Alert tone="info">
            {!shop
              ? "Open a shop first — then you can add products."
              : shop.status === "suspended"
                ? "Your shop is suspended, so products can't be changed right now."
                : "You can add products once your shop is approved."}{" "}
            <Link href="/sell" className="underline">
              Go to my shop
            </Link>
          </Alert>
        </main>
      </>
    );
  }

  const food = shop.kind === "restaurant";
  const noun = food ? "dish" : "product";

  async function togglePause(p: MyProduct) {
    try {
      const res = await api.shop.updateProduct(p.id, { hidden: !p.hidden });
      setItems((prev) => (prev ?? []).map((x) => (x.id === p.id ? res.product : x)));
      setNotice(res.product.hidden ? `“${p.name}” is paused — shoppers can't see it.` : `“${p.name}” is showing again.`);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function remove(p: MyProduct) {
    if (!confirm(`Delete “${p.name}”? This can't be undone.`)) return;
    try {
      await api.shop.deleteProduct(p.id);
      setItems((prev) => (prev ?? []).filter((x) => x.id !== p.id));
      if (editing !== "new" && editing?.id === p.id) setEditing(null);
      setNotice(`“${p.name}” deleted.`);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  const counts = {
    live: (items ?? []).filter((p) => p.status === "approved" && !p.hidden).length,
    waiting: (items ?? []).filter((p) => p.status === "pending").length,
  };

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-[1180px] flex-col gap-5 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/sell" className="text-[13px] font-bold text-purple hover:underline">
              ← {shop.name}
            </Link>
            <h1 className="font-display text-[28px] font-extrabold">{food ? "Your menu" : "Your products"}</h1>
            <p className="text-sm text-muted">
              {counts.live} on sale · {counts.waiting} waiting for review. New {noun}s and changes to names, photos or descriptions are checked by YanaBuy first.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing("new");
              setNotice(null);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            + Add a {noun}
          </Button>
        </div>

        {notice && <Alert tone="success">{notice}</Alert>}
        {error && <Alert>{error}</Alert>}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
          <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-white">
            {(items ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 border-t border-line p-3.5 first:border-t-0">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="h-16 w-16 flex-shrink-0 rounded-xl border border-line object-cover" />
                ) : (
                  <div className="h-16 w-16 flex-shrink-0 rounded-xl bg-ground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{p.name}</p>
                  <p className="text-[13px] text-soft">
                    {p.hasOptions ? `from ${formatLD(p.price)} · ${p.variants.length} choices` : formatLD(p.price)}
                    {p.stock !== null ? ` · ${p.stock} in stock` : ""}
                    {p.category ? ` · ${p.category.name}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                    {p.hidden && p.status === "approved" && <Badge>Paused</Badge>}
                  </div>
                  {p.statusReason && (p.status === "rejected" || p.status === "removed") && (
                    <p className="mt-1 text-[12.5px] font-semibold text-danger">{p.statusReason}</p>
                  )}
                </div>
                <div className="flex gap-3 text-[13px] font-bold">
                  {p.status === "approved" && (
                    <button onClick={() => togglePause(p)} className="text-soft hover:text-ink">
                      {p.hidden ? "Show" : "Pause"}
                    </button>
                  )}
                  {p.status === "approved" && !p.hidden && (
                    <Link href={`/p/${p.id}`} className="text-soft hover:text-ink">
                      View
                    </Link>
                  )}
                  {p.status !== "removed" && (
                    <button
                      onClick={() => {
                        setEditing(p);
                        setNotice(null);
                      }}
                      className="text-purple hover:underline"
                    >
                      {p.status === "rejected" ? "Fix" : "Edit"}
                    </button>
                  )}
                  <button onClick={() => remove(p)} className="text-danger hover:underline">
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {items && items.length === 0 && (
              <li className="px-6 py-12 text-center text-sm text-muted">
                Nothing yet. Press “Add a {noun}” — good photos sell faster.
              </li>
            )}
          </ul>

          {editing ? (
            <ProductEditor
              key={editing === "new" ? "new" : editing.id}
              product={editing === "new" ? null : editing}
              categories={categories}
              noun={noun}
              onCancel={() => setEditing(null)}
              onSaved={(saved, isNew, needsReview) => {
                setItems((prev) => (isNew ? [saved, ...(prev ?? [])] : (prev ?? []).map((x) => (x.id === saved.id ? saved : x))));
                setEditing(null);
                setNotice(
                  isNew || needsReview
                    ? `“${saved.name}” is saved. YanaBuy will check it and put it on sale — usually within a day.`
                    : `“${saved.name}” is updated.`
                );
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          ) : (
            <div className="rounded-card border border-dashed border-line-strong bg-white/60 p-8 text-center text-sm text-muted">
              Press “Add a {noun}”, or Edit on one of yours.
            </div>
          )}
        </div>
      </main>
    </>
  );
}

/** Cents → "4,500" or "4,500.50" for the price boxes. */
const toInput = (cents: number | null | undefined) => (cents ? (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "");

function ProductEditor({
  product,
  categories,
  noun,
  onCancel,
  onSaved,
}: {
  product: MyProduct | null;
  categories: Category[];
  noun: string;
  onCancel: () => void;
  onSaved: (p: MyProduct, isNew: boolean, needsReview: boolean) => void;
}) {
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    categoryId: product?.category?.id ?? "",
    price: toInput(product?.price),
    compareAtPrice: toInput(product?.compareAtPrice),
    stock: product?.stock === null || product?.stock === undefined ? "" : String(product.stock),
    deliveryDays: product?.deliveryDays ? String(product.deliveryDays) : "",
  });
  const [fromChina, setFromChina] = useState(product?.shipsFromChina ?? false);
  const [bookable, setBookable] = useState(product?.bookable ?? false);
  const [duration, setDuration] = useState(product?.durationMinutes ?? 60);
  const [opts, setOpts] = useState<OptionsDraft>(() => draftFrom(product));
  const usesOptions = opts.options.some((o) => o.name.trim() || o.values.trim());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const f: Record<string, string> = {};
    const price = parseLD(form.price);
    const compare = form.compareAtPrice.trim() ? parseLD(form.compareAtPrice) : null;
    const stock = form.stock.trim() === "" ? null : Number(form.stock);
    if (!images.length) f.images = "Add at least one photo";
    if (form.name.trim().length < 2) f.name = `Enter the ${noun}'s name`;
    if (!form.categoryId) f.categoryId = "Choose a category";
    const collected = collectOptions(opts);
    if (collected.error) f.options = collected.error;
    if (!usesOptions) {
      if (!price) f.price = "Enter the price in dollars, e.g. 24.99";
      if (form.compareAtPrice.trim() && !compare) f.compareAtPrice = "Enter a number, or leave it empty";
      if (price && compare && compare <= price) f.compareAtPrice = "The old price must be higher than the price";
      if (stock !== null && (!Number.isInteger(stock) || stock < 0)) f.stock = "Enter a whole number, or leave it empty";
    }
    const days = form.deliveryDays.trim() === "" ? null : Number(form.deliveryDays);
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 120)) f.deliveryDays = "Enter 1 to 120 days, or leave it empty";
    setFields(f);
    if (Object.keys(f).length) {
      setError("Please fix the fields marked in red.");
      return;
    }

    const input: ProductInput = {
      name: form.name,
      description: form.description || null,
      categoryId: form.categoryId,
      ...(usesOptions ? {} : { price: price!, compareAtPrice: compare, stock }),
      ...collected.value,
      images,
      shipsFromChina: fromChina,
      deliveryDays: days,
      ...(noun !== "dish" ? { bookable, durationMinutes: bookable ? duration : null } : {}),
    };
    setBusy(true);
    setError(null);
    try {
      if (product) {
        const res = await api.shop.updateProduct(product.id, input);
        onSaved(res.product, false, res.needsReview);
      } else {
        const res = await api.shop.createProduct(input);
        onSaved(res.product, true, true);
      }
    } catch (err) {
      const fe = fieldErrorsOf(err);
      setFields(fe);
      setError(Object.keys(fe).length ? "Please fix the fields marked in red." : messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate aria-label={product ? `Edit ${product.name}` : `New ${noun}`} className="flex flex-col gap-4 rounded-card border border-line bg-white p-5">
      <h2 className="font-display text-lg font-extrabold">{product ? `Edit ${noun}` : `New ${noun}`}</h2>
      {product?.status === "rejected" && product.statusReason && <Alert tone="warn">YanaBuy asked you to fix: {product.statusReason}</Alert>}

      <ImageUpload api={api} label="Photos" hint="Up to 8. The first one is shown in the shop — hover a photo to make it the main one." images={images} onChange={setImages} max={8} />
      {fields.images && <p className="-mt-2 text-xs font-semibold text-danger">{fields.images}</p>}

      <Field label="Name" error={fields.name}>
        {(id) => <TextInput id={id} value={form.name} onChange={set("name")} maxLength={80} invalid={!!fields.name} placeholder={noun === "dish" ? "e.g. Jollof rice with chicken" : "e.g. Men's leather shoes"} />}
      </Field>
      <Field label="Category" error={fields.categoryId}>
        {(id) => (
          <select id={id} value={form.categoryId} onChange={set("categoryId")} aria-invalid={!!fields.categoryId || undefined} className={inputClass}>
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <OptionsEditor value={opts} onChange={setOpts} error={fields.options ?? fields.variants} />
      {!usesOptions && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price ($)" error={fields.price}>
              {(id) => <TextInput id={id} inputMode="decimal" value={form.price} onChange={set("price")} invalid={!!fields.price} placeholder="24.99" />}
            </Field>
            <Field label="Old price (optional)" error={fields.compareAtPrice} hint="Shown crossed out, for a deal.">
              {(id) => <TextInput id={id} inputMode="decimal" value={form.compareAtPrice} onChange={set("compareAtPrice")} invalid={!!fields.compareAtPrice} />}
            </Field>
          </div>
          <Field label="How many do you have? (optional)" error={fields.stock} hint="Leave empty if you don't count. At 0 it shows as sold out.">
            {(id) => <TextInput id={id} inputMode="numeric" value={form.stock} onChange={set("stock")} invalid={!!fields.stock} />}
          </Field>
        </>
      )}
      {noun !== "dish" && (
        <div className="flex flex-col gap-3 rounded-2xl bg-ground p-4">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" checked={bookable} onChange={(e) => setBookable(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--c-purple))]" />
            📅 This is a service — customers book a time (e.g. a photo shoot, hair, repairs)
          </label>
          {bookable && (
            <Field label="How long does it take?" hint="Switch on appointments in My shop → Appointments to set your hours.">
              {(id) => (
                <select id={id} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputClass}>
                  {[15, 30, 45, 60, 90, 120, 180, 240, 300, 480].map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </div>
      )}
      {noun !== "dish" && (
        <div className="flex flex-col gap-3 rounded-2xl bg-ground p-4">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" checked={fromChina} onChange={(e) => setFromChina(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--c-purple))]" />
            🇨🇳 Ships from China (you order it for the buyer)
          </label>
          <Field label="Delivery time in days (optional)" error={fields.deliveryDays} hint={fromChina ? "How long until it reaches the buyer, e.g. 21." : "Only if it takes longer than a day or two."}>
            {(id) => <TextInput id={id} inputMode="numeric" value={form.deliveryDays} onChange={set("deliveryDays")} invalid={!!fields.deliveryDays} placeholder={fromChina ? "21" : ""} />}
          </Field>
        </div>
      )}
      <Field label="Description (optional)" error={fields.description}>
        {(id) => (
          <textarea id={id} value={form.description} onChange={set("description")} maxLength={2000} rows={4} className={`${inputClass} h-auto resize-none py-3`} placeholder="Sizes, colours, what's included…" />
        )}
      </Field>

      {product?.status === "approved" && (
        <p className="text-[12.5px] text-muted">Changing the price or stock keeps it on sale. Changing the name, photos, category, description or the option choices sends it for a quick check first.</p>
      )}
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>
          {product ? "Save changes" : `Add ${noun}`}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
