"use client";

import { cleanOptions, combinations, rowKey, rowOf, variantLabel, type OptionDraft, type OptionsDraft, type RowDraft } from "@yanabuy/shared";
import { TextInput } from "@yanabuy/web-kit";

export { collectOptions, draftFrom, type OptionsDraft } from "@yanabuy/shared";

/** Colour / size / MOQ choices on the seller's product form, with a price and stock for each combination. */

const PLACEHOLDER = [
  ["Colour", "Red, Blue, Black"],
  ["Size", "S, M, L, XL"],
  ["Material", "Cotton, Silk"],
];

export function OptionsEditor({ value, onChange, error }: { value: OptionsDraft; onChange: (d: OptionsDraft) => void; error?: string | null }) {
  const options = cleanOptions(value);
  const combos = options.length && options.every((o) => o.name && o.values.length) ? combinations(options) : [];
  const setOption = (i: number, patch: Partial<OptionDraft>) => onChange({ ...value, options: value.options.map((o, n) => (n === i ? { ...o, ...patch } : o)) });
  const setRow = (values: string[], patch: Partial<RowDraft>) => onChange({ ...value, rows: { ...value.rows, [rowKey(values)]: { ...rowOf(value, values), ...patch } } });
  const fillAll = (field: "price" | "stock") => {
    const first = combos.map((c) => rowOf(value, c)[field]).find((v) => v && v.trim());
    if (!first) return;
    const rows = { ...value.rows };
    for (const c of combos) {
      const cur = rowOf(value, c);
      if (cur.on) rows[rowKey(c)] = { ...cur, [field]: first };
    }
    onChange({ ...value, rows });
  };
  const on = combos.filter((c) => rowOf(value, c).on).length;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-ground p-4">
      <div>
        <p className="text-sm font-bold">Options (optional)</p>
        <p className="text-[12.5px] text-muted">For colours, sizes or minimum order quantity. Each combination gets its own price and stock.</p>
      </div>
      {value.options.map((o, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl bg-white p-3">
          <div className="flex items-center gap-2">
            <TextInput aria-label={`Option ${i + 1} name`} value={o.name} onChange={(e) => setOption(i, { name: e.target.value })} placeholder={PLACEHOLDER[i][0]} maxLength={40} />
            <button type="button" onClick={() => onChange({ ...value, options: value.options.filter((_, n) => n !== i) })} className="shrink-0 text-[13px] font-bold text-danger hover:underline">
              Remove
            </button>
          </div>
          <TextInput aria-label={`Option ${i + 1} choices`} value={o.values} onChange={(e) => setOption(i, { values: e.target.value })} placeholder={`Choices, separated by commas: ${PLACEHOLDER[i][1]}`} />
        </div>
      ))}
      {value.options.length < 3 && (
        <button
          type="button"
          onClick={() => onChange({ ...value, options: [...value.options, { name: "", values: "" }] })}
          className="self-start rounded-full border border-dashed border-purple px-4 py-2 text-[13px] font-bold text-purple hover:bg-purple-tint"
        >
          + Add {value.options.length ? "another option" : "an option (colour, size…)"}
        </button>
      )}

      {combos.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="font-bold text-soft">
              Selling {on} of {combos.length} combinations
            </span>
            <span className="flex gap-3">
              <button type="button" onClick={() => fillAll("price")} className="font-bold text-purple hover:underline">
                Same price for all
              </button>
              <button type="button" onClick={() => fillAll("stock")} className="font-bold text-purple hover:underline">
                Same stock for all
              </button>
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {combos.map((c) => {
              const r = rowOf(value, c);
              const label = variantLabel(c);
              return (
                <li key={rowKey(c)} className={`flex flex-col gap-2 rounded-xl border border-line bg-white p-3 ${r.on ? "" : "opacity-60"}`}>
                  <label className="flex items-center gap-2.5 text-sm font-bold">
                    <input type="checkbox" checked={r.on} onChange={(e) => setRow(c, { on: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--c-purple))]" />
                    {label}
                    {!r.on && <span className="font-normal text-muted">— not sold</span>}
                  </label>
                  {r.on && (
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ["price", "Price ($)", "decimal", "24.99"],
                          ["compareAtPrice", "Old price", "decimal", ""],
                          ["stock", "Stock", "numeric", "—"],
                        ] as const
                      ).map(([field, title, mode, ph]) => (
                        <label key={field} className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">
                          {title}
                          <TextInput aria-label={`${label} ${title}`} inputMode={mode} value={r[field]} onChange={(e) => setRow(c, { [field]: e.target.value })} placeholder={ph} className="h-10" />
                        </label>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {combos.length > 100 && <p className="text-xs font-semibold text-danger">That's {combos.length} combinations — the most is 100. Remove some choices.</p>}
      {error && <p className="text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}
