"use client";

import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { useBranding } from "./branding";

/** The app's logo: the admin's uploaded logo, or the YanaBuy bag, plus the app name. */
export function Logo({ size = 28, dark = false, wordmark = true }: { size?: number; dark?: boolean; wordmark?: boolean }) {
  const { branding } = useBranding();
  const name = branding.appName;
  const isYanaBuy = name.replace(/\s/g, "").toLowerCase() === "yanabuy";
  return (
    <span className="inline-flex items-center gap-2">
      {branding.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={branding.logoUrl} alt="" style={{ height: size, width: "auto", maxWidth: size * 3 }} className="rounded-md object-contain" />
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" fill="rgb(var(--c-amber))" />
          <path d="M9 8V6.5a3 3 0 0 1 6 0V8" stroke={dark ? "rgb(var(--c-purple))" : "#fff"} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
      {wordmark && (
        <span className={`font-display text-[1.3em] font-extrabold tracking-tight ${dark ? "text-ink" : "text-white"}`}>
          {isYanaBuy ? (
            <>
              YANA<span className="text-amber">BUY</span>
            </>
          ) : (
            name
          )}
        </span>
      )}
    </span>
  );
}

type ButtonVariant = "primary" | "accent" | "outline" | "ghost" | "danger" | "success";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-purple text-white hover:bg-ink",
  accent: "bg-amber text-ink hover:brightness-95",
  outline: "border border-line-strong bg-white text-purple hover:border-purple",
  ghost: "bg-transparent text-soft hover:text-ink",
  danger: "bg-danger text-white hover:brightness-95",
  success: "bg-success text-white hover:brightness-110",
};

export function Button({
  variant = "primary",
  size = "md",
  busy,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" | "lg"; busy?: boolean }) {
  const sizing = size === "sm" ? "h-9 px-3.5 text-[13px]" : size === "lg" ? "h-[52px] px-6 text-[15px]" : "h-11 px-5 text-sm";
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-bold transition disabled:cursor-not-allowed disabled:opacity-55 ${sizing} ${BUTTON[variant]} ${className}`}
    >
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold text-ink">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="text-xs font-semibold text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "h-12 w-full rounded-[14px] border border-line-strong bg-white px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-purple focus:ring-2 focus:ring-purple/15 aria-[invalid=true]:border-danger";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className = "", ...rest } = props;
  return <input {...rest} aria-invalid={invalid || undefined} className={`${inputClass} ${className}`} />;
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const [show, setShow] = useState(false);
  const { invalid, ...rest } = props;
  return (
    <div className="relative">
      <input
        {...rest}
        type={show ? "text" : "password"}
        aria-invalid={invalid || undefined}
        className={`${inputClass} pr-20`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 h-9 -translate-y-1/2 rounded-full px-3 text-[13px] font-bold text-purple hover:bg-purple-tint"
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "success" | "warn" | "info"; children: ReactNode }) {
  const styles = {
    danger: "bg-danger-tint text-[#8A0B21]",
    success: "bg-success-tint text-success",
    warn: "bg-warn-tint text-warn",
    info: "bg-purple-tint text-purple",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-[14px] px-4 py-3 text-sm font-semibold ${styles}`}>
      {children}
    </div>
  );
}

export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="flex-shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="flex flex-shrink-0 items-center justify-center rounded-full bg-purple-tint font-extrabold text-purple"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warn" | "danger" | "purple"; children: ReactNode }) {
  const styles = {
    neutral: "bg-[#F1EEF3] text-soft",
    success: "bg-success-tint text-success",
    warn: "bg-warn-tint text-warn",
    danger: "bg-danger-tint text-[#A00D26]",
    purple: "bg-purple-tint text-purple",
  }[tone];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-extrabold ${styles}`}>{children}</span>;
}

/** Pulls a readable message out of anything thrown by the API client. */
export function messageOf(err: unknown, fallback = "Something went wrong. Please try again.") {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function fieldErrorsOf(err: unknown): Record<string, string> {
  return (err as { fields?: Record<string, string> })?.fields ?? {};
}
