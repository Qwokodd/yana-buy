import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "@/lib/auth";
import { workspaceTitle } from "@/lib/workspace";
import { colors, font } from "@/lib/theme";

/** Sellers: everything for running the shop / restaurant in one menu by the search bar. */
export function SellerMenu() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (user?.role !== "vendor") return null;
  const food = user.myShop?.kind === "restaurant";
  const links: { href: Href; label: string }[] = [
    { href: "/sell", label: workspaceTitle(user) },
    { href: "/seller-orders", label: food ? "Restaurant orders" : "Shop orders" },
    { href: "/seller-products", label: food ? "My menu" : "My products" },
    { href: "/seller-bookings", label: food ? "Table bookings" : "Appointments" },
    { href: "/seller-earnings", label: "Earnings" },
    { href: "/seller-reviews", label: "Reviews" },
    { href: "/seller-profile", label: food ? "Restaurant profile" : "Shop profile" },
    ...(user.myShop ? [{ href: { pathname: "/shop/[slug]", params: { slug: user.myShop.slug } } as Href, label: food ? "View my restaurant page" : "View my storefront" }] : []),
    { href: "/orders", label: "My purchases" },
  ];
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${workspaceTitle(user)} menu`}
        onPress={() => setOpen(true)}
        style={{ height: 48, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.14)", flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Text style={{ fontFamily: font.bold, fontSize: 13, color: "#fff" }}>{food ? "Restaurant" : "Shop"}</Text>
        <Text style={{ fontFamily: font.bold, fontSize: 12, color: "#fff" }}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(46,20,64,0.45)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingVertical: 12, paddingBottom: 32 }}>
            <Text style={{ fontFamily: font.extrabold, fontSize: 18, color: colors.ink, paddingHorizontal: 20, paddingVertical: 8 }}>{workspaceTitle(user)}</Text>
            {links.map((l) => (
              <Pressable
                key={l.label}
                accessibilityRole="link"
                onPress={() => {
                  setOpen(false);
                  router.push(l.href);
                }}
                style={({ pressed }) => ({ paddingHorizontal: 20, paddingVertical: 13, backgroundColor: pressed ? colors.purpleTint : "transparent" })}
              >
                <Text style={{ fontFamily: font.semibold, fontSize: 15, color: colors.ink }}>{l.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
