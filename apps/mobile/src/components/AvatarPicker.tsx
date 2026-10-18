import { useState } from "react";
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { PrivateUpload } from "@yanabuy/shared";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";
import { Avatar } from "./ui";
import { CameraIcon } from "./Icons";

type Asset = ImagePicker.ImagePickerAsset;

/** Opens the camera (optionally the front one) or the gallery. Returns the chosen photo, or null. */
export async function pickPhoto(
  source: "camera" | "library",
  { aspect = [1, 1], front = false, crop = true }: { aspect?: [number, number]; front?: boolean; crop?: boolean } = {}
): Promise<Asset | null> {
  const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      source === "camera" ? "Camera access needed" : "Photo access needed",
      "Allow YanaBuy in your phone's settings to add a photo."
    );
    return null;
  }
  // quality < 1 makes iPhones send JPEG instead of HEIC, which every browser can show.
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: crop,
    aspect,
    quality: 0.8,
    ...(front ? { cameraType: ImagePicker.CameraType.front } : {}),
  };
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0];
}

function asFile(asset: Asset) {
  const type = asset.mimeType ?? "image/jpeg";
  const ext = type.split("/")[1] ?? "jpg";
  // In the web preview the picker gives a blob: link — send the real file.
  if (Platform.OS === "web" && asset.file) return asset.file;
  return { uri: asset.uri, name: asset.fileName ?? `photo.${ext}`, type };
}

/** Public photo (profile, logo): returns its link. */
export async function uploadPublic(asset: Asset) {
  const { urls } = await api.uploads.images([asFile(asset)]);
  return urls[0] ?? null;
}

/** Private photo (ID, selfie): returns its key and a short-lived preview link. */
export async function uploadPrivate(asset: Asset): Promise<PrivateUpload | null> {
  const { files } = await api.uploads.privateImages([asFile(asset)]);
  return files[0] ?? null;
}

export async function pickAndUploadPhoto(source: "camera" | "library", aspect: [number, number] = [1, 1]): Promise<string | null> {
  const asset = await pickPhoto(source, { aspect });
  return asset ? uploadPublic(asset) : null;
}

/** Asks "Take photo / Choose from gallery", the same on iPhone and Android. */
export function askPhotoSource(onPick: (source: "camera" | "library") => void, extra?: { label: string; onPress: () => void }, title = "Profile photo") {
  // The web preview has no action sheet: go straight to choosing a file.
  if (Platform.OS === "web") return onPick("library");
  const options = ["Take a photo", "Choose from gallery", ...(extra ? [extra.label] : []), "Cancel"];
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: extra ? 2 : undefined },
      (i) => {
        if (i === 0) onPick("camera");
        else if (i === 1) onPick("library");
        else if (extra && i === 2) extra.onPress();
      }
    );
  } else {
    Alert.alert(title, undefined, [
      { text: "Take a photo", onPress: () => onPick("camera") },
      { text: "Choose from gallery", onPress: () => onPick("library") },
      ...(extra ? [{ text: extra.label, style: "destructive" as const, onPress: extra.onPress }] : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }
}

export function AvatarPicker({ name, url, onChange }: { name: string; url: string | null; onChange: (url: string | null) => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  const choose = () =>
    askPhotoSource(
      async (source) => {
        try {
          setBusy(true);
          const uploaded = await pickAndUploadPhoto(source);
          if (uploaded) await onChange(uploaded);
        } catch (err) {
          Alert.alert("Couldn't upload the photo", err instanceof Error ? err.message : "Please try again.");
        } finally {
          setBusy(false);
        }
      },
      url ? { label: "Remove photo", onPress: () => onChange(null) } : undefined
    );

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={url ? "Change profile photo" : "Add profile photo"} onPress={choose} disabled={busy}>
      <View style={{ width: 84, height: 84 }}>
        <Avatar name={name} url={url} size={84} />
        {busy && (
          <View style={{ position: "absolute", inset: 0, borderRadius: 42, backgroundColor: "rgba(46,20,64,0.5)", alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
        <View
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: 32,
            height: 32,
            borderRadius: 16,
            borderWidth: 3,
            borderColor: "#fff",
            backgroundColor: colors.purple,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CameraIcon size={14} />
        </View>
      </View>
      <Text style={{ marginTop: 8, fontFamily: font.bold, fontSize: 13, color: colors.purple, textAlign: "center" }}>
        {url ? "Change photo" : "Add photo"}
      </Text>
    </Pressable>
  );
}
