"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatLiberianPhone, LIBERIAN_CITIES, RIDER_NEEDS_LICENSE, RIDER_VEHICLE_LABEL, type MyRiderApplication, type RiderVehicle } from "@yanabuy/shared";
import { Alert, Button, ConfirmEmailFirst, Field, TextInput, fieldErrorsOf, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { api } from "@/lib/api";

/** "Deliver with YanaBuy": apply to be a rider, then see where the application stands. */
export default function RidePage() {
  const { user, loading } = useAuth();
  const [application, setApplication] = useState<MyRiderApplication | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api.rider
      .myApplication()
      .then((r) => setApplication(r.application))
      .catch((err) => setError(messageOf(err)));
  }, [user]);

  let body: React.ReactNode;
  if (loading || (user && application === undefined && !error)) body = <p className="text-muted">Loading…</p>;
  else if (!user) body = <Intro />;
  else if (user.role === "rider") body = <Approved />;
  else if (user.role !== "buyer") body = <Alert tone="info">Seller and admin accounts can&rsquo;t deliver. To become a rider, sign up with a separate phone number.</Alert>;
  else if (application && !editing) {
    body =
      application.status === "pending" ? (
        <Status tone="warn" title="Thanks — we're checking your application">
          The YanaBuy team looks at your details, usually within 1–2 working days. You&rsquo;ll see the answer here and in the app.
        </Status>
      ) : application.status === "rejected" ? (
        <Status tone="danger" title="Please fix your application">
          {application.statusReason ?? "Something needs changing."}
          <div className="mt-4">
            <Button onClick={() => setEditing(true)}>Fix and send again</Button>
          </div>
        </Status>
      ) : application.status === "suspended" ? (
        <Status tone="danger" title="Your rider account is suspended">
          {application.statusReason ?? ""} Contact YanaBuy support if you think this is a mistake.
        </Status>
      ) : (
        <Approved />
      );
  } else {
    body = (
      <ApplyForm
        initial={application ?? null}
        onSent={(a) => {
          setApplication(a);
          setEditing(false);
          window.scrollTo({ top: 0 });
        }}
        onCancel={application ? () => setEditing(false) : undefined}
      />
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 sm:px-8">
        <div className="overflow-hidden rounded-sheet bg-ink p-7 text-white">
          <p className="text-3xl" aria-hidden>
            🏍️
          </p>
          <h1 className="mt-2 font-display text-[30px] font-extrabold leading-tight">Deliver with YanaBuy</h1>
          <p className="mt-2 max-w-xl text-white/80">
            Pick up orders from shops and restaurants near you and bring them to customers. Work when you want, in the areas you know.
          </p>
        </div>
        {error && <Alert>{error}</Alert>}
        {body}
      </main>
    </>
  );
}

function Intro() {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-white p-6">
      <ol className="grid gap-3 text-sm sm:grid-cols-3">
        {["Create a YanaBuy account with your phone number", "Confirm your email and send your details", "When we approve you, deliveries show in the app"].map((s, i) => (
          <li key={s} className="rounded-2xl bg-ground p-4">
            <span className="block font-display text-xl font-extrabold text-purple">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Link href="/register?next=/ride" className="inline-flex h-12 items-center rounded-full bg-purple px-7 font-bold text-white hover:bg-ink">
          Create an account
        </Link>
        <Link href="/login?next=/ride" className="inline-flex h-12 items-center rounded-full border border-line-strong px-7 font-bold text-purple hover:border-purple">
          I have an account
        </Link>
      </div>
    </section>
  );
}

function Approved() {
  return (
    <Status tone="success" title="You're a YanaBuy rider">
      Deliveries are handled in the YanaBuy phone app. Log in with this phone number and open <strong>Profile → My deliveries</strong>. The YanaBuy team assigns orders
      to you there.
    </Status>
  );
}

function Status({ tone, title, children }: { tone: "warn" | "danger" | "success"; title: string; children: React.ReactNode }) {
  const bar = { warn: "bg-amber", danger: "bg-danger", success: "bg-success" }[tone];
  return (
    <section className="overflow-hidden rounded-card border border-line bg-white" aria-label="Your rider application">
      <div className={`h-1.5 ${bar}`} />
      <div className="p-6">
        <h2 className="font-display text-[22px] font-extrabold">{title}</h2>
        <div className="mt-1 text-sm text-soft">{children}</div>
      </div>
    </section>
  );
}

const VEHICLES = Object.keys(RIDER_VEHICLE_LABEL) as RiderVehicle[];

function ApplyForm({ initial, onSent, onCancel }: { initial: MyRiderApplication | null; onSent: (a: MyRiderApplication) => void; onCancel?: () => void }) {
  const { user, setUser } = useAuth();
  // Riders need a confirmed email (no ID photos any more).
  const needsEmail = !!user && !user.emailVerified && (user.canVerifyBy ?? []).includes("email");
  const [vehicle, setVehicle] = useState<RiderVehicle | null>(initial?.vehicle ?? null);
  const [form, setForm] = useState({
    plateNumber: initial?.plateNumber ?? "",
    city: initial?.city ?? "",
    areas: initial?.areas ?? "",
    emergencyName: initial?.emergencyName ?? "",
    emergencyPhone: initial ? formatLiberianPhone(initial.emergencyPhone) : "",
  });
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const motor = !!vehicle && RIDER_NEEDS_LICENSE.includes(vehicle);
  // Once every marked field is fixed, drop the "please fix" message too.
  useEffect(() => {
    if (!Object.keys(fields).length) setError((e) => (e === "Please fix the fields marked in red." ? null : e));
  }, [fields]);
  const clear = (k: string) => setFields(({ [k]: _gone, ...rest }) => rest);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    clear(k);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const f: Record<string, string> = {};
    if (!vehicle) f.vehicle = "Choose how you'll deliver";
    if (needsEmail) f.email = "Confirm your email first";
    if (!agreed) f.agreed = "Please confirm";
    if (Object.keys(f).length) {
      setFields(f);
      setError("Please fix the fields marked in red.");
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const { application } = await api.rider.apply({
        vehicle: vehicle!,
        plateNumber: motor ? form.plateNumber || null : null,
        city: form.city,
        areas: form.areas,
        emergencyName: form.emergencyName,
        emergencyPhone: form.emergencyPhone,
      });
      onSent(application);
    } catch (err) {
      const fe = fieldErrorsOf(err);
      setFields(fe);
      setError(Object.keys(fe).length ? "Please fix the fields marked in red." : messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {user && needsEmail && (
        <ConfirmEmailFirst
          api={api}
          user={user}
          who="riders"
          error={fields.email}
          onDone={(u) => {
            setUser(u);
            clear("email");
          }}
        />
      )}
    <form onSubmit={submit} noValidate className="flex flex-col gap-5 rounded-card border border-line bg-white p-6" aria-label="Rider application">
      {initial?.statusReason && initial.status === "rejected" && <Alert tone="warn">What to fix: {initial.statusReason}</Alert>}
      <fieldset>
        <legend className="mb-2 text-[13px] font-bold">How will you deliver?</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How will you deliver?">
          {VEHICLES.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={vehicle === v}
              onClick={() => {
                setVehicle(v);
                clear("vehicle");
                clear("plateNumber");
              }}
              className={`h-10 rounded-full px-4 text-[13px] font-bold ${vehicle === v ? "bg-purple text-white" : "border border-line-strong bg-white text-soft"}`}
            >
              {RIDER_VEHICLE_LABEL[v]}
            </button>
          ))}
        </div>
        {fields.vehicle && <p className="mt-1 text-[12.5px] font-semibold text-danger">{fields.vehicle}</p>}
      </fieldset>

      {motor && (
        <Field label="Plate number" error={fields.plateNumber}>
          {(id) => <TextInput id={id} value={form.plateNumber} onChange={set("plateNumber")} invalid={!!fields.plateNumber} placeholder="e.g. MC-4521" maxLength={20} />}
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City or town" error={fields.city}>
          {(id) => (
            <>
              <TextInput id={id} value={form.city} onChange={set("city")} list="ride-cities" invalid={!!fields.city} placeholder="Monrovia" />
              <datalist id="ride-cities">
                {LIBERIAN_CITIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Areas you can cover" error={fields.areas} hint="e.g. Sinkor, Congo Town, Paynesville">
          {(id) => <TextInput id={id} value={form.areas} onChange={set("areas")} invalid={!!fields.areas} maxLength={300} />}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Emergency contact name" error={fields.emergencyName}>
          {(id) => <TextInput id={id} value={form.emergencyName} onChange={set("emergencyName")} invalid={!!fields.emergencyName} placeholder="Someone we can call" />}
        </Field>
        <Field label="Emergency contact phone" error={fields.emergencyPhone}>
          {(id) => <TextInput id={id} type="tel" value={form.emergencyPhone} onChange={set("emergencyPhone")} invalid={!!fields.emergencyPhone} placeholder="0886 000 000" />}
        </Field>
      </div>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => {
            setAgreed(e.target.checked);
            clear("agreed");
          }}
          className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-purple))]"
        />
        <span>
          My details are true. I&rsquo;ll deliver orders safely and hand in cash from cash orders.
          {fields.agreed && <span className="block text-xs font-semibold text-danger">{fields.agreed}</span>}
        </span>
      </label>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="lg" busy={busy}>
          {initial ? "Send again for review" : "Send application"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
    </div>
  );
}
