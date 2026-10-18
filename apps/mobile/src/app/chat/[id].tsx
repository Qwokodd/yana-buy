import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { formatLD, type ChatMessage, type ConversationSummary } from "@yanabuy/shared";
import { BackBar } from "@/components/Products";
import { Notice } from "@/components/ui";
import { askPhotoSource, pickPhoto, uploadPublic } from "@/components/AvatarPicker";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";
import { chatTime } from "@/lib/chat";

export default function ChatScreen() {
  const { id, product, order } = useLocalSearchParams<{ id: string; product?: string; order?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [conv, setConv] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [about, setAbout] = useState<{ productId?: string; productName?: string; orderId?: string }>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const lastAt = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (product) {
      api.public
        .product(product)
        .then((r) => setAbout((a) => ({ ...a, productId: r.product.id, productName: r.product.name })))
        .catch(() => {});
    }
    if (order) setAbout((a) => ({ ...a, orderId: order }));
  }, [product, order]);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set((prev ?? []).map((m) => m.id));
      return [...(prev ?? []), ...incoming.filter((m) => !seen.has(m.id))];
    });
    lastAt.current = incoming[incoming.length - 1].createdAt;
  }, []);

  useEffect(() => {
    let stopped = false;
    api.chats
      .get(id)
      .then((res) => {
        if (stopped) return;
        setConv(res.conversation);
        setMessages(res.messages);
        lastAt.current = res.messages.at(-1)?.createdAt;
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't open the chat"));
    const t = setInterval(() => {
      api.chats
        .get(id, lastAt.current)
        .then((res) => !stopped && merge(res.messages))
        .catch(() => {});
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [id, merge]);

  async function send() {
    if (!text.trim() && !image) return;
    setBusy(true);
    setError(null);
    try {
      const { message } = await api.chats.send(id, { body: text.trim() || null, imageUrl: image, productId: about.productId ?? null, orderId: about.orderId ?? null });
      merge([message]);
      setText("");
      setImage(null);
      setAbout({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setBusy(false);
    }
  }

  const attach = () =>
    askPhotoSource(
      async (source) => {
        try {
          const asset = await pickPhoto(source, { crop: false });
          if (!asset) return;
          setUploading(true);
          setImage(await uploadPublic(asset));
        } catch (err) {
          Alert.alert("Couldn't upload the photo", err instanceof Error ? err.message : "Please try again.");
        } finally {
          setUploading(false);
        }
      },
      undefined,
      "Send a photo"
    );

  const title = conv ? (conv.side === "buyer" ? conv.shop.name : conv.buyer.fullName) : "Chat";

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + 8, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <BackBar
          title={title}
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/messages"))}
          right={
            conv?.side === "buyer" ? (
              <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/shop/[slug]", params: { slug: conv.shop.slug } })} style={{ paddingHorizontal: 8 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>Shop ›</Text>
              </Pressable>
            ) : null
          }
        />
      </View>
      <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })} contentContainerStyle={{ padding: 14, gap: 8 }}>
        {messages === null && !error && <ActivityIndicator color={colors.purple} />}
        {messages?.length === 0 && (
          <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: colors.muted, textAlign: "center", backgroundColor: "#fff", borderRadius: 14, padding: 12 }}>
            Say hello! Keep payments inside YanaBuy so we can help if something goes wrong.
          </Text>
        )}
        {messages?.map((m) => {
          const admin = m.sender === "admin";
          const bg = admin ? "#FFF1D6" : m.mine ? colors.purple : "#fff";
          const fg = m.mine && !admin ? "#fff" : colors.ink;
          return (
            <View
              key={m.id}
              style={{ alignSelf: admin ? "center" : m.mine ? "flex-end" : "flex-start", maxWidth: "80%", backgroundColor: bg, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, gap: 3 }}
            >
              {admin && <Text style={{ fontFamily: font.extrabold, fontSize: 11.5, color: colors.ink }}>YanaBuy</Text>}
              {m.product && (
                <Pressable
                  onPress={() => router.push({ pathname: "/product/[id]", params: { id: m.product!.id } })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: m.mine ? "rgba(255,255,255,0.15)" : colors.ground, borderRadius: 12, padding: 6 }}
                >
                  {m.product.image && <Image source={{ uri: m.product.image }} style={{ width: 36, height: 36, borderRadius: 8 }} />}
                  <View style={{ flexShrink: 1 }}>
                    <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 12.5, color: fg }}>
                      {m.product.name}
                    </Text>
                    <Text style={{ fontFamily: font.regular, fontSize: 12, color: fg }}>{formatLD(m.product.price)}</Text>
                  </View>
                </Pressable>
              )}
              {m.order && <Text style={{ fontFamily: font.bold, fontSize: 12, color: m.mine ? "rgba(255,255,255,0.8)" : colors.purple }}>About order {m.order.number}</Text>}
              {m.imageUrl && <Image source={{ uri: m.imageUrl }} style={{ width: 200, height: 200, borderRadius: 12 }} contentFit="cover" />}
              {m.body && <Text style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 20, color: fg }}>{m.body}</Text>}
              <Text style={{ fontFamily: font.regular, fontSize: 10.5, color: m.mine && !admin ? "rgba(255,255,255,0.7)" : colors.muted, alignSelf: "flex-end" }}>{chatTime(m.createdAt)}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={{ backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: colors.line, padding: 10, paddingBottom: insets.bottom + 10, gap: 8 }}>
        {error && <Notice>{error}</Notice>}
        {(about.productName || about.orderId || image) && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {about.productName && (
              <Pressable onPress={() => setAbout((a) => ({ ...a, productId: undefined, productName: undefined }))} style={{ backgroundColor: colors.purpleTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.ink }}>About: {about.productName}  ✕</Text>
              </Pressable>
            )}
            {about.orderId && (
              <Pressable onPress={() => setAbout((a) => ({ ...a, orderId: undefined }))} style={{ backgroundColor: colors.purpleTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.ink }}>About your order  ✕</Text>
              </Pressable>
            )}
            {image && (
              <Pressable accessibilityLabel="Remove photo" onPress={() => setImage(null)}>
                <Image source={{ uri: image }} style={{ width: 56, height: 56, borderRadius: 10 }} />
              </Pressable>
            )}
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a photo"
            onPress={attach}
            disabled={uploading}
            style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center" }}
          >
            {uploading ? <ActivityIndicator color={colors.purple} /> : <Text style={{ fontSize: 18 }}>📷</Text>}
          </Pressable>
          <TextInput
            accessibilityLabel="Message"
            value={text}
            onChangeText={setText}
            placeholder="Write a message…"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={2000}
            style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, fontFamily: font.regular, fontSize: 15, color: colors.ink }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            onPress={send}
            disabled={busy || (!text.trim() && !image)}
            style={{ height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.purple, alignItems: "center", justifyContent: "center", opacity: busy || (!text.trim() && !image) ? 0.5 : 1 }}
          >
            <Text style={{ fontFamily: font.bold, fontSize: 14, color: "#fff" }}>Send</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
