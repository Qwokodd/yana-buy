"use client";

import { useEffect, useState } from "react";

/** "2d 04:12:09" until `ends`; "Ended" after. Ticks every second. */
export function useCountdown(ends: string | null) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!ends) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ends]);
  if (!ends || now === null) return null;
  const left = Math.max(0, new Date(ends).getTime() - now);
  if (left === 0) return "Ended";
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d ? `${d}d ${clock}` : clock;
}

export function Countdown({ ends, className = "" }: { ends: string | null; className?: string }) {
  const text = useCountdown(ends);
  if (!text) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[12px] font-extrabold tabular-nums text-white ${className}`} aria-label={text === "Ended" ? "Ended" : `Ends in ${text}`}>
      <span aria-hidden>⏱</span>
      {text === "Ended" ? "Ended" : `Ends in ${text}`}
    </span>
  );
}
