import { Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useWishlist } from "@/lib/wishlist";

/** Save / unsave a product. */
export function HeartButton({ productId, name, size = 34 }: { productId: string; name: string; size?: number }) {
  const wish = useWishlist();
  const on = wish.has(productId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={on ? `Remove ${name} from your wishlist` : `Save ${name} to your wishlist`}
      hitSlop={6}
      onPress={() => void wish.toggle(productId)}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#ECE5EE" }}
    >
      <Svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24">
        <Path
          d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.3 1.1 5 3 1.7-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"
          fill={on ? "#C8102E" : "none"}
          stroke={on ? "#C8102E" : "#4E4459"}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}
