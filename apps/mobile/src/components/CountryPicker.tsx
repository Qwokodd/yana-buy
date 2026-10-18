import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { COUNTRIES, countryInfo, type Country } from "@yanabuy/shared";
import { useCountry } from "@/lib/country";
import { colors, font } from "@/lib/theme";

/** The country drop-down in the Home header. */
export function CountryPicker() {
  const { country, setCountry } = useCountry();
  const [open, setOpen] = useState(false);
  const me = countryInfo(country);
  const pick = (c: Country) => {
    setOpen(false);
    setCountry(c);
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Shopping in ${me.name}. Change country`}
        onPress={() => setOpen(true)}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.14)" }}
      >
        <Text style={{ fontSize: 16 }}>{me.flag}</Text>
        <Text style={{ fontFamily: font.bold, fontSize: 13, color: "#fff" }}>{me.name}</Text>
        <Text style={{ fontFamily: font.bold, fontSize: 11, color: "#fff" }}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="Close" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(26,16,37,0.45)", justifyContent: "center", padding: 28 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: "#fff", borderRadius: 22, padding: 18, gap: 10 }}>
            <Text accessibilityRole="header" style={{ fontFamily: font.display, fontSize: 19, color: colors.ink }}>
              Where are you shopping?
            </Text>
            <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>You'll see shops and products from this country.</Text>
            {COUNTRIES.map((c) => {
              const on = c.code === country;
              return (
                <Pressable
                  key={c.code}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => pick(c.code)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 2, borderColor: on ? colors.purple : colors.line, backgroundColor: on ? colors.purpleTint : "#fff", borderRadius: 16, padding: 14 }}
                >
                  <Text style={{ fontSize: 24 }}>{c.flag}</Text>
                  <Text style={{ flex: 1, fontFamily: font.bold, fontSize: 16, color: colors.ink }}>{c.name}</Text>
                  {on && <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.purple }}>✓</Text>}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** Shown on a shop or product from another country (opened from a link or a chat). */
export function CountryNotice({ country, what = "shop" }: { country: Country; what?: "shop" | "product" }) {
  const { country: shopping, setCountry } = useCountry();
  if (country === shopping) return null;
  const there = countryInfo(country);
  return (
    <View style={{ backgroundColor: "#FFF1D6", borderRadius: 16, padding: 12, gap: 8 }}>
      <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.ink }}>
        {`${there.flag} This ${what === "shop" ? "shop" : "item"} is in `}
        <Text style={{ fontFamily: font.bold }}>{there.name}</Text>
        {`. You're shopping in ${countryInfo(shopping).name}.`}
      </Text>
      <Pressable accessibilityRole="button" onPress={() => setCountry(country)} style={{ alignSelf: "flex-start", backgroundColor: colors.purple, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 13, color: "#fff" }}>{`Switch to ${there.name}`}</Text>
      </Pressable>
    </View>
  );
}
