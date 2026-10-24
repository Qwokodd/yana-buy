"use client";

import { useEffect, useState } from "react";
import type { GeoPoint } from "@yanabuy/shared";
import { GoogleMap, addressFor, getCurrentPosition } from "@yanabuy/web-kit";
import { MAPS_KEY } from "@/lib/maps";

/**
 * "Who is this for?" at checkout. For themselves, the pin is their current location (they can tap the
 * map to correct it). For someone else or another place, they tap the map where it should go.
 */
export function DeliveryPin({
  forOther,
  onForOther,
  pin,
  onPin,
  onAddress,
  start,
}: {
  forOther: boolean;
  onForOther: (v: boolean) => void;
  pin: GeoPoint | null;
  onPin: (p: GeoPoint | null) => void;
  /** Offers the address Google has for their spot. */
  onAddress: (address: string) => void;
  /** Where the map starts for "someone else" (their own last spot). */
  start: GeoPoint | null;
}) {
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);

  async function locate() {
    setLocating(true);
    setProblem(null);
    try {
      const p = await getCurrentPosition();
      onPin(p);
      setFound(await addressFor(MAPS_KEY, p));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't find your location");
    } finally {
      setLocating(false);
    }
  }

  useEffect(() => {
    if (!forOther && !pin) void locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forOther]);

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Who is this delivery for?" className="flex rounded-full bg-ground p-1 text-[13.5px] font-bold">
        {[
          { v: false, label: "Me — my current location" },
          { v: true, label: "Someone else / another place" },
        ].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={forOther === o.v}
            onClick={() => {
              if (forOther === o.v) return;
              onPin(null);
              setFound(null);
              setProblem(null);
              onForOther(o.v);
            }}
            className={`flex-1 rounded-full px-3 py-2 ${forOther === o.v ? "bg-white text-purple shadow-sm" : "text-soft"}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <GoogleMap
        apiKey={MAPS_KEY}
        height={240}
        center={pin ?? start}
        markers={pin ? [{ id: "drop", position: pin, color: "orange", title: forOther ? "Deliver here" : "You are here", info: "Tap the map to move the pin" }] : []}
        onPick={(p) => {
          onPin(p);
          setFound(null);
        }}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
        {forOther ? (
          <span className="text-muted">{pin ? "Pin set. Tap the map again to move it." : "Tap the map where it should go, so the rider can find it (optional)."}</span>
        ) : locating ? (
          <span className="text-muted">Finding your location…</span>
        ) : problem ? (
          <span className="font-semibold text-danger">{problem}</span>
        ) : pin ? (
          <span className="text-muted">The shop and rider will see this pin. Wrong spot? Tap the map to move it.</span>
        ) : null}
        {!forOther && (
          <button type="button" onClick={locate} disabled={locating} className="font-bold text-purple hover:underline disabled:opacity-50">
            {pin ? "Use my location again" : "Use my current location"}
          </button>
        )}
        {pin && (
          <button type="button" onClick={() => onPin(null)} className="font-bold text-muted hover:underline">
            Remove pin
          </button>
        )}
      </div>
      {found && !forOther && (
        <button type="button" onClick={() => onAddress(found)} className="self-start rounded-full border border-line-strong px-3 py-1.5 text-left text-[12.5px] hover:border-purple">
          📍 {found} — <span className="font-bold text-purple">use as the address</span>
        </button>
      )}
    </div>
  );
}
