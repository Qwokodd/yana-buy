"use client";

import { useEffect, useState } from "react";
import {
  COUNTRIES,
  countryInfo,
  type AdminShop,
  type AdminUser,
  type Broadcast,
  type BroadcastAudience,
  type BroadcastChannels,
  type BroadcastPreview,
  type Country,
} from "@yanabuy/shared";
import { Alert, Badge, Button, Field, TextInput, fieldErrorsOf, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { ROLE_LABEL, whenTime } from "@/lib/labels";

const AUDIENCES: { value: BroadcastAudience; label: string }[] = [
  { value: "everyone", label: "Everyone" },
  { value: "buyers", label: "Buyers" },
  { value: "vendors", label: "Vendors" },
  { value: "riders", label: "All riders" },
  { value: "online_riders", label: "Riders online now" },
  { value: "people", label: "Pick people" },
];
const AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  everyone: "Everyone",
  buyers: "Buyers",
  vendors: "Vendors",
  riders: "Riders",
  online_riders: "Riders online",
  people: "Picked people",
  user: "One person",
};

type Picked = { id: string; name: string; detail?: string };

/** Waits until typing stops before searching. */
function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const money = (usd: number) => `$${usd < 10 ? usd.toFixed(2) : Math.round(usd).toLocaleString()}`;

export default function MessagesPage() {
  const [audience, setAudience] = useState<BroadcastAudience>("everyone");
  const [people, setPeople] = useState<Picked[]>([]);
  const [personQ, setPersonQ] = useState("");
  const [personHits, setPersonHits] = useState<AdminUser[]>([]);
  const [country, setCountry] = useState<Country | null>(null);
  const [nearOn, setNearOn] = useState(false);
  const [nearShop, setNearShop] = useState<Picked | null>(null);
  const [shopQ, setShopQ] = useState("");
  const [shopHits, setShopHits] = useState<AdminShop[]>([]);
  const [radiusKm, setRadiusKm] = useState("5");
  const [urgent, setUrgent] = useState(false);
  const [channels, setChannels] = useState<BroadcastChannels>({ app: true, email: true, sms: false });
  const [form, setForm] = useState({ title: "", body: "", link: "" });
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [history, setHistory] = useState<Broadcast[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  // "Send a message" on a person's page opens this with them already picked.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("user");
    if (id) {
      setPeople([{ id, name: q.get("name") ?? "this person" }]);
      setAudience("people");
    }
  }, []);

  const loadHistory = () =>
    api.admin
      .broadcasts()
      .then((r) => setHistory(r.items))
      .catch(() => setHistory([]));
  useEffect(() => {
    loadHistory();
  }, []);
  // Big messages finish in the background: check again while any are still sending.
  useEffect(() => {
    if (!history?.some((b) => b.status === "sending")) return;
    const t = setTimeout(loadHistory, 4000);
    return () => clearTimeout(t);
  }, [history]);

  const pq = useDebounced(personQ.trim());
  useEffect(() => {
    if (pq.length < 2) return setPersonHits([]);
    api.admin
      .users({ q: pq, status: "active" })
      .then((r) => setPersonHits(r.items.slice(0, 8)))
      .catch(() => setPersonHits([]));
  }, [pq]);

  const sq = useDebounced(shopQ.trim());
  useEffect(() => {
    if (sq.length < 2) return setShopHits([]);
    api.admin
      .shops({ q: sq, status: "approved" })
      .then((r) => setShopHits(r.items.slice(0, 8)))
      .catch(() => setShopHits([]));
  }, [sq]);

  const byHand = audience === "people";
  const radius = Number(radiusKm);
  const near = !byHand && nearOn && nearShop && radius > 0 ? { shopId: nearShop.id, radiusKm: radius } : null;
  const target = {
    audience,
    userIds: byHand ? people.map((p) => p.id) : null,
    country: byHand ? null : country,
    near,
    urgent,
  };
  const words = useDebounced({ title: form.title.trim(), body: form.body.trim(), link: form.link.trim() }, 500);
  const targetKey = JSON.stringify(target);

  useEffect(() => {
    setPreviewError(null);
    if (byHand && !people.length) return setPreview(null);
    if (!byHand && nearOn && !near) return setPreview(null);
    api.admin
      .previewBroadcast({ ...target, title: words.title || undefined, body: words.body || undefined, link: words.link || null })
      .then((r) => {
        setPreview(r.preview);
        setChannels((c) => ({ ...c, email: c.email && r.preview.emailOn, sms: c.sms && r.preview.smsOn }));
      })
      .catch((err) => {
        setPreview(null);
        setPreviewError(messageOf(err));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, words.title, words.body, words.link]);

  function markUrgent(on: boolean) {
    setUrgent(on);
    // Urgent news should reach phones straight away: bell + push, and SMS when it's set up.
    if (on) setChannels((c) => ({ ...c, app: true, sms: c.sms || !!preview?.smsOn }));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) return;
    const n = preview.recipients;
    const sms = channels.sms ? `\n\n${preview.withPhone} text message${preview.withPhone === 1 ? "" : "s"} — about ${money(preview.smsCostUsd)} on Twilio.` : "";
    if (!confirm(`${urgent ? "URGENT — " : ""}Send “${form.title}” to ${n} ${n === 1 ? "person" : "people"}?${sms}`)) return;
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      await api.admin.sendBroadcast({ ...form, link: form.link || null, ...target, channels });
      setNotice({ tone: "success", text: n > 50 ? "Sending — big messages take a few minutes. You can leave this page." : "Sent." });
      setForm({ title: "", body: "", link: "" });
      setUrgent(false);
      loadHistory();
    } catch (err) {
      setNotice({ tone: "danger", text: messageOf(err) });
      setFields(fieldErrorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  const pill = (on: boolean) => `h-9 rounded-full px-3.5 text-[13px] font-bold ${on ? "bg-purple text-white" : "border border-line-strong bg-white text-soft"}`;
  const channel = (k: keyof BroadcastChannels, label: string, note: string, enabled: boolean) => (
    <label className={`flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm ${enabled ? "cursor-pointer" : "opacity-55"}`}>
      <input type="checkbox" disabled={!enabled} checked={channels[k]} onChange={(e) => setChannels({ ...channels, [k]: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-purple))]" />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="text-[12.5px] text-muted">{note}</span>
      </span>
    </label>
  );
  const hitList = (children: React.ReactNode) => <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line">{children}</ul>;

  return (
    <AdminShell title="Send a message" subtitle="News or urgent alerts to buyers, vendors, riders or chosen people — in the app, by email and by SMS.">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <form onSubmit={send} className="flex flex-col gap-5 rounded-[20px] border border-line bg-white p-[22px]" noValidate>
          <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${urgent ? "border-danger bg-danger-tint" : "border-line"}`}>
            <input type="checkbox" checked={urgent} onChange={(e) => markUrgent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#C8102E]" />
            <span>
              <span className={`block font-bold ${urgent ? "text-[#A00D26]" : ""}`}>Urgent</span>
              <span className="text-[12.5px] text-muted">Starts with “URGENT:” everywhere and rings phones as a high-priority notification. Use for things people must act on now.</span>
            </span>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-[13px] font-bold">Who gets it</legend>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCES.map((a) => (
                <button key={a.value} type="button" aria-pressed={audience === a.value} onClick={() => setAudience(a.value)} className={pill(audience === a.value)}>
                  {a.label}
                </button>
              ))}
            </div>
            {audience === "online_riders" && <p className="text-[12.5px] text-muted">Riders who are switched on and sent their location in the last 15 minutes.</p>}
            {fields.userIds && <p className="text-[13px] font-semibold text-danger">{fields.userIds}</p>}
          </fieldset>

          {byHand && (
            <div className="flex flex-col gap-2">
              {people.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {people.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-purple-tint py-1 pl-3 pr-1.5 text-[13px] font-semibold text-purple">
                      {p.name}
                      <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPeople(people.filter((x) => x.id !== p.id))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <TextInput value={personQ} onChange={(e) => setPersonQ(e.target.value)} placeholder="Search a name, phone or email to add someone" />
              {personHits.length > 0 &&
                hitList(
                  personHits.map((u) => {
                    const added = people.some((p) => p.id === u.id);
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          disabled={added}
                          onClick={() => {
                            setPeople([...people, { id: u.id, name: u.fullName, detail: u.phone ?? u.email ?? "" }]);
                            setPersonQ("");
                            setPersonHits([]);
                          }}
                          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-[#FBF9FC] disabled:opacity-50"
                        >
                          <span>
                            <span className="font-semibold">{u.fullName}</span> <span className="text-muted">· {ROLE_LABEL[u.role]}</span>
                            <span className="block text-[12.5px] text-muted">{u.phone ?? u.email ?? "No phone"}</span>
                          </span>
                          <span className="text-[12.5px] font-bold text-purple">{added ? "Added" : "Add"}</span>
                        </button>
                      </li>
                    );
                  })
                )}
            </div>
          )}

          {!byHand && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-[13px] font-bold">Country</legend>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={country === null} onClick={() => setCountry(null)} className={pill(country === null)}>
                  Both
                </button>
                {COUNTRIES.map((c) => (
                  <button key={c.code} type="button" aria-pressed={country === c.code} onClick={() => setCountry(c.code)} className={pill(country === c.code)}>
                    {c.flag} {c.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {!byHand && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-[13px] font-bold">Area</legend>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={!nearOn} onClick={() => setNearOn(false)} className={pill(!nearOn)}>
                  Anywhere
                </button>
                <button type="button" aria-pressed={nearOn} onClick={() => setNearOn(true)} className={pill(nearOn)}>
                  Near a shop
                </button>
              </div>
              {nearOn && (
                <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
                  {nearShop ? (
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        Within{" "}
                        <input
                          type="number"
                          min={0.5}
                          max={200}
                          step={0.5}
                          value={radiusKm}
                          onChange={(e) => setRadiusKm(e.target.value)}
                          aria-label="Distance in km"
                          className="mx-1 h-8 w-16 rounded-lg border border-line-strong px-2 text-center"
                        />
                        km of <b>{nearShop.name}</b>
                      </span>
                      <button type="button" onClick={() => setNearShop(null)} className="text-[12.5px] font-bold text-purple">
                        Change shop
                      </button>
                    </div>
                  ) : (
                    <>
                      <TextInput value={shopQ} onChange={(e) => setShopQ(e.target.value)} placeholder="Search a shop or restaurant" />
                      {shopHits.length > 0 &&
                        hitList(
                          shopHits.map((s) => (
                            <li key={s.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setNearShop({ id: s.id, name: s.name });
                                  setShopQ("");
                                  setShopHits([]);
                                }}
                                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-[#FBF9FC]"
                              >
                                <span>
                                  <span className="font-semibold">{s.name}</span>
                                  <span className="block text-[12.5px] text-muted">{s.city}</span>
                                </span>
                                {!s.location && <span className="text-[12px] text-muted">no map pin</span>}
                              </button>
                            </li>
                          ))
                        )}
                    </>
                  )}
                  <p className="text-[12.5px] text-muted">Uses each person’s last known location — people who never shared one are left out.</p>
                </div>
              )}
            </fieldset>
          )}

          <Field label="Title" error={fields.title} hint="The notification heading and the email subject.">
            {(id) => (
              <TextInput
                id={id}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={120}
                invalid={!!fields.title}
                placeholder={urgent ? "e.g. Heavy flooding on Tubman Blvd" : "e.g. Free delivery this weekend!"}
              />
            )}
          </Field>
          <Field label="Message" error={fields.body}>
            {(id) => (
              <textarea id={id} rows={4} maxLength={1000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="rounded-[12px] border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-purple" />
            )}
          </Field>
          <Field label="Link (optional)" error={fields.link} hint="A page on YanaBuy that tapping opens, e.g. /shops or /p/…">
            {(id) => <TextInput id={id} value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="/shops" />}
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-[13px] font-bold">Send by</legend>
            {fields.channels && <p className="text-[13px] font-semibold text-danger">{fields.channels}</p>}
            {channel("app", "In the app + phone notification", "Shows in the bell; phones with the app get a notification.", true)}
            {channel("email", "Email", preview ? (preview.emailOn ? `${preview.withEmail} of ${preview.recipients} have a confirmed email.` : "Email isn't set up on the server.") : "…", !!preview?.emailOn)}
            {channel(
              "sms",
              "SMS",
              preview
                ? preview.smsOn
                  ? `${preview.withPhone} of ${preview.recipients} have a phone — about ${money(preview.smsCostUsd)} on Twilio.`
                  : "SMS isn't set up yet (add the Twilio keys to the server settings)."
                : "…",
              !!preview?.smsOn
            )}
            {channels.sms && preview?.smsSample && (
              <div className="rounded-2xl bg-[#F6F2F8] px-4 py-3">
                <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-muted">The text people get ({preview.smsSample.length}/160)</p>
                <p className="whitespace-pre-wrap break-words font-mono text-[13px]">{preview.smsSample}</p>
              </div>
            )}
          </fieldset>

          {previewError && <Alert tone="danger">{previewError}</Alert>}
          {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" busy={busy} disabled={!preview || preview.recipients === 0 || !form.title.trim() || !form.body.trim()}>
              {urgent ? "Send urgent message" : "Send"} to {preview ? `${preview.recipients} ${preview.recipients === 1 ? "person" : "people"}` : "…"}
            </Button>
            {preview?.recipients === 0 && <span className="text-[13px] text-muted">Nobody matches yet.</span>}
          </div>
        </form>

        <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-white p-[22px]">
          <h2 className="font-display text-lg font-extrabold">Sent before</h2>
          {history === null && <p className="text-sm text-muted">Loading…</p>}
          {history?.length === 0 && <p className="text-sm text-muted">No messages sent yet.</p>}
          {history?.map((b) => (
            <article key={b.id} className="flex flex-col gap-1 border-t border-line pt-3 first:border-0 first:pt-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold">{b.title}</p>
                <span className="flex shrink-0 gap-1">
                  {b.urgent && <Badge tone="danger">Urgent</Badge>}
                  {b.status === "sending" ? <Badge tone="warn">Sending…</Badge> : <Badge tone="success">Sent</Badge>}
                </span>
              </div>
              <p className="line-clamp-2 text-[13px] text-soft">{b.body}</p>
              <p className="text-[12px] text-muted">
                {b.audience === "user" ? b.user?.fullName ?? "One person" : AUDIENCE_LABEL[b.audience]}
                {b.country ? ` · ${countryInfo(b.country).flag} ${countryInfo(b.country).name}` : ""}
                {b.near ? ` · within ${b.near.radiusKm} km of ${b.near.shopName}` : ""} · {b.recipients} {b.recipients === 1 ? "person" : "people"}
                {b.channels.email ? ` · ${b.emailsSent} emails` : ""}
                {b.channels.sms ? ` · ${b.smsSent} texts` : ""}
                {b.channels.sms && b.smsFailed > 0 ? ` (${b.smsFailed} failed)` : ""}
                {b.channels.app ? " · in app" : ""}
              </p>
              <p className="text-[12px] text-muted">
                {whenTime(b.createdAt)}
                {b.sentBy ? ` · by ${b.sentBy.fullName}` : ""}
              </p>
            </article>
          ))}
        </section>
      </div>
    </AdminShell>
  );
}
