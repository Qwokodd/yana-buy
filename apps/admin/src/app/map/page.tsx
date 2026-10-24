"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatLiberianPhone, type AdminMap } from "@yanabuy/shared";
import { Alert, Button, GoogleMap, TextInput, messageOf, type MapMarker } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { MAPS_KEY } from "@/lib/maps";

type Layer = "shops" | "riders" | "buyers" | "orders";
const LAYERS: { key: Layer; label: string; dot: string }[] = [
  { key: "shops", label: "Shops & restaurants", dot: "bg-purple" },
  { key: "riders", label: "Riders", dot: "bg-[#1E9E5A]" },
  { key: "buyers", label: "Buyers", dot: "bg-[#2D6CDF]" },
  { key: "orders", label: "Open orders (drop-offs)", dot: "bg-orange" },
];

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

export default function LiveMapPage() {
  const [data, setData] = useState<AdminMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [on, setOn] = useState<Record<Layer, boolean>>({ shops: true, riders: true, buyers: false, orders: true });
  const [onlineOnly, setOnlineOnly] = useState(true);
  const [radius, setRadius] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api.admin
      .map()
      .then((m) => {
        setData(m);
        setError(null);
        setRadius((r) => r || String(m.radiusKm));
      })
      .catch((err) => setError(messageOf(err)));
  }, []);

  useEffect(() => {
    load();
    // Riders move — refresh every 30 seconds.
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const markers = useMemo<MapMarker[]>(() => {
    if (!data) return [];
    const out: MapMarker[] = [];
    if (on.shops)
      for (const s of data.shops)
        out.push({ id: `s-${s.id}`, position: s.location, color: s.status === "approved" ? "purple" : "gray", label: s.kind === "restaurant" ? "F" : "S", title: s.name, info: `${s.kind === "restaurant" ? "Restaurant" : "Shop"} · ${s.city}${s.fromOwner ? " · owner's last spot (pin not set)" : ""}${s.status !== "approved" ? ` · ${s.status}` : ""}` });
    if (on.riders)
      for (const r of data.riders)
        if (!onlineOnly || r.online)
          out.push({ id: `r-${r.id}`, position: r.location, color: r.online ? "green" : "gray", label: "R", title: r.fullName, info: `${r.online ? "Online" : "Offline"} · ${r.activeDeliveries} on the go · ${ago(r.location.at)} · ${formatLiberianPhone(r.phone)}` });
    if (on.buyers)
      for (const b of data.buyers) out.push({ id: `b-${b.id}`, position: b.location, color: "blue", title: b.fullName, info: `Buyer · seen ${ago(b.location.at)} · ${formatLiberianPhone(b.phone)}` });
    if (on.orders)
      for (const o of data.orders) out.push({ id: `o-${o.id}`, position: o.location, color: "orange", label: "D", title: `${o.number} drop-off`, info: `${o.shopName} · ${o.status.replace("_", " ")}` });
    return out;
  }, [data, on, onlineOnly]);

  const onlineRiders = data?.riders.filter((r) => r.online).length ?? 0;

  async function saveRadius() {
    const km = Number(radius);
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const res = await api.admin.setRiderRadius(km);
      setRadius(String(res.radiusKm));
      setNotice(`Shops now see online riders within ${res.radiusKm} km.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell title="Live map" subtitle="Shops, riders, buyers and open orders. Riders' spots update about every 30 seconds while they're online.">
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        {!MAPS_KEY && <Alert tone="warn">Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to apps/admin/.env.local and restart the admin app to see the map.</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          {LAYERS.map((l) => (
            <button
              key={l.key}
              aria-pressed={on[l.key]}
              onClick={() => setOn((s) => ({ ...s, [l.key]: !s[l.key] }))}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[13px] font-bold ${on[l.key] ? "border-purple bg-purple-tint text-purple" : "border-line-strong bg-white text-soft"}`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${l.dot}`} />
              {l.label}
              {data && <span className="font-semibold text-muted">{l.key === "shops" ? data.shops.length : l.key === "riders" ? data.riders.length : l.key === "buyers" ? data.buyers.length : data.orders.length}</span>}
            </button>
          ))}
          <label className="ml-1 inline-flex items-center gap-2 text-[13px] font-semibold">
            <input type="checkbox" checked={onlineOnly} onChange={(e) => setOnlineOnly(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--c-purple))]" />
            Only online riders ({onlineRiders})
          </label>
        </div>

        <GoogleMap apiKey={MAPS_KEY} markers={markers} height="62vh" zoom={12} />

        <section className="flex flex-wrap items-end gap-3 rounded-[20px] border border-line bg-white p-5">
          <div className="min-w-[200px] flex-1">
            <p className="font-bold">Rider search distance</p>
            <p className="text-[12.5px] text-muted">How far from a shop an online rider can be and still show up for the shop to pick.</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <TextInput type="number" min={0.5} max={100} step={0.5} value={radius} onChange={(e) => setRadius(e.target.value)} className="!w-24" aria-label="Distance in km" />
            km
          </label>
          <Button busy={saving} disabled={!Number(radius)} onClick={saveRadius}>
            Save
          </Button>
          {notice && <p className="w-full text-sm text-success">{notice}</p>}
        </section>

        <p className="text-[12.5px] text-muted">
          Shops without their own pin show at the owner&rsquo;s last spot until they set one in their shop page. Buyers show where they last opened YanaBuy (last 90 days).{" "}
          <Link href="/deliveries" className="font-bold text-purple hover:underline">
            Assign riders yourself →
          </Link>
        </p>
      </div>
    </AdminShell>
  );
}
