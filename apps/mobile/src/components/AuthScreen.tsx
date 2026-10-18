import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { BackIcon, BagLogo } from "./Icons";
import { colors, font } from "@/lib/theme";

export function AuthScreen({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }}
        >
          <BackIcon />
        </Pressable>
        <View style={{ marginTop: 22, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.purple, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 }}>
          <BagLogo size={24} />
          <Text style={{ fontFamily: font.display, fontSize: 18, color: "#fff" }}>
            YANA<Text style={{ color: colors.amber }}>BUY</Text>
          </Text>
        </View>
        <Text style={{ marginTop: 22, fontFamily: font.display, fontSize: 30, color: colors.ink }}>{title}</Text>
        <Text style={{ marginTop: 4, marginBottom: 22, fontFamily: font.regular, fontSize: 15, color: colors.muted, lineHeight: 21 }}>{subtitle}</Text>
        <View style={{ gap: 16 }}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
