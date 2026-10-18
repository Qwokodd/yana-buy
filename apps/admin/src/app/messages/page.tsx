"use client";

import { useEffect, useState } from "react";
import { COUNTRIES, countryInfo, type Broadcast, type BroadcastAudience, type BroadcastChannels, type BroadcastPreview, type Country } from "@yanabuy/shared";
import { Alert, Badge, Button, Field, TextInput, fieldErrorsOf, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { whenTime } from "@/lib/labels";

const AUDIENCES: { value: Exclude<BroadcastAudience, "user">; label: string }[] = [
  { value: "everyone", label: "Everyone" },
  { value: "buyers", label: "Buyers" },
  { value: "vendors", label: "Vendors" },
  { value: "riders", label: "Riders" },
];
const AUDIENCE_LABEL: Record<BroadcastAudience, string> = { everyone: "Everyone", buyers: "Buyers", vendors: "Vendors", riders: "Riders", user: "One person" };

export default function MessagesPage() {
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [audience, setAudience] = useState<BroadcastAudience>("everyone");
  const [country, setCountry] = useState<Country | null>(null);
  const [channels, setChannels] = useState<BroadcastChannels>({ app: true, email: true, sms: false });
  const [form, setForm] = useState({ title: "", body: "", link: "" });
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [history, setHistory] = useState<Broadcast[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("user");
    if (id) {
      setPerson({ id, name: q.get("name") ?? "this person" });
      setAudience("user");
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

  useEffect(() => {
    setPreview(null);
    if (audience === "user" && !person) return;
    api.admin
      .previewBroadcast({ audience, userId: person?.id ?? null, country })
      .then((r) => {
        setPreview(r.preview);
        setChannels((c) => ({ ...c, email: c.email && r.preview.emailOn, sms: c.sms && r.preview.smsOn }));
      })
      .catch(() => {});
  }, [audience, country, person]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) return;
    const n = preview.recipients;
    const sms = channels.sms ? ` ${n} text message${n === 1 ? "" : "s"} will be sent (Twilio charges for each).` : "";
    if (!confirm(`Send “${form.title}” to ${n} ${n === 1 ? "person" : "people"}?${sms}`)) return;
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      await api.admin.sendBroadcast({ ...form, link: form.link || null, audience, userId: person?.id ?? null, country: audience === "user" ? null : country, channels });
      setNotice({ tone: "success", text: n > 50 ? "Sending — big messages take a few minutes. You can leave this page." : "Sent." });
      setForm({ title: "", body: "", link: "" });
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

  return (
    <AdminShell title="Send a message" subtitle="Tell buyers, vendors or riders something — in the app, by email and by SMS.">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <form onSubmit={send} className="flex flex-col gap-5 rounded-[20px] border border-line bg-white p-[22px]" noValidate>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-[13px] font-bold">Who gets it</legend>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCES.map((a) => (
                <button key={a.value} type="button" aria-pressed={audience === a.value} onClick={() => setAudience(a.value)} className={pill(audience === a.value)}>
                  {a.label}
                </button>
              ))}
              {person && (
                <button type="button" aria-pressed={audience === "user"} onClick={() => setAudience("user")} className={pill(audience === "user")}>
                  Only {person.name}
                </button>
              )}
            </div>
            {!person && <p className="text-[12.5px] text-muted">To message one person, open them in Buyers &amp; accounts and tap “Send a message”.</p>}
          </fieldset>
          {audience !== "user" && (
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

          <Field label="Title" error={fields.title} hint="The notification heading and the email subject.">
            {(id) => <TextInput id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} invalid={!!fields.title} placeholder="e.g. Free delivery this weekend!" />}
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
            {channel("sms", "SMS", preview ? (preview.smsOn ? `${preview.withPhone} texts — Twilio charges for each one.` : "SMS isn't set up yet (add the Twilio keys to the server settings).") : "…", !!preview?.smsOn)}
          </fieldset>

          {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" busy={busy} disabled={!preview || preview.recipients === 0 || !form.title.trim() || !form.body.trim()}>
              Send to {preview ? `${preview.recipients} ${preview.recipients === 1 ? "person" : "people"}` : "…"}
            </Button>
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
                {b.status === "sending" ? <Badge tone="warn">Sending…</Badge> : <Badge tone="success">Sent</Badge>}
              </div>
              <p className="line-clamp-2 text-[13px] text-soft">{b.body}</p>
              <p className="text-[12px] text-muted">
                {b.audience === "user" ? b.user?.fullName ?? "One person" : AUDIENCE_LABEL[b.audience]}
                {b.country ? ` · ${countryInfo(b.country).flag} ${countryInfo(b.country).name}` : ""} · {b.recipients} {b.recipients === 1 ? "person" : "people"}
                {b.channels.email ? ` · ${b.emailsSent} emails` : ""}
                {b.channels.sms ? ` · ${b.smsSent} texts` : ""}
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
