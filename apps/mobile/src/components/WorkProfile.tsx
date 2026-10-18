import { useEffect, useState } from "react";
import { Dimensions, Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { formatLD, videoInfo, type PortfolioItem, type ProductCard, type PublicShop, type WorkProfile } from "@yanabuy/shared";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

const H = ({ children }: { children: string }) => <Text style={{ fontFamily: font.display, fontSize: 19, color: colors.ink }}>{children}</Text>;

function Chips({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 11.5, letterSpacing: 0.6, color: colors.muted, textTransform: "uppercase" }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {items.map((s) => (
          <View key={s} style={{ borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: "#fff" }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 13, color: colors.textSoft }}>{s}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** About, experience, skills, languages and where they work. */
export function AboutWork({ shop, profile }: { shop: PublicShop; profile: WorkProfile }) {
  const facts = [
    profile.yearsExperience ? `${profile.yearsExperience}+ years' experience` : null,
    profile.servesAt.includes("home") ? "🚗 Comes to you" : null,
    profile.servesAt.includes("shop") ? "🏠 At our place" : null,
  ].filter(Boolean) as string[];
  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 12 }}>
      {facts.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {facts.map((f) => (
            <View key={f} style={{ backgroundColor: colors.purpleTint, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>{f}</Text>
            </View>
          ))}
        </View>
      )}
      {profile.about || shop.description ? <Text style={{ fontFamily: font.regular, fontSize: 14.5, lineHeight: 21, color: colors.textSoft }}>{profile.about || shop.description}</Text> : null}
      <Chips label="Skills" items={profile.skills} />
      <Chips label="Certifications" items={profile.certifications} />
      <Chips label="Works in" items={profile.serviceAreas} />
      <Chips label="Speaks" items={profile.languages} />
    </View>
  );
}

function VideoTile({ url, title, width }: { url: string; title: string | null; width: number }) {
  const v = videoInfo(url);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={title ?? `Watch on ${v.label}`} onPress={() => Linking.openURL(url).catch(() => {})} style={{ width, gap: 6 }}>
      <View style={{ width, height: (width * 9) / 16, borderRadius: 16, overflow: "hidden", backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
        {v.thumbnail && <Image source={{ uri: v.thumbnail }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" />}
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontSize: 22, marginLeft: 3 }}>▶</Text>
        </View>
        <View style={{ position: "absolute", left: 8, top: 8, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 11, color: "#fff" }}>{v.label}</Text>
        </View>
      </View>
      {title ? <Text style={{ fontFamily: font.semibold, fontSize: 13.5, color: colors.ink }} numberOfLines={2}>{title}</Text> : null}
    </Pressable>
  );
}

export function Videos({ videos }: { videos: WorkProfile["videos"] }) {
  if (!videos.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <H>Videos</H>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 18 }} style={{ marginRight: -18 }}>
        {videos.map((v) => (
          <VideoTile key={v.url} url={v.url} title={v.title} width={240} />
        ))}
      </ScrollView>
    </View>
  );
}

/** Past work as a photo grid; tapping one opens all its photos, the story and any video. */
export function Portfolio({ slug, count, label }: { slug: string; count: number; label: string }) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [open, setOpen] = useState<PortfolioItem | null>(null);
  useEffect(() => {
    if (!count) return;
    api.public
      .portfolio(slug)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [slug, count]);
  if (!count) return null;
  const screen = Dimensions.get("window").width;
  const tile = (screen - 36 - 10) / 2;

  return (
    <View style={{ gap: 10 }}>
      <H>{`${label} · ${count}`}</H>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {(items ?? Array.from({ length: Math.min(count, 4) }, () => null)).map((it, i) => {
          if (!it) return <View key={i} style={{ width: tile, height: tile, borderRadius: 16, backgroundColor: colors.lineStrong, opacity: 0.5 }} />;
          const cover = it.images[0] ?? (it.videoUrl ? videoInfo(it.videoUrl).thumbnail : null);
          return (
            <Pressable key={it.id} accessibilityRole="button" accessibilityLabel={it.title} onPress={() => setOpen(it)} style={{ width: tile, height: tile, borderRadius: 16, overflow: "hidden", backgroundColor: colors.ink }}>
              {cover ? <Image source={{ uri: cover }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <Text style={{ color: "#fff", fontSize: 28, textAlign: "center", marginTop: tile / 2 - 18 }}>▶</Text>}
              <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 8, backgroundColor: "rgba(0,0,0,0.5)" }}>
                <Text style={{ fontFamily: font.bold, fontSize: 13, color: "#fff" }} numberOfLines={1}>
                  {it.title}
                </Text>
              </View>
              {it.images.length > 1 || it.videoUrl ? (
                <View style={{ position: "absolute", right: 6, top: 6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 11, color: "#fff" }}>{[it.images.length > 1 ? `${it.images.length} photos` : null, it.videoUrl ? "▶" : null].filter(Boolean).join(" · ")}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        {open && (
          <View style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ flex: 1, fontFamily: font.display, fontSize: 18, color: "#fff" }} numberOfLines={1}>
                {open.title}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(null)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.15)" }}>
                <Text style={{ fontFamily: font.bold, color: "#fff" }}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 14 }}>
              {open.images.length > 0 && (
                <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
                  {open.images.map((src, i) => (
                    <Image key={src} source={{ uri: src }} style={{ width: screen, height: screen }} contentFit="contain" accessibilityLabel={`${open.title}, photo ${i + 1} of ${open.images.length}`} />
                  ))}
                </ScrollView>
              )}
              {open.images.length > 1 && <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: "rgba(255,255,255,0.7)", textAlign: "center" }}>{`${open.images.length} photos — swipe`}</Text>}
              <View style={{ paddingHorizontal: 16, gap: 12 }}>
                {open.description ? <Text style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: "#fff" }}>{open.description}</Text> : null}
                {open.videoUrl ? <VideoTile url={open.videoUrl} title={null} width={screen - 32} /> : null}
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

/** Their services with prices, each with a Book button. */
export function ServicesMenu({ slug, services }: { slug: string; services: ProductCard[] }) {
  const router = useRouter();
  if (!services.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <H>Services & prices</H>
      <View style={{ backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}>
        {services.map((p, i) => (
          <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/product/[id]", params: { id: p.id } })} style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 14.5, color: colors.ink }}>{p.name}</Text>
              <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted }}>{p.hasOptions ? `from ${formatLD(p.price)}` : formatLD(p.price)}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Book ${p.name}`} onPress={() => router.push({ pathname: "/book", params: { slug, product: p.id } })} style={{ backgroundColor: colors.amber, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>Book</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
