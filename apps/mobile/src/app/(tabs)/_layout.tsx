import { Tabs } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "expo-router/tabs";
import { CartIcon, GridIcon, HomeIcon, SwapIcon, UserIcon } from "@/components/Icons";
import { useMode } from "@/lib/mode";
import { useCart } from "@/lib/cart";
import { colors, font } from "@/lib/theme";

const ICONS = { index: HomeIcon, categories: GridIcon, cart: CartIcon, profile: UserIcon } as const;
const LABELS = { index: "Home", categories: "Categories", cart: "Cart", profile: "Profile" } as const;

/** Bottom bar from the design: 4 tabs with the Goods/Food switch in the middle. */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { mode, toggle } = useMode();
  const { count } = useCart();
  const routes = state.routes;

  const tab = (index: number) => {
    const route = routes[index];
    const focused = state.index === index;
    const name = route.name as keyof typeof ICONS;
    const Icon = ICONS[name];
    // Food mode: you build an order, not a cart.
    const label = name === "cart" && mode === "food" ? "Order" : LABELS[name];
    const color = focused ? colors.purple : colors.muted;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={name === "cart" && count ? `${label}, ${count} items` : label}
        onPress={() => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
        style={{ width: 64, alignItems: "center", gap: 3, paddingTop: 10 }}
      >
        <View>
          <Icon color={color} />
          {name === "cart" && count > 0 && (
            <View style={{ position: "absolute", right: -10, top: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
              <Text style={{ fontFamily: font.extrabold, fontSize: 10.5, color: colors.ink }}>{count > 99 ? "99+" : count}</Text>
            </View>
          )}
        </View>
        <Text style={{ fontFamily: focused ? font.bold : font.semibold, fontSize: 10.5, color }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-around",
        backgroundColor: "#fff",
        borderTopWidth: 1,
        borderTopColor: colors.line,
        paddingBottom: Math.max(insets.bottom, 10),
      }}
    >
      {tab(0)}
      {tab(1)}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mode === "goods" ? "Switch to Food" : "Switch to Goods & Services"}
        onPress={toggle}
        style={{
          width: 60,
          height: 60,
          marginTop: -24,
          borderRadius: 30,
          borderWidth: 4,
          borderColor: colors.ground,
          backgroundColor: colors.purple,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SwapIcon color={mode === "goods" ? colors.amber : colors.orange} />
      </Pressable>
      {tab(2)}
      {tab(3)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="categories" />
      <Tabs.Screen name="cart" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
