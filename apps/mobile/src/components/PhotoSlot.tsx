import { useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import type { PrivateUpload } from "@yanabuy/shared";
import { colors, font } from "@/lib/theme";
import { askPhotoSource, pickPhoto, uploadPrivate, uploadPublic } from "./AvatarPicker";

type Shape = "card" | "portrait" | "square";
const RATIO: Record<Shape, number> = { card: 1.58, portrait: 0.75, square: 1 };
const ASPECT: Record<Shape, [number, number]> = { card: [16, 10], portrait: [3, 4], square: [1, 1] };

function Slot({
  label,
  hint,
  error,
  preview,
  shape,
  busy,
  onPress,
  placeholder,
}: {
  label: string;
  hint?: string;
  error?: string;
  preview: string | null;
  shape: Shape;
  busy: boolean;
  onPress: () => void;
  placeholder?: ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={preview ? `Replace: ${label}` : `Add: ${label}`}
        onPress={onPress}
        disabled={busy}
        style={{
          aspectRatio: RATIO[shape],
          width: "100%",
          borderRadius: 16,
          borderWidth: 2,
          borderStyle: preview ? "solid" : "dashed",
          borderColor: error ? colors.danger : preview ? colors.line : colors.lineStrong,
          backgroundColor: "#FBF9FC",
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {preview ? (
          <>
            <Image source={{ uri: preview }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
            <View style={{ position: "absolute", right: 8, bottom: 8, backgroundColor: "rgba(46,20,64,0.8)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 12, color: "#fff" }}>Replace</Text>
            </View>
          </>
        ) : (
          <View style={{ alignItems: "center", gap: 6, padding: 12 }}>
            {placeholder}
            <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.purple }}>Take or choose a photo</Text>
          </View>
        )}
        {busy && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.7)", alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.purple} />
          </View>
        )}
      </Pressable>
      {error ? (
        <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{error}</Text>
      ) : hint ? (
        <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** An ID side or selfie. Stored privately; `value.key` goes in the form. */
export function PrivatePhotoSlot({
  label,
  hint,
  error,
  value,
  onChange,
  shape = "card",
  front = false,
  placeholder,
}: {
  label: string;
  hint?: string;
  error?: string;
  value: PrivateUpload | null;
  onChange: (v: PrivateUpload) => void;
  shape?: Shape;
  /** Open the front (selfie) camera. */
  front?: boolean;
  placeholder?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const choose = () =>
    askPhotoSource(
      async (source) => {
        try {
          const asset = await pickPhoto(source, { aspect: ASPECT[shape], front });
          if (!asset) return;
          setBusy(true);
          const uploaded = await uploadPrivate(asset);
          if (uploaded) onChange(uploaded);
        } catch (err) {
          Alert.alert("Couldn't upload the photo", err instanceof Error ? err.message : "Please try again.");
        } finally {
          setBusy(false);
        }
      },
      undefined,
      label
    );
  return <Slot label={label} hint={hint} error={error} preview={value?.url ?? null} shape={shape} busy={busy} onPress={choose} placeholder={placeholder} />;
}

/** A public photo such as a shop logo. */
export function PublicPhotoSlot({
  label,
  hint,
  value,
  onChange,
  shape = "square",
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string) => void;
  shape?: Shape;
}) {
  const [busy, setBusy] = useState(false);
  const choose = () =>
    askPhotoSource(
      async (source) => {
        try {
          const asset = await pickPhoto(source, { aspect: ASPECT[shape] });
          if (!asset) return;
          setBusy(true);
          const url = await uploadPublic(asset);
          if (url) onChange(url);
        } catch (err) {
          Alert.alert("Couldn't upload the photo", err instanceof Error ? err.message : "Please try again.");
        } finally {
          setBusy(false);
        }
      },
      undefined,
      label
    );
  return <Slot label={label} hint={hint} preview={value} shape={shape} busy={busy} onPress={choose} />;
}
