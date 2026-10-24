import { Modal, Pressable, Text, View } from "react-native";
import type { Fulfilment } from "@yanabuy/shared";
import { colors, font } from "@/lib/theme";

export const FOOD_HOW: { value: Fulfilment; icon: string; title: string; text: string }[] = [
  { value: "delivery", icon: "🛵", title: "Delivery", text: "A rider brings it to you. Delivery fee worked out at checkout." },
  { value: "pickup", icon: "🛍️", title: "Pickup", text: "Order ahead and collect it at the restaurant." },
  { value: "eat_in", icon: "🍽️", title: "Eat in", text: "Eat at the restaurant — you pay the restaurant's own menu price." },
];

/** "How do you want your food?" — shown when switching to Food. */
export function FoodHowPicker({ visible, current, onPick, onClose }: { visible: boolean; current: Fulfilment; onPick: (h: Fulfilment) => void; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(46,20,64,0.5)", justifyContent: "flex-end" }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36, gap: 10 }}>
          <Text accessibilityRole="header" style={{ fontFamily: font.extrabold, fontSize: 22, color: colors.ink }}>
            How do you want your food?
          </Text>
          <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted, marginTop: -4 }}>Menu prices depend on this. You can change it any time.</Text>
          {FOOD_HOW.map((o) => {
            const on = o.value === current;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => onPick(o.value)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 2, borderColor: on ? colors.orange : colors.line, backgroundColor: on ? "#FFE7D6" : colors.card, padding: 14 }}
              >
                <Text style={{ fontSize: 24 }}>{o.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 15, color: colors.ink }}>{o.title}</Text>
                  <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>{o.text}</Text>
                </View>
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
