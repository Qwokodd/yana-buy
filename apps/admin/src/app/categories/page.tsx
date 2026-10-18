"use client";

import { useEffect, useState } from "react";
import type { CatalogKind, Category } from "@yanabuy/shared";
import { Alert, Badge, Button, ImageUpload, TextInput, fieldErrorsOf, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { MoveButtons, Tile } from "@/components/bits";
import { api } from "@/lib/api";

const SIDES: { kind: CatalogKind; title: string; hint: string; example: string }[] = [
  { kind: "goods", title: "Goods & Services", hint: "Shown when shoppers are on Goods & Services.", example: "e.g. Electronics" },
  { kind: "food", title: "Food", hint: "Shown when shoppers are on Food.", example: "e.g. Jollof & rice" },
];

export default function CategoriesPage() {
  const [items, setItems] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .categories()
      .then((res) => setItems(res.items))
      .catch((err) => setError(messageOf(err)));
  }, []);

  return (
    <AdminShell title="Categories" subtitle="What shoppers browse by on the website and the app. Changes show up straight away.">
      {error && <Alert>{error}</Alert>}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        {SIDES.map((side) => (
          <CategoryColumn
            key={side.kind}
            {...side}
            items={(items ?? []).filter((c) => c.kind === side.kind)}
            loading={!items && !error}
            onItems={(next) => setItems((all) => [...(all ?? []).filter((c) => c.kind !== side.kind), ...next])}
          />
        ))}
      </div>
    </AdminShell>
  );
}

function CategoryColumn({
  kind,
  title,
  hint,
  example,
  items,
  loading,
  onItems,
}: {
  kind: CatalogKind;
  title: string;
  hint: string;
  example: string;
  items: Category[];
  loading: boolean;
  onItems: (items: Category[]) => void;
}) {
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { category } = await api.admin.createCategory({ kind, name, iconUrl: icon[0] ?? null });
      onItems([...sorted, category]);
      setName("");
      setIcon([]);
      setNotice(`“${category.name}” added.`);
    } catch (err) {
      setError(fieldErrorsOf(err).name ?? messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, by: -1 | 1) {
    const next = [...sorted];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onItems(next.map((c, i) => ({ ...c, sortOrder: i })));
    try {
      const res = await api.admin.reorderCategories(next.map((c) => c.id));
      onItems(res.items.filter((c) => c.kind === kind));
    } catch (err) {
      setError(messageOf(err));
      onItems(sorted);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-[22px]" aria-label={`${title} categories`}>
      <div>
        <h2 className="font-display text-lg font-extrabold">{title}</h2>
        <p className="text-[12.5px] text-muted">{hint}</p>
      </div>

      <form onSubmit={add} className="flex items-end gap-3 rounded-2xl bg-ground p-3" noValidate>
        <ImageUpload api={api} images={icon} onChange={setIcon} max={1} />
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={`new-${kind}`} className="text-[13px] font-bold">
            New category
          </label>
          <TextInput id={`new-${kind}`} value={name} onChange={(e) => setName(e.target.value)} placeholder={example} maxLength={40} />
        </div>
        <Button type="submit" busy={busy} disabled={name.trim().length < 2}>
          Add
        </Button>
      </form>
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <ul className="flex flex-col">
        {sorted.map((c, i) => (
          <CategoryRow
            key={c.id}
            category={c}
            onUp={i > 0 ? () => move(i, -1) : undefined}
            onDown={i < sorted.length - 1 ? () => move(i, 1) : undefined}
            onSaved={(saved) => onItems(sorted.map((x) => (x.id === saved.id ? saved : x)))}
            onDeleted={() => onItems(sorted.filter((x) => x.id !== c.id))}
          />
        ))}
        {loading && <li className="py-6 text-center text-sm text-muted">Loading…</li>}
        {!loading && sorted.length === 0 && <li className="py-6 text-center text-sm text-muted">No categories yet — add the first one above.</li>}
      </ul>
    </section>
  );
}

function CategoryRow({
  category,
  onUp,
  onDown,
  onSaved,
  onDeleted,
}: {
  category: Category;
  onUp?: () => void;
  onDown?: () => void;
  onSaved: (c: Category) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState<string[]>(category.iconUrl ? [category.iconUrl] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: { name?: string; iconUrl?: string | null; visible?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.admin.updateCategory(category.id, patch);
      onSaved(res.category);
      setEditing(false);
    } catch (err) {
      setError(fieldErrorsOf(err).name ?? messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete “${category.name}”? Shoppers won't see it any more.`)) return;
    setBusy(true);
    try {
      await api.admin.deleteCategory(category.id);
      onDeleted();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0">
        <div className="flex items-end gap-3">
          <ImageUpload api={api} images={icon} onChange={setIcon} max={1} />
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor={`name-${category.id}`} className="text-[13px] font-bold">
              Name
            </label>
            <TextInput id={`name-${category.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </div>
        </div>
        {error && <p className="text-xs font-semibold text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" busy={busy} onClick={() => save({ name, iconUrl: icon[0] ?? null })}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
      <MoveButtons name={category.name} onUp={onUp} onDown={onDown} disabled={busy} />
      <Tile name={category.name} url={category.iconUrl} size={40} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-bold ${category.visible ? "" : "text-muted line-through"}`}>{category.name}</p>
        {error && <p className="text-xs font-semibold text-danger">{error}</p>}
      </div>
      {!category.visible && <Badge>Hidden</Badge>}
      <button onClick={() => save({ visible: !category.visible })} disabled={busy} className="text-[12.5px] font-bold text-soft hover:text-ink">
        {category.visible ? "Hide" : "Show"}
      </button>
      <button onClick={() => setEditing(true)} className="text-[12.5px] font-bold text-purple hover:underline">
        Edit
      </button>
      <button onClick={remove} disabled={busy} className="text-[12.5px] font-bold text-danger hover:underline">
        Delete
      </button>
    </li>
  );
}
