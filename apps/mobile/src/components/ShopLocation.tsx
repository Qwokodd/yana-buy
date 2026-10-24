import { useState } from "react";
import { Text, View } from "react-native";
import type { GeoPoint, MyShop } from "@yanabuy/shared";
import { AppMap } from "@/components/Map";
import { Button, Card, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { currentPosition } from "@/lib/location";
import { colors, font } from "@/lib/theme";

/** The shop's pin: riders near it get its delivery requests, and buyers see it on their order. */
export function ShopLocationCard({ shop, onSaved }: { shop: MyShop; onSaved: (s: MyShop) => void }) {
  const [pin, setPin] = useState<GeoPoint | null>(shop.location);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const changed = !!pin && (pin.lat !== shop.location?.lat || pin.lng !== shop.location?.lng);

  async function save(get: () => Promise<GeoPoint>) {
    setBusy(true);
    setNotice(null);
    try {
      const p = await get();
      const res = await api.shop.setLocation(p);
      onSaved(res.shop);
      setPin(p);
      setNotice({ tone: "success", text: "Shop location saved." });
    } catch (err) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : "Couldn't save" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 10 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.ink }}>Shop location</Text>
      <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.textSoft }}>
        {shop.location ? "Riders near this pin get your delivery requests." : "Not on the map yet. Stand at your shop and tap the button so riders can find you."}
      </Text>
      <AppMap height={190} showMe pins={pin ? [{ id: "shop", position: pin, color: "purple", title: shop.name }] : []} onPick={setPin} />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <View style={{ gap: 8 }}>
        <Button title="📍 My shop is where I am now" variant="outline" busy={busy} onPress={() => save(currentPosition)} />
        {changed && <Button title="Save this spot" busy={busy} onPress={() => save(async () => pin!)} />}
      </View>
    </Card>
  );
}
