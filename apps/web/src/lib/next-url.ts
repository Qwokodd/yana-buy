import { useEffect, useState } from "react";

/** The ?next= page to go to after logging in — only pages on this site. */
export function nextPath(fallback: string) {
  if (typeof window === "undefined") return fallback;
  const next = new URLSearchParams(window.location.search).get("next");
  return next && /^\/(?![/\\])/.test(next) ? next : fallback;
}

/** Keeps ?next= when switching between the log-in and sign-up pages. */
export function withNext(path: string) {
  if (typeof window === "undefined") return path;
  const next = new URLSearchParams(window.location.search).get("next");
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}

/** withNext() for links, set after the first render so server and browser HTML match. */
export function useWithNext(path: string) {
  const [href, setHref] = useState(path);
  useEffect(() => setHref(withNext(path)), [path]);
  return href;
}
