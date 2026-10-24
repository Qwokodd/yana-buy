"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  formatLiberianPhone,
  ID_TYPE_LABEL,
  CITIES,
  COUNTRIES,
  countryName,
  SHOP_KIND_LABEL,
  type Country,
  type Category,
  type IdDocumentType,
  type MyShop,
  type PrivateUpload,
  type ShopKind,
} from "@yanabuy/shared";
import { Alert, Badge, Button, DocumentUpload, Field, ImageUpload, TextInput, fieldErrorsOf, inputClass, messageOf, useAuth, ConfirmEmailFirst } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { ShopLocationCard } from "@/components/ShopLocation";
import { api } from "@/lib/api";
import { useCountry } from "@/lib/country";
import { useMode } from "@/lib/mode";
import { setBrowsing } from "@/lib/workspace";
import { useRouter } from "next/navigation";

export default function SellPage() {
  const { user, loading, reload, setUser } = useAuth();
  const [shop, setShop] = useState<MyShop | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.shop
      .mine()
      .then((res) => setShop(res.shop))
      .catch((err) => setError(messageOf(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  let body: React.ReactNode;
  if (loading || (user && shop === undefined && !error)) {
    body = <p className="text-muted">Loading…</p>;
  } else if (!user) {
    body = <SellIntro />;
  } else if (error) {
    body = <Alert>{error}</Alert>;
  } else if (user.role === "rider" || user.role === "admin") {
    body = (
      <Alert tone="info">
        {user.role === "admin" ? "Admin" : "Rider"} accounts can&rsquo;t open a shop. Create a separate account with another phone number for selling.
      </Alert>
    );
  } else if (!shop || shop.status === "rejected" || (shop.status === "pending" && editing)) {
    body = (
      <>
        {shop?.status === "rejected" && (
          <Alert tone="warn">
            <strong>Please fix this and send it again:</strong> {shop.statusReason}
          </Alert>
        )}
        {!user.emailVerified && (user.canVerifyBy ?? []).includes("email") && <ConfirmEmailFirst api={api} user={user} who="sellers" onDone={setUser} />}
        <ApplicationForm
          initial={shop ?? null}
          defaultPhone={formatLiberianPhone(user.phone)}
          onCancel={shop?.status === "pending" ? () => setEditing(false) : undefined}
          onSent={(s) => {
            setShop(s);
            setEditing(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </>
    );
  } else if (shop.status === "pending") {
    body = <Waiting shop={shop} onEdit={() => setEditing(true)} />;
  } else if (shop.status === "suspended") {
    body = (
      <StatusCard shop={shop} tone="danger" title="Your shop is suspended">
        {shop.statusReason ? `Reason: ${shop.statusReason}. ` : ""}Shoppers can&rsquo;t see it right now. Contact YanaBuy support to sort it out.
      </StatusCard>
    );
  } else {
    body = <ApprovedShop shop={shop} onSaved={setShop} onFirstVisit={reload} />;
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-9 sm:px-8">{body}</main>
    </>
  );
}

function SellIntro() {
  const points = [
    ["Sell to all of Liberia", "Goods, services or food — shoppers find you by category and search."],
    ["Riders deliver for you", "We pick up from you and deliver to your customers."],
    ["Get paid by mobile money", "MTN MoMo or Orange Money, straight to your phone."],
  ];
  return (
    <>
      <section className="relative overflow-hidden rounded-sheet bg-ink p-8 text-white">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-amber" />
        <div className="relative max-w-md">
          <h1 className="font-display text-[34px] font-extrabold leading-[1.05]">Open your shop or restaurant</h1>
          <p className="mt-2 text-white/80">It&rsquo;s free to apply. We check every seller&rsquo;s ID so shoppers can trust you.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/register?next=/sell" className="inline-flex h-11 items-center rounded-full bg-amber px-6 text-sm font-bold text-ink">
              Create an account to start
            </Link>
            <Link href="/login?next=/sell" className="inline-flex h-11 items-center rounded-full bg-white/10 px-6 text-sm font-bold text-white hover:bg-white/20">
              I have an account
            </Link>
          </div>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        {points.map(([t, d]) => (
          <div key={t} className="rounded-card border border-line bg-white p-5">
            <p className="font-display font-extrabold">{t}</p>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function StatusCard({ shop, tone, title, children, actions }: { shop: MyShop; tone: "warn" | "danger" | "success"; title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  const bar = { warn: "bg-amber", danger: "bg-danger", success: "bg-success" }[tone];
  return (
    <section className="overflow-hidden rounded-card border border-line bg-white">
      <div className={`h-1.5 ${bar}`} />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          {shop.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.logoUrl} alt="" className="h-14 w-14 rounded-2xl border border-line object-cover" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-tint font-display text-xl font-extrabold text-purple">{shop.name[0]}</span>
          )}
          <div>
            <p className="font-display text-xl font-extrabold">{shop.name}</p>
            <p className="text-sm text-muted">
              {SHOP_KIND_LABEL[shop.kind]} · {shop.city}
            </p>
          </div>
        </div>
        <div>
          <h1 className="font-display text-[22px] font-extrabold">{title}</h1>
          <p className="mt-1 text-sm text-soft">{children}</p>
        </div>
        {actions}
      </div>
    </section>
  );
}

function Waiting({ shop, onEdit }: { shop: MyShop; onEdit: () => void }) {
  const sent = new Date(shop.submittedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <StatusCard
      shop={shop}
      tone="warn"
      title="Thanks — we're checking your details"
      actions={
        <div className="flex flex-col gap-3">
          <ol className="flex flex-col gap-2 text-sm">
            <li className="flex items-center gap-2">
              <Badge tone="success">Done</Badge> Application sent {sent}
            </li>
            <li className="flex items-center gap-2">
              <Badge tone="warn">Now</Badge> A YanaBuy admin checks your ID and selfie
            </li>
            <li className="flex items-center gap-2">
              <Badge>Next</Badge> Your shop opens and you can add products
            </li>
          </ol>
          <div>
            <Button variant="outline" onClick={onEdit}>
              Change my application
            </Button>
          </div>
        </div>
      }
    >
      We usually review new shops within one working day. Come back to this page to see the result.
    </StatusCard>
  );
}

// ─── Application form ──────────────────────────────────────────────────────

const STEP1 = ["kind", "name", "description", "phone", "city", "address", "logoUrl", "categoryId", "hours"];

function IdCardDrawing() {
  return (
    <svg width="64" height="42" viewBox="0 0 64 42" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="62" height="40" rx="6" stroke="#B9A9C6" strokeWidth="2" />
      <circle cx="18" cy="18" r="7" fill="#E0D6E6" />
      <rect x="10" y="28" width="16" height="4" rx="2" fill="#E0D6E6" />
      <rect x="32" y="12" width="22" height="4" rx="2" fill="#E0D6E6" />
      <rect x="32" y="20" width="16" height="4" rx="2" fill="#E0D6E6" />
    </svg>
  );
}

function SelfieDrawing() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <circle cx="22" cy="20" r="10" fill="#E0D6E6" />
      <path d="M6 50c2-10 9-15 16-15s14 5 16 15" fill="#E0D6E6" />
      <rect x="34" y="28" width="18" height="12" rx="2" stroke="#B9A9C6" strokeWidth="2" />
    </svg>
  );
}

function ApplicationForm({
  initial,
  defaultPhone,
  onSent,
  onCancel,
}: {
  initial: MyShop | null;
  defaultPhone: string;
  onSent: (s: MyShop) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [kind, setKind] = useState<ShopKind>(initial?.kind ?? "store");
  const shopping = useCountry().country;
  const [country, setCountry] = useState<Country>(initial?.country ?? shopping);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    phone: initial ? formatLiberianPhone(initial.phone) : defaultPhone,
    city: initial?.city ?? "",
    address: initial?.address ?? "",
    categoryId: initial?.categoryId ?? "",
    hours: initial?.hours ?? "",
  });
  const [logo, setLogo] = useState<string[]>(initial?.logoUrl ? [initial.logoUrl] : []);
  const [idType, setIdType] = useState<IdDocumentType>(initial?.documents.idType ?? "national_id");
  const doc = (key: string | null | undefined, url: string | null | undefined): PrivateUpload | null => (key && url ? { key, url } : null);
  const [front, setFront] = useState(doc(initial?.documents.idFrontKey, initial?.documents.idFrontUrl));
  const [back, setBack] = useState(doc(initial?.documents.idBackKey, initial?.documents.idBackUrl));
  const [selfie, setSelfie] = useState(doc(initial?.documents.selfieKey, initial?.documents.selfieUrl));
  const [agreed, setAgreed] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  /** Picking a new photo clears its old error. */
  const clearing =
    <T,>(setter: (v: T) => void, key: string) =>
    (v: T) => {
      setter(v);
      setFields(({ [key]: _gone, ...rest }) => rest);
    };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function checkStep1() {
    const f: Record<string, string> = {};
    if (form.name.trim().length < 2) f.name = "Enter your shop's name";
    if (!form.phone.trim()) f.phone = "Enter a phone number customers can call";
    if (form.city.trim().length < 2) f.city = "Enter the city or town";
    if (form.address.trim().length < 3) f.address = "Enter the street or landmark";
    setFields(f);
    return Object.keys(f).length === 0;
  }

  async function send() {
    const f: Record<string, string> = {};
    if (!front) f.idFrontKey = "Add a photo of the front of your ID";
    if (idType !== "passport" && !back) f.idBackKey = "Add a photo of the back of your ID";
    if (!selfie) f.selfieKey = "Add a selfie holding your ID";
    if (!agreed) f.agreed = "Please confirm this is true";
    setFields(f);
    if (Object.keys(f).length) return;

    setBusy(true);
    setError(null);
    try {
      const { shop } = await api.shop.apply({
        kind,
        country,
        ...form,
        categoryId: form.categoryId || null,
        hours: form.hours || null,
        description: form.description || null,
        logoUrl: logo[0] ?? null,
        idType,
        idFrontKey: front!.key,
        idBackKey: idType === "passport" ? null : back?.key ?? null,
        selfieKey: selfie!.key,
      });
      onSent(shop);
    } catch (err) {
      const fe = fieldErrorsOf(err);
      setFields(fe);
      setError(Object.keys(fe).length ? "Please fix the fields marked in red." : messageOf(err));
      if (Object.keys(fe).some((k) => STEP1.includes(k))) setStep(1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-5 rounded-card border border-line bg-white p-6">
      <div>
        <h1 className="font-display text-[26px] font-extrabold">{initial ? "Your application" : "Open your shop or restaurant"}</h1>
        <ol className="mt-3 flex gap-2 text-[13px] font-bold" aria-label="Steps">
          {["Your shop", "Check it's you"].map((label, i) => (
            <li
              key={label}
              aria-current={step === i + 1 ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${step === i + 1 ? "bg-purple text-white" : "bg-ground text-muted"}`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${step === i + 1 ? "bg-white text-purple" : "bg-white"}`}>{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      </div>

      {error && <Alert>{error}</Alert>}

      {step === 1 ? (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (checkStep1()) {
              setError(null);
              setStep(2);
            }
          }}
        >
          <fieldset>
            <legend className="mb-2 text-[13px] font-bold">What will you sell?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["store", "A shop", "Goods or services — phones, clothes, repairs, beauty…", "bg-amber"],
                  ["restaurant", "A restaurant", "Food and drinks — cook shops, fast food, bakeries…", "bg-orange"],
                ] as const
              ).map(([value, title, text, dot]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer gap-3 rounded-2xl border-2 p-4 ${kind === value ? "border-purple bg-purple-tint/50" : "border-line hover:border-line-strong"}`}
                >
                  <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
                  <span className={`mt-1 h-3 w-3 flex-shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                  <span>
                    <span className="block font-display font-extrabold">{title}</span>
                    <span className="text-[13px] text-muted">{text}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-[13px] font-bold">Which country do you sell in?</legend>
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map((c) => (
                <label
                  key={c.code}
                  className={`flex h-11 cursor-pointer items-center gap-2 rounded-full border-2 px-5 text-sm font-bold ${country === c.code ? "border-purple bg-purple text-white" : "border-line-strong text-soft hover:border-purple"}`}
                >
                  <input type="radio" name="country" value={c.code} checked={country === c.code} onChange={() => setCountry(c.code)} className="sr-only" />
                  <span aria-hidden="true">{c.flag}</span> {c.name}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[12.5px] text-muted">Your shop shows to shoppers who pick {countryName(country)}. {country === "US" ? "Mobile money isn't available in the USA — card payment for US buyers is coming soon." : ""}</p>
          </fieldset>

          <Field label={kind === "restaurant" ? "Restaurant name" : "Shop name"} error={fields.name}>
            {(id) => <TextInput id={id} value={form.name} onChange={set("name")} maxLength={60} invalid={!!fields.name} placeholder={kind === "restaurant" ? "e.g. Mama Kebbeh's Kitchen" : "e.g. Sinkor Phone Centre"} />}
          </Field>
          <Field label="What do you offer? (optional)" error={fields.description} hint="One or two lines shoppers will see.">
            {(id) => (
              <textarea id={id} value={form.description} onChange={set("description")} maxLength={500} rows={3} className={`${inputClass} h-auto resize-none py-3`} />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone for customers" error={fields.phone}>
              {(id) => <TextInput id={id} type="tel" value={form.phone} onChange={set("phone")} invalid={!!fields.phone} />}
            </Field>
            <Field label="City or town" error={fields.city}>
              {(id) => (
                <>
                  <TextInput id={id} value={form.city} onChange={set("city")} list="cities" invalid={!!fields.city} placeholder={CITIES[country][0]} />
                  <datalist id="cities">
                    {CITIES[country].map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
          </div>
          <Field label="Street or landmark" error={fields.address} hint="Shown on your shop page. Riders use it to pick up orders.">
            {(id) => <TextInput id={id} value={form.address} onChange={set("address")} maxLength={160} invalid={!!fields.address} placeholder="e.g. Tubman Boulevard, opposite the Total station" />}
          </Field>
          <ShopKindFields kind={kind} categoryId={form.categoryId} hours={form.hours} fields={fields} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
          <ImageUpload api={api} label="Logo or shop photo (optional)" hint="Square works best." images={logo} onChange={setLogo} max={1} />

          <div className="flex gap-2">
            <Button type="submit" size="lg">
              Continue
            </Button>
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      ) : (
        <form
          className="flex flex-col gap-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Alert tone="info">
            To keep shoppers safe, we check the ID of everyone who sells. Your photos are private: only you and YanaBuy admins can see them.
          </Alert>

          <fieldset>
            <legend className="mb-2 text-[13px] font-bold">Type of ID</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ID_TYPE_LABEL) as IdDocumentType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={idType === t}
                  onClick={() => setIdType(t)}
                  className={`h-10 rounded-full px-4 text-[13px] font-bold ${idType === t ? "bg-purple text-white" : "border border-line-strong bg-white text-soft"}`}
                >
                  {ID_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <DocumentUpload
              api={api}
              label={idType === "passport" ? "Passport photo page" : "Front of your ID"}
              hint="All four corners in the photo, no glare."
              value={front}
              onChange={clearing(setFront, "idFrontKey")}
              capture="environment"
              error={fields.idFrontKey}
              example={<IdCardDrawing />}
            />
            {idType !== "passport" && (
              <DocumentUpload
                api={api}
                label="Back of your ID"
                value={back}
                onChange={clearing(setBack, "idBackKey")}
                capture="environment"
                error={fields.idBackKey}
                example={<IdCardDrawing />}
              />
            )}
          </div>
          <div className="max-w-[260px]">
            <DocumentUpload
              api={api}
              label="Selfie holding your ID"
              hint="Your face and the ID both clear in one photo."
              value={selfie}
              onChange={clearing(setSelfie, "selfieKey")}
              shape="portrait"
              capture="user"
              error={fields.selfieKey}
              example={<SelfieDrawing />}
            />
          </div>

          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={agreed} onChange={(e) => clearing(setAgreed, "agreed")(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-purple))]" />
            <span>
              This is my own ID, and my shop details are true.
              {fields.agreed && <span className="block text-xs font-semibold text-danger">{fields.agreed}</span>}
            </span>
          </label>

          <div className="flex gap-2">
            <Button type="submit" size="lg" busy={busy}>
              {initial ? "Send again for review" : "Send for review"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              ← Back
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

// ─── Approved: shop settings ───────────────────────────────────────────────

function ApprovedShop({ shop, onSaved, onFirstVisit }: { shop: MyShop; onSaved: (s: MyShop) => void; onFirstVisit: () => void }) {
  const router = useRouter();
  const { setMode } = useMode();
  const [form, setForm] = useState({
    name: shop.name,
    description: shop.description ?? "",
    phone: formatLiberianPhone(shop.phone),
    city: shop.city,
    address: shop.address,
    categoryId: shop.categoryId ?? "",
    hours: shop.hours ?? "",
  });
  const [logo, setLogo] = useState<string[]>(shop.logoUrl ? [shop.logoUrl] : []);
  const [cover, setCover] = useState<string[]>(shop.coverUrl ? [shop.coverUrl] : []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  // Approval turned this account into a seller — pick up the new role.
  useEffect(() => {
    onFirstVisit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      const res = await api.shop.update({ ...form, categoryId: form.categoryId || null, hours: form.hours || null, description: form.description || null, logoUrl: logo[0] ?? null, coverUrl: cover[0] ?? null });
      onSaved(res.shop);
      setNotice({ tone: "success", text: "Shop details saved." });
    } catch (err) {
      setNotice({ tone: "danger", text: messageOf(err) });
      setFields(fieldErrorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StatusCard
        shop={shop}
        tone="success"
        title={shop.kind === "restaurant" ? "My restaurant — open" : "My shop — open"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/sell/orders" className="inline-flex h-11 items-center rounded-full bg-amber px-6 text-sm font-bold text-ink hover:brightness-95">
              Shop orders
            </Link>
            <Link href="/sell/earnings" className="inline-flex h-11 items-center rounded-full border border-line-strong px-6 text-sm font-bold text-purple hover:border-purple">
              Earnings
            </Link>
            <Link href="/sell/reviews" className="inline-flex h-11 items-center rounded-full border border-line-strong px-6 text-sm font-bold text-purple hover:border-purple">
              Reviews
            </Link>
            <Link href="/sell/profile" className="inline-flex h-11 items-center rounded-full border border-line-strong px-6 text-sm font-bold text-purple hover:border-purple">
              {shop.kind === "restaurant" ? "Profile & gallery" : "Work profile"}
            </Link>
            <Link href="/sell/bookings" className="inline-flex h-11 items-center rounded-full border border-line-strong px-6 text-sm font-bold text-purple hover:border-purple">
              {shop.kind === "restaurant" ? "Table bookings" : "Appointments"}
            </Link>
            <Link href="/messages" className="inline-flex h-11 items-center rounded-full border border-line-strong px-6 text-sm font-bold text-purple hover:border-purple">
              Messages
            </Link>
            <Link href="/sell/products" className="inline-flex h-11 items-center rounded-full bg-purple px-6 text-sm font-bold text-white hover:bg-ink">
              {shop.kind === "restaurant" ? "Manage your menu" : "Manage your products"}
            </Link>
            <Link href={`/shop/${shop.slug}`} className="inline-flex h-11 items-center rounded-full border border-line-strong px-6 text-sm font-bold text-purple hover:border-purple">
              {shop.kind === "restaurant" ? "View my restaurant page" : "View my storefront"}
            </Link>
            <button
              type="button"
              onClick={() => {
                // See the home feed buyers see (Food for restaurants). Logging in again brings them back here.
                setBrowsing(true);
                setMode(shop.kind === "restaurant" ? "food" : "goods");
                router.push("/");
              }}
              className="inline-flex h-11 items-center rounded-full border border-line-strong px-6 text-sm font-bold text-purple hover:border-purple"
            >
              Browse like a buyer
            </button>
          </div>
        }
      >
        Add {shop.kind === "restaurant" ? "dishes" : "products"} with photos and prices, and handle your orders. YanaBuy riders pick up and deliver.
      </StatusCard>

      <ShopLocationCard shop={shop} onSaved={onSaved} />
      {shop.kind === "restaurant" && <OrderWaysCard shop={shop} onSaved={onSaved} />}
      <form onSubmit={save} className="flex flex-col gap-4 rounded-card border border-line bg-white p-6" noValidate>
        <h2 className="font-display text-lg font-extrabold">Shop details</h2>
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <ImageUpload api={api} label="Logo" images={logo} onChange={setLogo} max={1} />
          <ImageUpload api={api} label="Cover picture" hint="Wide picture for the top of your shop page." images={cover} onChange={setCover} max={1} shape="wide" />
        </div>
        <Field label="Name" error={fields.name}>
          {(id) => <TextInput id={id} value={form.name} onChange={set("name")} maxLength={60} invalid={!!fields.name} />}
        </Field>
        <Field label="What do you offer?" error={fields.description}>
          {(id) => <textarea id={id} value={form.description} onChange={set("description")} maxLength={500} rows={3} className={`${inputClass} h-auto resize-none py-3`} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone for customers" error={fields.phone}>
            {(id) => <TextInput id={id} type="tel" value={form.phone} onChange={set("phone")} invalid={!!fields.phone} />}
          </Field>
          <Field label="City or town" error={fields.city}>
            {(id) => <TextInput id={id} value={form.city} onChange={set("city")} list="cities" invalid={!!fields.city} />}
          </Field>
        </div>
        <datalist id="cities">
          {CITIES[shop.country].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Field label="Street or landmark" error={fields.address} hint="Shown on your shop page with a “Get directions” link.">
          {(id) => <TextInput id={id} value={form.address} onChange={set("address")} maxLength={160} invalid={!!fields.address} />}
        </Field>
        <ShopKindFields kind={shop.kind} categoryId={form.categoryId} hours={form.hours} fields={fields} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
        <div>
          <Button type="submit" busy={busy}>
            Save shop details
          </Button>
        </div>
      </form>
    </>
  );
}

/** What kind of shop it is (for the shop directory) and opening hours. */
function ShopKindFields({
  kind,
  categoryId,
  hours,
  fields,
  onChange,
}: {
  kind: ShopKind;
  categoryId: string;
  hours: string;
  fields: Record<string, string>;
  onChange: (patch: { categoryId?: string; hours?: string }) => void;
}) {
  const [cats, setCats] = useState<Category[]>([]);
  useEffect(() => {
    api.public
      .categories()
      .then((r) => setCats(r.items.filter((c) => c.kind === (kind === "restaurant" ? "food" : "goods"))))
      .catch(() => {});
  }, [kind]);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={kind === "restaurant" ? "What kind of food?" : "What do you mostly sell?"} error={fields.categoryId} hint="Where your shop shows in the shop directory.">
        {(id) => (
          <select id={id} value={categoryId} onChange={(e) => onChange({ categoryId: e.target.value })} className={inputClass}>
            <option value="">Choose…</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Opening hours (optional)" error={fields.hours}>
        {(id) => <TextInput id={id} value={hours} onChange={(e) => onChange({ hours: e.target.value })} maxLength={120} placeholder="e.g. Mon–Sat 8am–8pm, Sun 12–6pm" />}
      </Field>
    </div>
  );
}

/** Restaurants: besides delivery, buyers can order to eat in or to collect — menu price only, no delivery fee. */
function OrderWaysCard({ shop, onSaved }: { shop: MyShop; onSaved: (s: MyShop) => void }) {
  const [busy, setBusy] = useState<"eatIn" | "pickup" | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function toggle(key: "eatIn" | "pickup") {
    setBusy(key);
    setError(null);
    try {
      const res = await api.shop.update({ [key]: !shop[key] });
      onSaved(res.shop);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }
  const rows: { key: "eatIn" | "pickup"; title: string; text: string }[] = [
    { key: "eatIn", title: "Eat in", text: "Buyers order ahead, come to the restaurant and eat there. They pay the menu price at the restaurant — no delivery fee." },
    { key: "pickup", title: "Pickup", text: "Buyers order and come to collect it. Menu price only — no delivery fee. They pay at the restaurant or online." },
  ];
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-6">
      <div>
        <h2 className="font-display text-lg font-extrabold">Ways to order</h2>
        <p className="text-sm text-muted">Delivery is always on: buyers pay the menu price plus the delivery fee the app works out by distance.</p>
      </div>
      {error && <Alert>{error}</Alert>}
      {rows.map((r) => (
        <label key={r.key} className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 ${shop[r.key] ? "border-purple bg-purple-tint/40" : "border-line"}`}>
          <input type="checkbox" checked={shop[r.key]} disabled={busy !== null} onChange={() => toggle(r.key)} className="mt-1 h-4 w-4 accent-[rgb(var(--c-purple))]" />
          <span className="flex-1">
            <span className="block font-bold">
              {r.title} {busy === r.key && <span className="text-[12px] font-semibold text-muted">saving…</span>}
            </span>
            <span className="text-[13px] text-muted">{r.text}</span>
          </span>
        </label>
      ))}
    </section>
  );
}
