"use client";

import { useState } from "react";
import type { GeoPoint, MyShop } from "@yanabuy/shared";
import { Alert, Button, GoogleMap, getCurrentPosition, messageOf } from "@yanabuy/web-kit";
import { api } from "@/lib/api";
import { MAPS_KEY } from "@/lib/maps";

/** The shop's pin: riders near it get delivery requests, and buyers see it on their order. */
export function ShopLocationCard({ shop, onSaved }: { shop: MyShop; onSaved: (s: MyShop) => void }) {
  const [pin, setPin] = useState<GeoPoint | null>(shop.location);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const changed = !!pin && (pin.lat !== shop.location?.lat || pin.lng !== shop.location?.lng);

  async function save(p: GeoPoint) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.shop.setLocation(p);
      onSaved(res.shop);
      setPin(p);
      setNotice({ tone: "success", text: "Shop location saved." });
    } catch (err) {
      setNotice({ tone: "danger", text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-6" aria-label="Shop location">
      <div>
        <h2 className="font-display text-lg font-extrabold">Shop location</h2>
        <p className="text-sm text-muted">Riders near this pin get your delivery requests. Stand at your shop and tap the button, or tap the map.</p>
      </div>
      {!shop.location && <Alert tone="warn">Your shop isn&rsquo;t on the map yet — set it so riders can find you.</Alert>}
      <GoogleMap apiKey={MAPS_KEY} height={240} markers={pin ? [{ id: "shop", position: pin, color: "purple", label: "S", title: shop.name }] : []} onPick={setPin} />
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          busy={busy}
          onClick={async () => {
            try {
              await save(await getCurrentPosition());
            } catch (err) {
              setNotice({ tone: "danger", text: messageOf(err) });
            }
          }}
        >
          📍 My shop is where I am now
        </Button>
        {changed && (
          <Button busy={busy} onClick={() => pin && save(pin)}>
            Save this spot
          </Button>
        )}
      </div>
    </section>
  );
}
