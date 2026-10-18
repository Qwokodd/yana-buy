"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminUser, Shop, UserRole } from "@yanabuy/shared";
import Link from "next/link";
import { ShopStatusBadge, Tile } from "@/components/bits";
import { formatLiberianPhone } from "@yanabuy/shared";
import { Alert, Avatar, Badge, Button, Field, messageOf, useAuth } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { ROLE_LABEL, when } from "@/lib/labels";

type Tab = "all" | UserRole | "blocked";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "buyer", label: "Buyers" },
  { value: "vendor", label: "Vendors" },
  { value: "rider", label: "Riders" },
  { value: "admin", label: "Admins" },
  { value: "blocked", label: "Blocked" },
];

export default function PeoplePage() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) setSelectedId(id);
    const role = params.get("role");
    if (role && TABS.some((t) => t.value === role)) setTab(role as Tab);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .users({
        role: tab !== "all" && tab !== "blocked" ? tab : undefined,
        status: tab === "blocked" ? "blocked" : undefined,
        q: search || undefined,
        page,
      })
      .then((res) => {
        setRows(res.items);
        setTotal(res.total);
        setError(null);
      })
      .catch((err) => setError(messageOf(err)))
      .finally(() => setLoading(false));
  }, [tab, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / 25));

  return (
    <AdminShell title="Buyers & accounts" subtitle="Buyers can shop straight after signing up. Block anyone who breaks the rules.">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => {
              setTab(t.value);
              setPage(1);
            }}
            aria-pressed={tab === t.value}
            className={`h-9 rounded-full px-4 text-[13px] font-bold ${
              tab === t.value ? "bg-purple text-white" : "border border-line-strong bg-white text-soft hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query.trim());
            setPage(1);
          }}
          className="ml-auto flex gap-2"
        >
          <label className="flex h-10 w-72 items-center gap-2 rounded-full border border-line-strong bg-white px-4">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="#6B6275" strokeWidth="2" />
              <path d="m20 20-3.5-3.5" stroke="#6B6275" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="sr-only">Search accounts</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone or email" className="flex-1 bg-transparent text-sm outline-none" />
          </label>
          <Button type="submit" size="sm">
            Search
          </Button>
        </form>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-hidden rounded-card border border-line bg-white">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-[#FBF9FC] text-[11.5px] font-bold uppercase tracking-[0.6px] text-muted">
              <tr>
                <th className="px-[18px] py-3">Person</th>
                <th className="px-3 py-3">Phone</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Joined</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr
                  key={u.id}
                  className={`cursor-pointer border-t border-[#F0EAF2] hover:bg-[#FBF9FC] ${selectedId === u.id ? "bg-purple-tint/60" : ""}`}
                  onClick={() => setSelectedId(u.id)}
                >
                  <td className="px-[18px] py-3">
                    <button className="flex items-center gap-2.5 text-left font-bold" onClick={() => setSelectedId(u.id)}>
                      <Avatar name={u.fullName} url={u.avatarUrl} size={36} />
                      <span>
                        {u.fullName}
                        {u.id === me?.id && <span className="ml-1 text-xs font-semibold text-muted">(you)</span>}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-soft">{formatLiberianPhone(u.phone)}</td>
                  <td className="px-3 py-3">{ROLE_LABEL[u.role]}</td>
                  <td className="px-3 py-3 text-muted">{when(u.createdAt)}</td>
                  <td className="px-3 py-3">{u.status === "blocked" ? <Badge tone="danger">Blocked</Badge> : <Badge tone="success">Active</Badge>}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted">
                    No accounts here{search ? ` matching “${search}”` : ""}.
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
          {pages > 1 && (
            <div className="flex items-center justify-end gap-4 border-t border-line px-4 py-3 text-[13px]">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="font-bold text-purple disabled:opacity-40">
                ← Previous
              </button>
              <span className="text-muted">
                Page {page} of {pages}
              </span>
              <button disabled={page === pages} onClick={() => setPage((p) => p + 1)} className="font-bold text-purple disabled:opacity-40">
                Next →
              </button>
            </div>
          )}
        </div>

        {selectedId ? (
          <PersonPanel
            key={selectedId}
            id={selectedId}
            isMe={selectedId === me?.id}
            onChanged={(updated) => setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))}
          />
        ) : (
          <div className="rounded-[20px] border border-dashed border-line-strong bg-white/60 p-8 text-center text-sm text-muted">
            Pick someone from the list to see their details, change their role or block them.
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function PersonPanel({ id, isMe, onChanged }: { id: string; isMe: boolean; onChanged: (u: AdminUser) => void }) {
  const [person, setPerson] = useState<AdminUser | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .user(id)
      .then((res) => {
        setPerson(res.user);
        setShop(res.shop);
      })
      .catch((err) => setError(messageOf(err)));
  }, [id]);

  async function run(action: () => Promise<{ user: AdminUser }>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await action();
      setPerson(res.user);
      onChanged(res.user);
      setNotice(done);
      setReason("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (!person) {
    return <div className="rounded-[20px] border border-line bg-white p-6 text-sm text-muted">{error ?? "Loading…"}</div>;
  }

  const blocked = person.status === "blocked";

  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-[22px]" aria-label={`${person.fullName} details`}>
      <div className="flex items-center gap-3">
        <Avatar name={person.fullName} url={person.avatarUrl} size={56} />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-extrabold">{person.fullName}</p>
          <p className="text-[12.5px] text-muted">
            {formatLiberianPhone(person.phone)}
            {person.city ? ` · ${person.city}` : ""}
          </p>
          {person.email && <p className="truncate text-[12.5px] text-muted">{person.email}{person.emailVerified ? " ✓" : " (not confirmed)"}</p>}
        </div>
      </div>

      <Link href={`/messages?user=${person.id}&name=${encodeURIComponent(person.fullName)}`} className="self-start rounded-full border border-line-strong px-4 py-2 text-[13px] font-bold text-purple hover:border-purple">
        ✉️ Send {person.fullName.split(" ")[0]} a message
      </Link>

      <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
        <div className="rounded-xl bg-ground p-2.5">
          <dt className="text-muted">Joined</dt>
          <dd className="font-bold">{when(person.createdAt)}</dd>
        </div>
        <div className="rounded-xl bg-ground p-2.5">
          <dt className="text-muted">Last login</dt>
          <dd className="font-bold">{when(person.lastLoginAt)}</dd>
        </div>
      </dl>

      {shop && (
        <Link href={`/vendors?id=${shop.id}`} className="flex items-center gap-3 rounded-2xl border border-line p-3 hover:border-purple">
          <Tile name={shop.name} url={shop.logoUrl} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{shop.name}</span>
            <span className="text-xs text-muted">{shop.kind === "restaurant" ? "Restaurant" : "Shop"} · open in Vendors</span>
          </span>
          <ShopStatusBadge status={shop.status} />
        </Link>
      )}

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      {blocked && (
        <Alert tone="warn">
          Blocked on {when(person.blockedAt)}: {person.blockedReason}
        </Alert>
      )}

      <Field label="Role" hint={isMe ? "You can't change your own role." : "They'll be signed out so the new role applies next time they log in."}>
        {(fid) => (
          <select
            id={fid}
            value={person.role}
            disabled={isMe || busy}
            onChange={(e) => {
              const role = e.target.value as UserRole;
              if (role === "admin" && !confirm(`Give ${person.fullName} full access to this admin console?`)) return;
              run(() => api.admin.setRole(person.id, role), `${person.fullName} is now ${ROLE_LABEL[role].toLowerCase()}.`);
            }}
            className="h-11 rounded-[12px] border border-line-strong bg-white px-3 text-sm font-semibold disabled:opacity-50"
          >
            {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        )}
      </Field>

      {!isMe &&
        (blocked ? (
          <Button variant="success" busy={busy} onClick={() => run(() => api.admin.unblock(person.id), `${person.fullName} can use YanaBuy again.`)}>
            Unblock this account
          </Button>
        ) : (
          <>
            <Field label="Reason (they'll see this)">
              {(fid) => (
                <textarea
                  id={fid}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Repeated fake orders"
                  className="resize-none rounded-[12px] border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-purple"
                />
              )}
            </Field>
            <Button
              variant="danger"
              busy={busy}
              disabled={reason.trim().length < 3}
              onClick={() => run(() => api.admin.block(person.id, reason), `${person.fullName} is blocked and has been signed out.`)}
            >
              Block this account
            </Button>
          </>
        ))}
    </section>
  );
}
