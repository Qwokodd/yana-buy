"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { COUNTRIES, countryInfo, formatLiberianPhone, ID_TYPE_LABEL, SHOP_KIND_LABEL, type AdminShop, type Country, type ShopKind, type ShopStatus } from "@yanabuy/shared";
import { Alert, Avatar, Badge, Button, Field, TextInput, messageOf } from "@yanabuy/web-kit";
import { api } from "@/lib/api";
import { when, whenTime } from "@/lib/labels";
import { EmptyPanel, Pager, PillTabs, SearchBox, ShopStatusBadge, Tile } from "./bits";

type StatusTab = "all" | ShopStatus;
type KindTab = "all" | ShopKind;

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Waiting" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Sent back" },
  { value: "suspended", label: "Suspended" },
];

/**
 * List of shops and restaurants on the left, the selected one on the right.
 * Used by both Approvals (only waiting shops) and Vendors (everything).
 */
export function ShopsBrowser({ queue = false }: { queue?: boolean }) {
  const [status, setStatus] = useState<StatusTab>(queue ? "pending" : "all");
  const [kind, setKind] = useState<KindTab>("all");
  const [country, setCountry] = useState<"all" | Country>("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminShop[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setSelectedId(id);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .shops({ status: status === "all" ? undefined : status, kind: kind === "all" ? undefined : kind, country: country === "all" ? undefined : country, q: search || undefined, page })
      .then((res) => {
        setRows(res.items);
        setTotal(res.total);
        setError(null);
        // In the queue, open the oldest waiting shop straight away.
        if (queue) setSelectedId((cur) => cur ?? res.items[0]?.id ?? null);
      })
      .catch((err) => setError(messageOf(err)))
      .finally(() => setLoading(false));
  }, [status, kind, country, search, page, queue]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / 25));

  function changed(shop: AdminShop, done: string) {
    if (queue && shop.status !== "pending") {
      setFlash(done);
      // Reviewed: drop it from the queue and move on to the next one.
      const rest = rows.filter((r) => r.id !== shop.id);
      setRows(rest);
      setTotal((t) => Math.max(0, t - 1));
      return rest[0]?.id ?? null;
    }
    setRows((prev) => prev.map((r) => (r.id === shop.id ? { ...r, ...shop } : r)));
    return shop.id;
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {!queue && (
          <PillTabs
            label="Status"
            tabs={STATUS_TABS}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
        )}
        <PillTabs
          label="Type"
          tabs={[
            { value: "all", label: queue ? "Shops & restaurants" : "Both" },
            { value: "store", label: "Shops" },
            { value: "restaurant", label: "Restaurants" },
          ]}
          value={kind}
          onChange={(v) => {
            setKind(v);
            setPage(1);
          }}
        />
        <PillTabs
          label="Country"
          tabs={[{ value: "all" as const, label: "All countries" }, ...COUNTRIES.map((c) => ({ value: c.code, label: `${c.flag} ${c.name}` }))]}
          value={country}
          onChange={(v) => {
            setCountry(v);
            setPage(1);
          }}
        />
        <SearchBox
          label="Search shops"
          value={query}
          onChange={setQuery}
          onSubmit={() => {
            setSearch(query.trim());
            setPage(1);
          }}
          placeholder="Shop, owner, phone or city"
        />
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="overflow-hidden rounded-card border border-line bg-white">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-[#FBF9FC] text-[11.5px] font-bold uppercase tracking-[0.6px] text-muted">
              <tr>
                <th className="px-[18px] py-3">{queue ? "Waiting" : "Shop"}</th>
                <th className="px-3 py-3">Owner</th>
                <th className="px-3 py-3">City</th>
                <th className="px-3 py-3">Sent</th>
                {!queue && <th className="px-3 py-3">Status</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`cursor-pointer border-t border-[#F0EAF2] hover:bg-[#FBF9FC] ${selectedId === s.id ? "bg-purple-tint/60" : ""}`}
                >
                  <td className="px-[18px] py-3">
                    <button className="flex items-center gap-2.5 text-left" onClick={() => setSelectedId(s.id)}>
                      <Tile name={s.name} url={s.logoUrl} size={36} />
                      <span>
                        <span className="block font-bold">{s.name}</span>
                        <span className="text-xs text-muted">
                          {countryInfo(s.country).flag} {SHOP_KIND_LABEL[s.kind]}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <span className="block font-semibold">{s.owner.fullName}</span>
                    <span className="text-xs text-muted">{formatLiberianPhone(s.owner.phone)}</span>
                  </td>
                  <td className="px-3 py-3 text-soft">{s.city}</td>
                  <td className="px-3 py-3 text-muted">{when(s.submittedAt)}</td>
                  {!queue && (
                    <td className="px-3 py-3">
                      <ShopStatusBadge status={s.status} />
                    </td>
                  )}
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted">
                    {queue ? "Nothing waiting — you're all caught up." : `No shops here${search ? ` matching “${search}”` : ""}.`}
                  </td>
                </tr>
              )}
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager page={page} pages={pages} onPage={setPage} />
        </div>

        <div className="flex flex-col gap-3">
          {flash && <Alert tone="success">{flash}</Alert>}
          {selectedId ? (
            <ShopPanel
              key={selectedId}
              id={selectedId}
              onChanged={(shop, done) => setSelectedId(changed(shop, done))}
              onOpen={() => queue || setFlash(null)}
            />
          ) : (
            <EmptyPanel>{queue ? "When someone applies to sell, their shop and ID photos show up here." : "Pick a shop to see its details and ID photos."}</EmptyPanel>
          )}
        </div>
      </div>
    </>
  );
}

const CHECKS = [
  "The ID photo is clear and every corner is visible",
  "The face in the selfie matches the ID",
  "The name on the ID matches the owner's name",
  "The shop details look real (name, address, phone)",
];

const QUICK_REASONS = [
  "The ID photo is blurry — please take a clearer one",
  "The selfie doesn't match the ID",
  "The ID looks expired — please use a valid one",
  "Please add your full shop address",
];

function ShopPanel({ id, onChanged, onOpen }: { id: string; onChanged: (s: AdminShop, done: string) => void; onOpen?: () => void }) {
  const [shop, setShop] = useState<AdminShop | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false));
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    onOpen?.();
    api.admin
      .shop(id)
      .then((res) => setShop(res.shop))
      .catch((err) => setError(messageOf(err)));
  }, [id]);

  async function run(action: () => Promise<{ shop: AdminShop }>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await action();
      setShop(res.shop);
      setNotice(done);
      setReason("");
      setAsking(false);
      onChanged(res.shop, done);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (!shop) return <div className="rounded-[20px] border border-line bg-white p-6 text-sm text-muted">{error ?? "Loading…"}</div>;

  const docs = shop.documents;
  const allChecked = checked.every(Boolean);
  const reasonBox = (label: string, placeholder: string) => (
    <>
      <Field label={label}>
        {(fid) => (
          <textarea
            id={fid}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            className="resize-none rounded-[12px] border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-purple"
          />
        )}
      </Field>
    </>
  );

  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-[22px]" aria-label={`${shop.name} details`}>
      <div className="flex items-start gap-3">
        <Tile name={shop.name} url={shop.logoUrl} size={56} rounded="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-extrabold leading-tight">{shop.name}</p>
          <p className="text-[12.5px] text-muted">
            {SHOP_KIND_LABEL[shop.kind]} · sent {whenTime(shop.submittedAt)}
          </p>
        </div>
        <ShopStatusBadge status={shop.status} />
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
      {shop.statusReason && (shop.status === "rejected" || shop.status === "suspended") && (
        <Alert tone="warn">
          {shop.status === "rejected" ? "Sent back" : "Suspended"}
          {shop.reviewedBy ? ` by ${shop.reviewedBy.fullName}` : ""}: {shop.statusReason}
        </Alert>
      )}

      <dl className="grid gap-2 text-[13px]">
        <Row label="Country">
          <span className="flex flex-wrap items-center gap-2">
            {countryInfo(shop.country).flag} {countryInfo(shop.country).name}
            {COUNTRIES.filter((c) => c.code !== shop.country).map((c) => (
              <button
                key={c.code}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Move ${shop.name} to ${c.name}? It will only show to shoppers in ${c.name}.`)) run(() => api.admin.setShopCountry(shop.id, c.code), `${shop.name} now sells in ${c.name}.`);
                }}
                className="rounded-full border border-line-strong px-2.5 py-0.5 text-[12px] font-bold text-purple hover:border-purple"
              >
                Move to {c.name}
              </button>
            ))}
          </span>
        </Row>
        <Row label="Phone">{formatLiberianPhone(shop.phone)}</Row>
        <Row label="Address">
          {shop.address}, {shop.city}
        </Row>
        {shop.description && <Row label="About">{shop.description}</Row>}
      </dl>

      <div className="flex items-center gap-3 rounded-2xl bg-ground p-3">
        <Avatar name={shop.owner.fullName} url={shop.owner.avatarUrl} size={40} />
        <div className="min-w-0 flex-1 text-[13px]">
          <p className="font-bold">{shop.owner.fullName}</p>
          <p className="text-muted">
            {formatLiberianPhone(shop.owner.phone)} · joined {when(shop.owner.createdAt)}
          </p>
        </div>
        {shop.owner.status === "blocked" && <Badge tone="danger">Blocked</Badge>}
        <Link href={`/people?id=${shop.owner.id}`} className="text-[12.5px] font-bold text-purple hover:underline">
          Account
        </Link>
      </div>

      {shop.importedFrom === "shopify" && (
        <HandOver
          shopName={shop.name}
          waiting={shop.owner.unclaimed}
          onDone={(owner) => {
            setShop({ ...shop, phone: owner.phone, owner: { ...shop.owner, id: owner.id, fullName: owner.fullName, phone: owner.phone, unclaimed: false, status: "active" } });
            setNotice(`${shop.name} now belongs to ${owner.fullName}. They can manage it from their account.`);
          }}
          shopId={shop.id}
        />
      )}

      {docs && shop.importedFrom !== "shopify" && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-bold">
            ID check <span className="font-semibold text-muted">· {ID_TYPE_LABEL[docs.idType]}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <DocPhoto label="Front of ID" url={docs.idFrontUrl} />
            {docs.idBackUrl ? <DocPhoto label="Back of ID" url={docs.idBackUrl} /> : <DocMissing label="Back of ID" note="Not needed for a passport" />}
            <DocPhoto label="Selfie" url={docs.selfieUrl} tall />
          </div>
          <p className="text-[11.5px] text-muted">These photos are private. Links stop working after an hour — reload to see them again.</p>
        </div>
      )}

      {shop.status === "pending" && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          {!asking ? (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-[13px] font-bold">Before approving, check that:</legend>
                {CHECKS.map((c, i) => (
                  <label key={c} className="flex items-start gap-2.5 text-[13px]">
                    <input
                      type="checkbox"
                      checked={checked[i]}
                      onChange={(e) => setChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
                      className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-purple))]"
                    />
                    {c}
                  </label>
                ))}
              </fieldset>
              <div className="flex gap-2">
                <Button
                  variant="success"
                  className="flex-1"
                  busy={busy}
                  disabled={!allChecked}
                  onClick={() => run(() => api.admin.approveShop(shop.id), `${shop.name} is approved. ${shop.owner.fullName} can start selling.`)}
                >
                  Approve
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setAsking(true)} disabled={busy}>
                  Ask for changes
                </Button>
              </div>
              {!allChecked && <p className="text-[11.5px] text-muted">Tick every check to approve.</p>}
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REASONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setReason(q)}
                    className="rounded-full border border-line-strong px-3 py-1 text-[12px] font-semibold text-soft hover:border-purple hover:text-purple"
                  >
                    {q}
                  </button>
                ))}
              </div>
              {reasonBox("What should they fix? (they'll see this)", "e.g. The selfie is too dark")}
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  className="flex-1"
                  busy={busy}
                  disabled={reason.trim().length < 3}
                  onClick={() => run(() => api.admin.rejectShop(shop.id, reason), `Sent back to ${shop.owner.fullName} with your note.`)}
                >
                  Send back
                </Button>
                <Button variant="ghost" onClick={() => setAsking(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {shop.status === "approved" && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          {reasonBox("Suspend this shop — reason (the owner will see it)", "e.g. Several customers reported fake products")}
          <Button
            variant="danger"
            busy={busy}
            disabled={reason.trim().length < 3}
            onClick={() => run(() => api.admin.suspendShop(shop.id, reason), `${shop.name} is suspended.`)}
          >
            Suspend shop
          </Button>
        </div>
      )}

      {shop.status === "suspended" && (
        <Button variant="success" busy={busy} onClick={() => run(() => api.admin.reinstateShop(shop.id), `${shop.name} is open again.`)}>
          Reinstate shop
        </Button>
      )}

      {shop.status === "rejected" && <p className="text-[12.5px] text-muted">Waiting for the owner to fix it and send it again.</p>}
    </section>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[76px_1fr] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

export function DocPhoto({ label, url, tall }: { label: string; url: string; tall?: boolean }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`group relative block overflow-hidden rounded-xl border border-line bg-ground ${tall ? "col-span-2 aspect-[4/3]" : "aspect-[1.58]"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="h-full w-full object-contain" />
      <span className="absolute left-2 top-2 rounded-full bg-ink/75 px-2 py-0.5 text-[11px] font-bold text-white">{label}</span>
      <span className="absolute bottom-2 right-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-purple opacity-0 group-hover:opacity-100">
        Open full size ↗
      </span>
    </a>
  );
}

export function DocMissing({ label, note }: { label: string; note: string }) {
  return (
    <div className="flex aspect-[1.58] flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-[#FBF9FC] p-2 text-center">
      <span className="text-[12px] font-bold text-soft">{label}</span>
      <span className="text-[11px] text-muted">{note}</span>
    </div>
  );
}

/** Shops brought over from Shopify start with a placeholder owner until the real owner signs up. */
function HandOver({ shopId, shopName, waiting, onDone }: { shopId: string; shopName: string; waiting: boolean; onDone: (owner: { id: string; fullName: string; phone: string }) => void }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!waiting) {
    return <p className="rounded-2xl bg-ground p-3 text-[12.5px] text-muted">Brought over from the old Shopify store and handed over to its owner. No ID photos are on file — ask for them if you need to.</p>;
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.admin.handOverShop(shopId, phone);
      onDone(res.owner);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-2xl border border-amber/60 bg-amber-tint/60 p-3">
      <p className="text-[13px] font-bold">From the old Shopify store — not handed over yet</p>
      <p className="text-[12.5px] text-soft">
        Ask the owner of {shopName} to sign up on YanaBuy with their own phone number, then type that number here. They get the shop with all its products. (No ID photos are on file for imported shops.)
      </p>
      <div className="flex flex-wrap gap-2">
        <TextInput aria-label="Owner's phone number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Owner's phone, e.g. 0770 123 456" className="max-w-xs" />
        <Button type="submit" size="sm" busy={busy} disabled={phone.trim().length < 7}>
          Hand over shop
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </form>
  );
}
