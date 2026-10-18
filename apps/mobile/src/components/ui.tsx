import { forwardRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { colors, font } from "@/lib/theme";

export function Button({
  title,
  onPress,
  variant = "primary",
  busy,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "accent" | "outline" | "danger" | "ghost";
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = { primary: colors.purple, accent: colors.amber, outline: "#fff", danger: colors.danger, ghost: "transparent" }[variant];
  const fg = { primary: "#fff", accent: colors.ink, outline: colors.purple, danger: "#fff", ghost: colors.danger }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === "outline" && { borderWidth: 2, borderColor: colors.purple },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export const Field = forwardRef<TextInput, TextInputProps & { label: string; error?: string; hint?: string; secure?: boolean }>(
  function Field({ label, error, hint, secure, style, ...props }, ref) {
    const [hidden, setHidden] = useState(true);
    return (
      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
        <View>
          <TextInput
            ref={ref}
            accessibilityLabel={label}
            placeholderTextColor="#9A91A3"
            secureTextEntry={secure ? hidden : false}
            style={[styles.input, { color: colors.ink }, error ? { borderColor: colors.danger } : null, secure ? { paddingRight: 70 } : null, style]}
            {...props}
          />
          {secure && (
            <Pressable accessibilityRole="button" onPress={() => setHidden((h) => !h)} style={styles.showBtn} hitSlop={8}>
              <Text style={[styles.showText, { color: colors.purple }]}>{hidden ? "Show" : "Hide"}</Text>
            </Pressable>
          )}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    );
  }
);

export function Notice({ tone = "danger", children }: { tone?: "danger" | "success" | "info"; children: ReactNode }) {
  const bg = { danger: colors.dangerTint, success: colors.successTint, info: colors.purpleTint }[tone];
  const fg = { danger: "#8A0B21", success: colors.success, info: colors.purple }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 14, padding: 14 }}>
      <Text style={{ color: fg, fontFamily: font.bold, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export function Avatar({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.purpleTint, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: font.display, color: colors.purple, fontSize: size * 0.36 }}>{initials || "?"}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export const styles = StyleSheet.create({
  button: { height: 52, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  buttonText: { fontFamily: font.bold, fontSize: 15 },
  label: { fontFamily: font.bold, fontSize: 13 },
  input: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    fontFamily: font.regular,
    fontSize: 15,
  },
  showBtn: { position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" },
  showText: { fontFamily: font.bold, fontSize: 13 },
  error: { fontFamily: font.semibold, fontSize: 12.5, color: colors.danger },
  hint: { fontFamily: font.regular, fontSize: 12.5, color: colors.muted },
  card: { backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 16 },
});
