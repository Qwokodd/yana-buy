"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatLD, type ChatMessage, type ConversationSummary } from "@yanabuy/shared";
import { Alert, Avatar, messageOf, useAuth } from "@yanabuy/web-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { ShopLogo } from "@/components/ShopTile";
import { api } from "@/lib/api";

const time = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** The other person in a chat, from my side. */
const other = (c: ConversationSummary) =>
  c.side === "buyer" ? { name: c.shop.name, url: c.shop.logoUrl, isShop: true } : { name: c.buyer.fullName, url: c.buyer.avatarUrl, isShop: false };

export default function MessagesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [context, setContext] = useState<{ product?: string; order?: string }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/messages");
  }, [loading, user, router]);

  // ?c=<chat>&product=<id>&order=<id> opens a chat, ready to ask about that item.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setOpenId(p.get("c"));
    setContext({ product: p.get("product") ?? undefined, order: p.get("order") ?? undefined });
  }, []);

  const loadList = useCallback(() => {
    api.chats
      .list()
      .then((res) => {
        setList(res.items);
        window.dispatchEvent(new Event("yanabuy:read"));
      })
      .catch((err) => setError(messageOf(err)));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadList();
    const t = setInterval(loadList, 15000);
    return () => clearInterval(t);
  }, [user, loadList]);

  function pick(id: string | null) {
    setOpenId(id);
    setContext({});
    window.history.replaceState(null, "", id ? `/messages?c=${id}` : "/messages");
  }

  const open = list?.find((c) => c.id === openId) ?? null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 py-6 sm:px-8">
        <h1 className={`font-display text-[26px] font-extrabold ${openId ? "hidden md:block" : ""}`}>Messages</h1>
        {error && <Alert>{error}</Alert>}
        <div className="grid h-[calc(100vh-190px)] min-h-[460px] overflow-hidden rounded-card border border-line bg-white md:grid-cols-[340px_minmax(0,1fr)]">
          <aside className={`flex-col overflow-y-auto border-r border-line ${openId ? "hidden md:flex" : "flex"}`} aria-label="Chats">
            {list === null && <p className="p-5 text-sm text-muted">Loading…</p>}
            {list?.length === 0 && (
              <div className="p-6 text-center text-sm text-muted">
                <p className="font-bold text-ink">No messages yet</p>
                <p className="mt-1">Tap &ldquo;Ask the shop a question&rdquo; on any product to start a chat.</p>
              </div>
            )}
            {list?.map((c) => {
              const o = other(c);
              return (
                <button
                  key={c.id}
                  onClick={() => pick(c.id)}
                  aria-current={c.id === openId ? "true" : undefined}
                  className={`flex items-center gap-3 border-b border-line px-4 py-3 text-left ${c.id === openId ? "bg-purple-tint/50" : "hover:bg-ground"}`}
                >
                  {o.isShop ? <ShopLogo name={o.name} url={o.url} size={44} /> : <Avatar name={o.name} url={o.url} size={44} />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${c.unread ? "font-extrabold" : "font-bold"}`}>{o.name}</span>
                      <span className="flex-shrink-0 text-[11.5px] text-muted">{time(c.lastMessageAt)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`truncate text-[13px] ${c.unread ? "font-semibold text-ink" : "text-muted"}`}>
                        {c.side === "shop" && <span className="text-purple">Your shop · </span>}
                        {c.lastMessage ?? "No messages yet"}
                      </span>
                      {c.unread > 0 && (
                        <span className="ml-auto flex-shrink-0 rounded-full bg-amber px-1.5 text-[11px] font-extrabold text-ink" aria-label={`${c.unread} unread`}>
                          {c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </aside>
          <section className={`min-w-0 flex-col ${openId ? "flex" : "hidden md:flex"}`}>
            {openId ? (
              <Thread key={openId} id={openId} summary={open} context={context} onBack={() => pick(null)} onSent={loadList} onRead={loadList} />
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted">Pick a chat on the left.</div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function Thread({
  id,
  summary,
  context,
  onBack,
  onSent,
  onRead,
}: {
  id: string;
  summary: ConversationSummary | null;
  context: { product?: string; order?: string };
  onBack: () => void;
  onSent: () => void;
  onRead: () => void;
}) {
  const [conv, setConv] = useState<ConversationSummary | null>(summary);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [about, setAbout] = useState<{ productId?: string; productName?: string; productImage?: string | null; orderId?: string }>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastAt = useRef<string | undefined>(undefined);

  // What the buyer came to ask about.
  useEffect(() => {
    if (context.product) {
      api.public
        .product(context.product)
        .then((r) => setAbout((a) => ({ ...a, productId: r.product.id, productName: r.product.name, productImage: r.product.image })))
        .catch(() => {});
    }
    if (context.order) setAbout((a) => ({ ...a, orderId: context.order }));
  }, [context.product, context.order]);

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
        onRead();
      })
      .catch((err) => setError(messageOf(err)));
    const t = setInterval(() => {
      api.chats
        .get(id, lastAt.current)
        .then((res) => {
          if (!stopped && res.messages.length) {
            merge(res.messages);
            onRead();
          }
        })
        .catch(() => {});
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

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
      onSent();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function attach(files: FileList | null) {
    const file = files?.[0];
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { urls } = await api.uploads.images([file]);
      setImage(urls[0]);
    } catch (err) {
      setError(messageOf(err, "Couldn't upload the photo"));
    } finally {
      setUploading(false);
    }
  }

  const o = conv ? other(conv) : null;

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button onClick={onBack} className="text-xl font-bold text-purple md:hidden" aria-label="Back to chats">
          ←
        </button>
        {o && conv && (
          <>
            {o.isShop ? <ShopLogo name={o.name} url={o.url} size={38} /> : <Avatar name={o.name} url={o.url} size={38} />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{o.name}</p>
              {conv.side === "buyer" ? (
                <Link href={`/shop/${conv.shop.slug}`} className="text-[12.5px] font-semibold text-purple hover:underline">
                  Visit shop
                </Link>
              ) : (
                <p className="text-[12.5px] text-muted">Buyer · messaging {conv.shop.name}</p>
              )}
            </div>
          </>
        )}
      </header>
      <div className="flex-1 overflow-y-auto bg-ground/60 px-4 py-4">
        {messages === null && !error && <p className="text-sm text-muted">Loading…</p>}
        {messages?.length === 0 && (
          <p className="mx-auto max-w-sm rounded-2xl bg-white p-4 text-center text-sm text-muted">
            Say hello! Ask about sizes, colours, delivery or anything else. Keep payments inside YanaBuy so we can help if something goes wrong.
          </p>
        )}
        <ol className="flex flex-col gap-2">
          {messages?.map((m) => (
            <li
              key={m.id}
              className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[14.5px] ${
                m.sender === "admin" ? "self-center bg-amber-tint text-ink" : m.mine ? "self-end rounded-br-md bg-purple text-white" : "self-start rounded-bl-md bg-white"
              }`}
            >
              {m.sender === "admin" && <p className="text-[11.5px] font-extrabold">YanaBuy</p>}
              {m.product && (
                <Link href={`/p/${m.product.id}`} className={`mb-1.5 flex items-center gap-2 rounded-xl p-1.5 ${m.mine ? "bg-white/15" : "bg-ground"}`}>
                  {m.product.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.product.image} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  )}
                  <span className="min-w-0 text-[12.5px]">
                    <span className="block truncate font-bold">{m.product.name}</span>
                    <span>{formatLD(m.product.price)}</span>
                  </span>
                </Link>
              )}
              {m.order && <p className={`text-[12px] font-bold ${m.mine ? "text-white/80" : "text-purple"}`}>About order {m.order.number}</p>}
              {m.imageUrl && (
                <a href={m.imageUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.imageUrl} alt="Photo" className="my-1 max-h-60 rounded-xl" />
                </a>
              )}
              {m.body && <p className="whitespace-pre-line break-words">{m.body}</p>}
              <p className={`mt-0.5 text-right text-[10.5px] ${m.mine ? "text-white/70" : "text-muted"}`}>{time(m.createdAt)}</p>
            </li>
          ))}
        </ol>
        <div ref={bottom} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex flex-col gap-2 border-t border-line p-3"
      >
        {(about.productName || about.orderId || image) && (
          <div className="flex flex-wrap gap-2">
            {about.productName && (
              <span className="inline-flex items-center gap-2 rounded-full bg-purple-tint py-1 pl-1 pr-3 text-[12.5px] font-semibold">
                {about.productImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={about.productImage} alt="" className="h-6 w-6 rounded-full object-cover" />
                )}
                About: {about.productName}
                <button type="button" onClick={() => setAbout((a) => ({ ...a, productId: undefined, productName: undefined }))} aria-label="Don't attach the product" className="text-muted">
                  ✕
                </button>
              </span>
            )}
            {about.orderId && (
              <span className="inline-flex items-center gap-2 rounded-full bg-purple-tint px-3 py-1 text-[12.5px] font-semibold">
                About your order
                <button type="button" onClick={() => setAbout((a) => ({ ...a, orderId: undefined }))} aria-label="Don't attach the order" className="text-muted">
                  ✕
                </button>
              </span>
            )}
            {image && (
              <span className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="Photo to send" className="h-16 w-16 rounded-xl object-cover" />
                <button type="button" onClick={() => setImage(null)} aria-label="Remove photo" className="absolute -right-1.5 -top-1.5 h-6 w-6 rounded-full bg-ink text-xs text-white">
                  ✕
                </button>
              </span>
            )}
          </div>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="flex items-end gap-2">
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => attach(e.target.files)} />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            aria-label="Add a photo"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-line-strong text-purple hover:border-purple disabled:opacity-50"
          >
            {uploading ? "…" : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" />
              </svg>
            )}
          </button>
          <label htmlFor="chat-text" className="sr-only">
            Message
          </label>
          <textarea
            id="chat-text"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Write a message…"
            maxLength={2000}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-[22px] border border-line-strong px-4 py-2.5 text-[15px] outline-none focus:border-purple"
          />
          <button type="submit" disabled={busy || (!text.trim() && !image)} className="h-11 flex-shrink-0 rounded-full bg-purple px-5 text-sm font-bold text-white hover:bg-ink disabled:opacity-50">
            Send
          </button>
        </div>
      </form>
    </>
  );
}
