import { useEffect, useState } from "react";
import { AccessibilityInfo, Linking, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import type { Banner } from "@yanabuy/shared";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

/** Opens a banner's link: YanaBuy pages inside the app, anything else in the browser. */
export function useOpenBanner() {
  const router = useRouter();
  return (b: Banner) => {
    if (!b.linkUrl) return;
    api.public.bannerClick(b.id);
    if (/^https?:\/\//.test(b.linkUrl)) return void Linking.openURL(b.linkUrl).catch(() => {});
    // YanaBuy pages: the website's paths, opened as the matching app screen.
    const [path, query = ""] = b.linkUrl.split("?");
    const params = Object.fromEntries(new URLSearchParams(query));
    const parts = path.split("/").filter(Boolean);
    if (parts[0] === "p" && parts[1]) router.push({ pathname: "/product/[id]", params: { id: parts[1] } });
    else if (parts[0] === "shop" && parts[1]) router.push({ pathname: "/shop/[slug]", params: { slug: parts[1] } });
    else if (parts[0] === "search") router.push({ pathname: "/search", params });
    else if (parts[0] === "shops") router.push({ pathname: "/shops", params });
    else if (parts[0] === "china") router.push("/china");
    else if (parts[0] === "sell") router.push("/sell");
  };
}

const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

/** Plays a banner's 5–10 second video: muted, on a loop. */
function BannerVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={FILL} contentFit="cover" nativeControls={false} accessible={false} />;
}

/** The banner's picture, with its video on top when it has one (just the picture for people who turned on Reduce Motion). */
export function BannerMedia({ banner }: { banner: Banner }) {
  const [still, setStill] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setStill)
      .catch(() => {});
  }, []);
  return (
    <>
      {banner.imageUrl ? <Image source={{ uri: banner.imageUrl }} style={FILL} contentFit="cover" /> : null}
      {banner.videoUrl && !still ? <BannerVideo url={banner.videoUrl} /> : null}
    </>
  );
}

function AdTag({ banner }: { banner: Banner }) {
  if (banner.kind !== "ad") return null;
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4 }}>
      <Text style={{ fontFamily: font.extrabold, fontSize: 10, letterSpacing: 0.5, color: colors.ink }}>{`AD${banner.advertiser ? ` · ${banner.advertiser.toUpperCase()}` : ""}`}</Text>
    </View>
  );
}

/** Swipeable top banners with page dots. */
export function HeroBanners({ banners }: { banners: Banner[] }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 36;
  const [index, setIndex] = useState(0);
  const open = useOpenBanner();

  return (
    <View style={{ gap: 8 }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + 12}
        decelerationRate="fast"
        contentContainerStyle={{ gap: 12 }}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / (cardWidth + 12)))}
        accessibilityLabel="Featured"
      >
        {banners.map((b) => (
          <Pressable
            key={b.id}
            accessibilityRole={b.linkUrl ? "link" : "image"}
            accessibilityLabel={b.title}
            onPress={() => open(b)}
            style={{ width: cardWidth, height: 160, borderRadius: 20, overflow: "hidden", backgroundColor: colors.ink }}
          >
            <BannerMedia banner={b} />
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(46,20,64,0.45)" }} />
            <View style={{ flex: 1, justifyContent: "flex-end", padding: 16 }}>
              <AdTag banner={b} />
              <Text style={{ fontFamily: font.display, fontSize: 22, lineHeight: 24, color: "#fff", maxWidth: 260 }}>{b.title}</Text>
              {b.subtitle && <Text style={{ marginTop: 4, fontFamily: font.regular, fontSize: 13, color: "rgba(255,255,255,0.88)", maxWidth: 280 }} numberOfLines={2}>{b.subtitle}</Text>}
              {b.buttonLabel && (
                <View style={{ marginTop: 10, alignSelf: "flex-start", backgroundColor: colors.amber, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.ink }}>{b.buttonLabel}</Text>
                </View>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
      {banners.length > 1 && (
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }} accessibilityElementsHidden>
          {banners.map((b, i) => (
            <View key={b.id} style={{ height: 6, width: i === index ? 18 : 6, borderRadius: 3, backgroundColor: i === index ? colors.purple : colors.lineStrong }} />
          ))}
        </View>
      )}
    </View>
  );
}

/** Smaller promo cards in a row. */
export function PromoCards({ banners }: { banners: Banner[] }) {
  const open = useOpenBanner();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} accessibilityLabel="Promotions">
      {banners.map((b) => (
        <Pressable
          key={b.id}
          accessibilityRole={b.linkUrl ? "link" : "image"}
          accessibilityLabel={b.kind === "ad" ? `Ad: ${b.title}` : b.title}
          onPress={() => open(b)}
          style={{ width: 230, height: 120, borderRadius: 18, overflow: "hidden", backgroundColor: colors.purple }}
        >
          <BannerMedia banner={b} />
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(46,20,64,0.4)" }} />
          <View style={{ flex: 1, justifyContent: "flex-end", padding: 12 }}>
            <AdTag banner={b} />
            <Text style={{ fontFamily: font.display, fontSize: 16, lineHeight: 18, color: "#fff" }} numberOfLines={2}>
              {b.title}
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** One wide banner shown between rows of products in the endless feed. */
export function FeedAd({ banner }: { banner: Banner }) {
  const open = useOpenBanner();
  return (
    <Pressable
      accessibilityRole={banner.linkUrl ? "link" : "image"}
      accessibilityLabel={banner.kind === "ad" ? `Ad: ${banner.title}` : banner.title}
      onPress={() => open(banner)}
      style={{ height: 150, borderRadius: 20, overflow: "hidden", backgroundColor: colors.purple }}
    >
      <BannerMedia banner={banner} />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(46,20,64,0.35)" }} />
      <View style={{ flex: 1, justifyContent: "flex-end", padding: 14 }}>
        <AdTag banner={banner} />
        <Text style={{ fontFamily: font.display, fontSize: 18, lineHeight: 21, color: "#fff" }} numberOfLines={2}>
          {banner.title}
        </Text>
        {!!banner.subtitle && (
          <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: "rgba(255,255,255,0.88)" }} numberOfLines={1}>
            {banner.subtitle}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/** Category icon: the admin's picture, or the first letters on a soft tile. */
export function CategoryTile({ name, iconUrl, size = 54 }: { name: string; iconUrl: string | null; size?: number }) {
  const letters = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return iconUrl ? (
    <Image source={{ uri: iconUrl }} style={{ width: size, height: size, borderRadius: size / 3 }} contentFit="cover" />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: colors.purpleTint, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: font.display, fontSize: size * 0.33, color: colors.purple }}>{letters || "?"}</Text>
    </View>
  );
}
