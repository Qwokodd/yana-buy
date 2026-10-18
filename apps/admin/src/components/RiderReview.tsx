"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  formatLiberianPhone,
  ID_TYPE_LABEL,
  RIDER_NEEDS_LICENSE,
  RIDER_VEHICLE_LABEL,
  type AdminRiderApplication,
  type RiderApplicationStatus,
} from "@yanabuy/shared";
import { Alert, Avatar, Badge, Button, Field, messageOf } from "@yanabuy/web-kit";
import { api } from "@/lib/api";
import { when, whenTime } from "@/lib/labels";
import { EmptyPanel, PillTabs } from "./bits";
import { DocMissing, DocPhoto, Row } from "./ShopReview";

type Tab = RiderApplicationStatus | "all";

const TONE: Record<RiderApplicationStatus, "warn" | "success" | "neutral" | "danger"> = { pending: "warn", approved: "success", rejected: "neutral", suspended: "danger" };
const WORD: Record<RiderApplicationStatus, string> = { pending: "Waiting", approved: "Approved", rejected: "Sent back", suspended: "Suspended" };

export function RiderStatusBadge({ status }: { status: RiderApplicationStatus }) {
  return <Badge tone={TONE[status]}>{WORD[status]}</Badge>;
}

/** Rider applications on the left, the chosen one on the right. `queue` = Approvals (waiting only). */
export function RiderApplicationsBrowser({ queue = false, onCount }: { queue?: boolean; onCount?: (n: number) => void }) {
  const [tab, setTab] = useState<Tab>(queue ? "pending" : "all");
  const [items, setItems] = useState<AdminRiderApplication[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.admin
      .riderApplications(tab)
      .then((res) => {
        setItems(res.items);
        setSelected((cur) => (cur && res.items.some((a) => a.id === cur) ? cur : queue ? (res.items[0]?.id ?? null) : cur));
      })
      .catch((err) => setError(messageOf(err)));
  }, [tab, queue]);
  useEffect(load, [load]);

  function changed(a: AdminRiderApplication, done: string) {
    setFlash(done);
    if (queue && a.status !== "pending") {
      const rest = (items ?? []).filter((x) => x.id !== a.id);
      setItems(rest);
      onCount?.(rest.length);
      setSelected(rest[0]?.id ?? null);
    } else setItems((prev) => (prev ?? []).map((x) => (x.id === a.id ? a : x)));
  }

  return (
    <>
      {!queue && (
        <div className="mb-4">
          <PillTabs
            label="Status"
            tabs={[
              { value: "all", label: "All" },
              { value: "pending", label: "Waiting" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Sent back" },
              { value: "suspended", label: "Suspended" },
            ]}
            value={tab}
            onChange={(v) => {
              setTab(v);
              setItems(null);
            }}
          />
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="overflow-hidden rounded-card border border-line bg-white" aria-label="Rider applications">
          {items === null && <p className="p-6 text-sm text-muted">Loading…</p>}
          {items?.length === 0 && <p className="px-6 py-12 text-center text-sm text-muted">{queue ? "No rider applications waiting." : "No rider applications yet."}</p>}
          <ul>
            {items?.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => {
                    setSelected(a.id);
                    if (!queue) setFlash(null);
                  }}
                  aria-current={a.id === selected ? "true" : undefined}
                  className={`flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 ${a.id === selected ? "bg-purple-tint/50" : "hover:bg-ground"}`}
                >
                  <Avatar name={a.user.fullName} url={a.user.avatarUrl} size={42} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{a.user.fullName}</span>
                    <span className="block truncate text-xs text-muted">
                      {RIDER_VEHICLE_LABEL[a.vehicle]} · {a.city} · sent {when(a.submittedAt)}
                    </span>
                  </span>
                  <RiderStatusBadge status={a.status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          {flash && <Alert tone="success">{flash}</Alert>}
          {selected ? (
            <RiderPanel key={selected} id={selected} onChanged={changed} />
          ) : (
            <EmptyPanel>{queue ? "When someone applies to deliver, their details and ID photos show up here." : "Pick an application to see it."}</EmptyPanel>
          )}
        </div>
      </div>
    </>
  );
}

const CHECKS = [
  "The ID photo is clear and every corner is visible",
  "The face in the selfie matches the ID",
  "The name on the ID matches the account name",
  "The licence is valid and matches the ID (motorbike, keke, car)",
];

const QUICK_REASONS = [
  "The ID photo is blurry — please take a clearer one",
  "The selfie doesn't match the ID",
  "The driver's licence is missing or expired",
  "Please add a reachable emergency contact",
];

function RiderPanel({ id, onChanged }: { id: string; onChanged: (a: AdminRiderApplication, done: string) => void }) {
  const [a, setA] = useState<AdminRiderApplication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false));
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    api.admin
      .riderApplication(id)
      .then((res) => setA(res.application))
      .catch((err) => setError(messageOf(err)));
  }, [id]);

  async function run(action: () => Promise<{ application: AdminRiderApplication }>, done: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      setA(res.application);
      setAsking(false);
      setReason("");
      onChanged(res.application, done);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (!a) return <div className="rounded-[20px] border border-line bg-white p-6 text-sm text-muted">{error ?? "Loading…"}</div>;

  const motor = RIDER_NEEDS_LICENSE.includes(a.vehicle);
  const checks = motor ? CHECKS : CHECKS.slice(0, 3);
  const allChecked = checks.every((_, i) => checked[i]);
  const reasonBox = (label: string, placeholder: string) => (
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
  );

  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-[22px]" aria-label={`Rider application from ${a.user.fullName}`}>
      <div className="flex items-start gap-3">
        <Avatar name={a.user.fullName} url={a.user.avatarUrl} size={52} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-extrabold leading-tight">{a.user.fullName}</p>
          <p className="text-[12.5px] text-muted">
            {formatLiberianPhone(a.user.phone)} · joined {when(a.user.createdAt)} · sent {whenTime(a.submittedAt)}
          </p>
        </div>
        <RiderStatusBadge status={a.status} />
      </div>
      {error && <Alert>{error}</Alert>}
      {a.statusReason && (a.status === "rejected" || a.status === "suspended") && (
        <Alert tone="warn">
          {a.status === "rejected" ? "Sent back" : "Suspended"}
          {a.reviewedBy ? ` by ${a.reviewedBy.fullName}` : ""}: {a.statusReason}
        </Alert>
      )}
      {a.user.status === "blocked" && <Alert>This account is blocked.</Alert>}

      <dl className="grid gap-2 text-[13px]">
        <Row label="Vehicle">
          {RIDER_VEHICLE_LABEL[a.vehicle]}
          {a.plateNumber ? ` · plate ${a.plateNumber}` : ""}
        </Row>
        <Row label="Covers">
          {a.areas} ({a.city})
        </Row>
        <Row label="Emergency">
          {a.emergencyName} · {formatLiberianPhone(a.emergencyPhone)}
        </Row>
        <Row label="Account">
          <Link href={`/people?id=${a.user.id}`} className="text-purple hover:underline">
            Open in Buyers &amp; accounts
          </Link>
        </Row>
      </dl>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-bold">
          ID check <span className="font-semibold text-muted">· {ID_TYPE_LABEL[a.documents.idType]}</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <DocPhoto label="Front of ID" url={a.documents.idFrontUrl} />
          {a.documents.idBackUrl ? <DocPhoto label="Back of ID" url={a.documents.idBackUrl} /> : <DocMissing label="Back of ID" note="Not needed for a passport" />}
          {a.documents.licenseUrl ? (
            <DocPhoto label="Driver's licence" url={a.documents.licenseUrl} />
          ) : (
            <DocMissing label="Driver's licence" note={motor ? "Missing" : "Not needed for this vehicle"} />
          )}
          <DocPhoto label="Selfie" url={a.documents.selfieUrl} />
        </div>
        <p className="text-[11.5px] text-muted">These photos are private. Links stop working after an hour — reload to see them again.</p>
      </div>

      {a.status === "pending" && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          {!asking ? (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-[13px] font-bold">Before approving, check that:</legend>
                {checks.map((c, i) => (
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
                  onClick={() => run(() => api.admin.approveRider(a.id), `${a.user.fullName} is now a rider. They'll find their deliveries in the app: Profile → My deliveries.`)}
                >
                  Approve rider
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
              {reasonBox("What should they fix? (they'll see this)", "e.g. The licence photo is blurry")}
              <div className="flex gap-2">
                <Button variant="danger" className="flex-1" busy={busy} disabled={reason.trim().length < 3} onClick={() => run(() => api.admin.rejectRider(a.id, reason), `Sent back to ${a.user.fullName} with your note.`)}>
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

      {a.status === "approved" && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          {reasonBox("Suspend this rider — reason (they'll see it)", "e.g. Repeated late deliveries")}
          <Button variant="danger" busy={busy} disabled={reason.trim().length < 3} onClick={() => run(() => api.admin.suspendRider(a.id, reason), `${a.user.fullName} is suspended and can't take deliveries.`)}>
            Suspend rider
          </Button>
        </div>
      )}
      {a.status === "suspended" && (
        <Button variant="success" busy={busy} onClick={() => run(() => api.admin.reinstateRider(a.id), `${a.user.fullName} is a rider again.`)}>
          Reinstate rider
        </Button>
      )}
      {a.status === "rejected" && <p className="text-[12.5px] text-muted">Waiting for them to fix it and send it again.</p>}
    </section>
  );
}
