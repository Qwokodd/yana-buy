import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "@/lib/theme";

type P = { size?: number; color?: string };

export const HomeIcon = ({ size = 22, color = "#6B6275" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 10.5 12 4l8 6.5V20H4v-9.5Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
  </Svg>
);
export const GridIcon = ({ size = 22, color = "#6B6275" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={4} y={4} width={7} height={7} rx={2} stroke={color} strokeWidth={1.8} />
    <Rect x={13} y={4} width={7} height={7} rx={2} stroke={color} strokeWidth={1.8} />
    <Rect x={4} y={13} width={7} height={7} rx={2} stroke={color} strokeWidth={1.8} />
    <Rect x={13} y={13} width={7} height={7} rx={2} stroke={color} strokeWidth={1.8} />
  </Svg>
);
export const CartIcon = ({ size = 22, color = "#6B6275" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 5h2l1.6 9.6a2 2 0 0 0 2 1.7h7.6a2 2 0 0 0 2-1.6L20.5 8H6.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    <Circle cx={10} cy={20} r={1.3} fill={color} />
    <Circle cx={17} cy={20} r={1.3} fill={color} />
  </Svg>
);
export const UserIcon = ({ size = 22, color = "#6B6275" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={8.5} r={3.6} stroke={color} strokeWidth={1.8} />
    <Path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);
export const SwapIcon = ({ size = 24, color = "#FFAC00" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M7 7h11l-3-3M17 17H6l3 3" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
export const CameraIcon = ({ size = 16, color = "#fff" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={7} width={18} height={13} rx={3} stroke={color} strokeWidth={2.2} />
    <Circle cx={12} cy={13.5} r={3} stroke={color} strokeWidth={2.2} />
    <Path d="M9 7l1.5-3h3L15 7" stroke={color} strokeWidth={2.2} />
  </Svg>
);
export const SearchIcon = ({ size = 18, color = "#6B6275" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={2} />
    <Path d="m20 20-3.5-3.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);
export const BackIcon = ({ size = 18, color = "#2E1440" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M15 5l-7 7 7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
export const BagLogo = ({ size = 28, handle = "#fff" }: { size?: number; handle?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" fill={colors.amber} />
    <Path d="M9 8V6.5a3 3 0 0 1 6 0V8" stroke={handle} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);

export const ChevronIcon = ({ size = 18, color = "#6B6275" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="m9 6 6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
export const StoreIcon = ({ size = 22, color = "#fff" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.1 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5M5.5 12v8h13v-8" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
  </Svg>
);
