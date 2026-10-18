"use client";

import { useRef, useState, type ReactNode } from "react";
import type { Api, PrivateUpload } from "@yanabuy/shared";
import { Avatar, messageOf } from "./ui";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif";

function checkFiles(files: File[]) {
  if (files.some((f) => f.size > MAX_BYTES)) return "Each photo must be under 8 MB.";
  return null;
}

/** Round profile photo with a camera button. Uploads straight away and returns the URL. */
export function AvatarUpload({
  api,
  name,
  url,
  onChange,
  size = 96,
}: {
  api: Api;
  name: string;
  url: string | null;
  onChange: (url: string | null) => void | Promise<void>;
  size?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(files: FileList | null) {
    const list = Array.from(files ?? []).slice(0, 1);
    if (input.current) input.current.value = "";
    if (!list.length) return;
    const problem = checkFiles(list);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      const { urls } = await api.uploads.images(list);
      await onChange(urls[0]);
    } catch (err) {
      setError(messageOf(err, "Upload failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <Avatar name={name} url={url} size={size} />
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/50">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </span>
        )}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label={url ? "Change profile photo" : "Add profile photo"}
          className="absolute -bottom-0.5 -right-0.5 flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-purple text-white hover:bg-ink"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="7" width="18" height="13" rx="3" stroke="currentColor" strokeWidth="2.2" />
            <circle cx="12" cy="13.5" r="3" stroke="currentColor" strokeWidth="2.2" />
            <path d="M9 7l1.5-3h3L15 7" stroke="currentColor" strokeWidth="2.2" />
          </svg>
        </button>
      </div>
      <div className="flex flex-col items-start gap-1">
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="text-sm font-bold text-purple hover:underline">
          {busy ? "Uploading…" : url ? "Change photo" : "Add a photo"}
        </button>
        {url && !busy && (
          <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-muted hover:text-danger">
            Remove photo
          </button>
        )}
        {error && <p className="text-xs font-semibold text-danger">{error}</p>}
      </div>
      <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files)} />
    </div>
  );
}

/** Square photo picker for 1–5 images (products, ID documents, banners). */
export function ImageUpload({
  api,
  images,
  onChange,
  max = 5,
  label,
  hint,
  shape = "square",
}: {
  api: Api;
  images: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  label?: string;
  hint?: string;
  shape?: "square" | "wide";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = shape === "wide" ? "h-28 w-48" : "h-24 w-24";

  async function pick(files: FileList | null) {
    const room = max === 1 ? 1 : max - images.length;
    const list = Array.from(files ?? []).slice(0, Math.max(room, 0));
    if (input.current) input.current.value = "";
    if (!list.length) return;
    const problem = checkFiles(list);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      const { urls } = await api.uploads.images(list);
      onChange(max === 1 ? urls.slice(0, 1) : [...images, ...urls].slice(0, max));
    } catch (err) {
      setError(messageOf(err, "Upload failed"));
    } finally {
      setBusy(false);
    }
  }

  const canAdd = images.length < max;

  return (
    <div className="flex flex-col gap-2">
      {label && <p className="text-[13px] font-bold text-ink">{label}</p>}
      <div className="flex flex-wrap gap-3">
        {images.map((src, i) => (
          <div key={src + i} className={`group relative ${box} overflow-hidden rounded-[14px] border border-line bg-ground`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" />
            {max === 1 ? (
              // One picture only: click it to swap it for another.
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={busy}
                aria-label="Replace photo"
                className="absolute inset-x-0 bottom-0 bg-ink/70 py-1 text-[12px] font-bold text-white opacity-90 hover:opacity-100"
              >
                {busy ? "Uploading…" : "Replace"}
              </button>
            ) : (
              i === 0 &&
              images.length > 1 && (
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-ink/75 px-2 py-0.5 text-[10.5px] font-bold text-white">Main</span>
              )
            )}
            {max > 1 && i > 0 && (
              <button
                type="button"
                onClick={() => onChange([src, ...images.filter((_, j) => j !== i)])}
                className="absolute bottom-1.5 left-1.5 hidden rounded-full bg-white/90 px-2 py-0.5 text-[10.5px] font-bold text-purple group-hover:block group-focus-within:block"
              >
                Make main
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange(images.filter((_, j) => j !== i))}
              aria-label="Remove photo"
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-xs font-bold text-white"
            >
              ✕
            </button>
          </div>
        ))}
        {canAdd && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className={`${box} flex flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-dashed border-line-strong bg-[#FBF9FC] text-[13px] font-bold text-purple hover:border-purple disabled:opacity-60`}
          >
            {busy ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-purple border-t-transparent" />
            ) : (
              <>
                <span className="text-xl leading-none" aria-hidden="true">+</span>
                {max === 1 && images.length ? "Replace" : "Add photo"}
              </>
            )}
          </button>
        )}
      </div>
      {error ? <p className="text-xs font-semibold text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
      <input ref={input} type="file" accept={ACCEPT} multiple={max > 1} className="hidden" onChange={(e) => pick(e.target.files)} />
    </div>
  );
}

/**
 * One private photo (ID card side or selfie). The file is stored privately on
 * the server; `value.key` goes in the form, `value.url` is a short-lived preview.
 */
export function DocumentUpload({
  api,
  label,
  hint,
  value,
  onChange,
  shape = "card",
  capture,
  error,
  example,
}: {
  api: Api;
  label: string;
  hint?: string;
  value: PrivateUpload | null;
  onChange: (file: PrivateUpload | null) => void;
  /** card = ID-card shaped, portrait = selfie */
  shape?: "card" | "portrait";
  /** On phones, open the front ("user") or back ("environment") camera directly. */
  capture?: "user" | "environment";
  error?: string;
  /** Small drawing shown before a photo is added. */
  example?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = shape === "card" ? "aspect-[1.58] w-full" : "aspect-[3/4] w-full";

  async function pick(files: FileList | null) {
    const list = Array.from(files ?? []).slice(0, 1);
    if (input.current) input.current.value = "";
    if (!list.length) return;
    const bad = checkFiles(list);
    if (bad) return setProblem(bad);
    setProblem(null);
    setBusy(true);
    try {
      const { files: uploaded } = await api.uploads.privateImages(list);
      onChange(uploaded[0] ?? null);
    } catch (err) {
      setProblem(messageOf(err, "Upload failed"));
    } finally {
      setBusy(false);
    }
  }

  const shown = problem ?? error;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-bold text-ink">{label}</p>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={value ? `Replace: ${label}` : `Add: ${label}`}
        className={`group relative ${box} overflow-hidden rounded-[16px] border-2 ${
          value ? "border-solid border-line" : `border-dashed ${shown ? "border-danger" : "border-line-strong"} bg-[#FBF9FC] hover:border-purple`
        } text-left disabled:opacity-70`}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.url} alt="" className="h-full w-full object-cover" />
            <span className="absolute bottom-2 right-2 rounded-full bg-ink/80 px-3 py-1.5 text-xs font-bold text-white group-hover:bg-ink">
              Replace photo
            </span>
          </>
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            {example}
            <span className="text-sm font-bold text-purple">{capture ? "Take or choose a photo" : "Choose a photo"}</span>
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
            <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-purple border-t-transparent" />
          </span>
        )}
      </button>
      {shown ? <p className="text-xs font-semibold text-danger">{shown}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
      <input ref={input} type="file" accept={ACCEPT} capture={capture} className="hidden" onChange={(e) => pick(e.target.files)} />
    </div>
  );
}
