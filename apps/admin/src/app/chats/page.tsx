"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminConversation, ChatMessage } from "@yanabuy/shared";
import { Alert, Avatar, Button, inputClass, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { EmptyPanel, Pager, SearchBox, Tile } from "@/components/bits";
import { api } from "@/lib/api";
import { whenTime } from "@/lib/labels";

export default function ChatsPage() {
  const [query, setQuery] = useState("");
  const [q, setQ] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AdminConversation[]; total: number; pageSize: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A link like /chats?q=Grace fills the search.
  useEffect(() => {
    const start = new URLSearchParams(window.location.search).get("q") ?? "";
    setQuery(start);
    setQ(start);
  }, []);

  const load = useCallback(() => {
    if (q === null) return;
    api.admin
      .chats({ q: q || undefined, page })
      .then(setData)
      .catch((err) => setError(messageOf(err)));
  }, [q, page]);
  useEffect(load, [load]);

  return (
    <AdminShell title="Chats" subtitle="Messages between buyers and shops, for settling disputes and keeping people safe. Opening a chat is recorded in the audit log.">
      <div className="mb-5 flex">
        <SearchBox
          value={query}
          onChange={setQuery}
          onSubmit={() => {
            setQ(query.trim());
            setPage(1);
          }}
          placeholder="Shop or buyer name"
          label="Search chats"
        />
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section className="overflow-hidden rounded-[20px] border border-line bg-white" aria-label="Chats">
          {!data && <p className="p-6 text-sm text-muted">Loading…</p>}
          {data?.items.length === 0 && <p className="px-6 py-12 text-center text-sm text-muted">No chats found.</p>}
          <ul>
            {data?.items.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setOpenId(c.id)}
                  aria-current={c.id === openId ? "true" : undefined}
                  className={`flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 ${c.id === openId ? "bg-purple-tint/50" : "hover:bg-ground"}`}
                >
                  <Tile name={c.shop.name} url={c.shop.logoUrl} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {c.buyer.fullName} ↔ {c.shop.name}
                    </span>
                    <span className="block truncate text-xs text-muted">{c.lastMessage}</span>
                  </span>
                  <span className="flex-shrink-0 text-right text-xs text-muted">
                    {whenTime(c.lastMessageAt)}
                    <span className="block">{c.messageCount} messages</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {data && <Pager page={page} pages={Math.ceil(data.total / data.pageSize)} onPage={setPage} />}
        </section>
        {openId ? <Thread key={openId} id={openId} /> : <EmptyPanel>Pick a chat to read it.</EmptyPanel>}
      </div>
    </AdminShell>
  );
}

function Thread({ id }: { id: string }) {
  const [conv, setConv] = useState<AdminConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .chat(id)
      .then((res) => {
        setConv(res.conversation);
        setMessages(res.messages);
      })
      .catch((err) => setError(messageOf(err)));
  }, [id]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const { message } = await api.admin.chatNote(id, text);
      setMessages((m) => [...m, message]);
      setText("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (!conv) return <div className="rounded-[20px] border border-line bg-white p-6 text-sm text-muted">{error ?? "Loading…"}</div>;

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-white p-[22px]" aria-label={`Chat between ${conv.buyer.fullName} and ${conv.shop.name}`}>
      <div className="flex items-center gap-3">
        <Avatar name={conv.buyer.fullName} url={conv.buyer.avatarUrl} size={36} />
        <p className="font-bold">
          {conv.buyer.fullName} <span className="text-muted">(buyer)</span> ↔ {conv.shop.name} <span className="text-muted">(shop)</span>
        </p>
      </div>
      <ol className="flex max-h-[520px] flex-col gap-2 overflow-y-auto rounded-2xl bg-ground p-3">
        {messages.map((m) => (
          <li
            key={m.id}
            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
              m.sender === "admin" ? "self-center bg-amber-tint text-ink" : m.sender === "buyer" ? "self-start bg-white" : "self-end bg-purple text-white"
            }`}
          >
            <p className={`text-[11px] font-bold ${m.sender === "shop" ? "text-white/75" : "text-muted"}`}>
              {m.senderName} · {whenTime(m.createdAt)}
            </p>
            {m.product && <p className="text-[12px] font-semibold opacity-80">About: {m.product.name}</p>}
            {m.order && <p className="text-[12px] font-semibold opacity-80">Order {m.order.number}</p>}
            {m.imageUrl && (
              <a href={m.imageUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.imageUrl} alt="Photo" className="mt-1 max-h-48 rounded-xl" />
              </a>
            )}
            {m.body && <p className="whitespace-pre-line">{m.body}</p>}
          </li>
        ))}
      </ol>
      <label htmlFor="admin-note" className="text-[13px] font-bold">
        Write as YanaBuy (both sides see it)
      </label>
      <textarea id="admin-note" rows={2} value={text} onChange={(e) => setText(e.target.value)} className={`${inputClass} h-auto resize-none py-3`} placeholder="e.g. Please keep payments inside YanaBuy so we can protect you." />
      {error && <Alert>{error}</Alert>}
      <div>
        <Button busy={busy} disabled={!text.trim()} onClick={send}>
          Send as YanaBuy
        </Button>
      </div>
    </section>
  );
}
