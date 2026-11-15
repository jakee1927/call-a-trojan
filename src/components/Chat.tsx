"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserDb } from "@/lib/supabase-browser";
import { Avatar } from "./Avatar";

export type ChatMessage = { id: string; sender: "student" | "helper" | "system"; sender_name: string | null; body: string; created_at: string };
export type ChatHelper = { id: string; name: string; year?: string | null; major?: string | null; avatar_url?: string | null; is_demo?: boolean } | null;

/**
 * Realtime chat over a Supabase broadcast channel keyed by the handoff UUID.
 * History loads through the server route; new messages are POSTed and the server broadcasts them.
 */
export function Chat({
  handoffId,
  as,
  myName,
  onStatus,
  disabled,
  promise,
}: {
  handoffId: string;
  as: "student" | "helper";
  myName?: string | null;
  onStatus?: (status: string, helper?: ChatHelper) => void;
  disabled?: boolean;
  promise?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<string>("open");
  const [helper, setHelper] = useState<ChatHelper>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const add = useCallback((m: ChatMessage) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  const load = useCallback(async () => {
    const r = await fetch(`/api/handoff/${handoffId}`, { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setMessages(d.messages ?? []);
    setStatus(d.handoff?.status ?? "open");
    setHelper(d.helper ?? null);
    onStatusRef.current?.(d.handoff?.status ?? "open", d.helper ?? null);
  }, [handoffId]);

  useEffect(() => {
    load();
    const ch = browserDb()
      .channel(handoffId)
      .on("broadcast", { event: "message" }, ({ payload }) => add(payload as ChatMessage))
      .on("broadcast", { event: "status" }, ({ payload }) => {
        const p = payload as { status: string; helper?: ChatHelper };
        setStatus(p.status);
        if (p.helper) setHelper(p.helper);
        onStatusRef.current?.(p.status, p.helper);
      })
      .subscribe((s) => {
        setLive(s === "SUBSCRIBED");
        if (s === "SUBSCRIBED") load(); // catch anything sent while connecting
      });
    return () => {
      browserDb().removeChannel(ch);
    };
  }, [handoffId, add, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setErr(null);
    try {
      const r = await fetch(`/api/handoff/${handoffId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, as, sender_name: myName ?? null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Couldn't send");
      add(d.message);
      setText("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const ended = status === "closed" || status === "approved";

  return (
    <div className="flex flex-col rounded-2xl border border-black/10 bg-white">
      <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
        {helper ? (
          <>
            <Avatar name={helper.name} url={helper.avatar_url} size={32} online={!ended} />
            <div className="min-w-0">
              <div className="text-sm font-bold">
                {as === "student" ? helper.name : "Chat with the student"}
                {helper.is_demo && as === "student" && <span className="ml-1 text-xs font-medium text-black/40">(demo)</span>}
              </div>
              <div className="text-xs text-black/50">
                {as === "student" ? [helper.major, helper.year].filter(Boolean).join(" · ") || "USC student" : ended ? "Ended" : "Live"}
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm">
            <div className="font-bold">Waiting for a Trojan</div>
            <div className="text-xs text-black/50">{promise ?? "A Trojan will reply, usually within 2 hours."} You can leave this page; bookmark it to come back.</div>
          </div>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-black/40">
          {live ? <span className="live-dot" /> : <span className="h-2 w-2 rounded-full bg-black/20" />}
          {live ? "live" : "connecting"}
        </span>
      </div>
      <div className="max-h-[50vh] min-h-[120px] space-y-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 && <p className="py-6 text-center text-sm text-black/40">No messages yet. Add any detail that helps.</p>}
        {messages.map((m) =>
          m.sender === "system" ? (
            <p key={m.id} className="text-center text-xs text-black/40">
              {m.body}
            </p>
          ) : (
            <div key={m.id} className={`flex ${m.sender === as ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
                  m.sender === as ? "rounded-br-md bg-cardinal text-white" : "rounded-bl-md bg-black/5 text-ink"
                }`}
              >
                {m.sender !== as && m.sender_name && <div className="mb-0.5 text-[11px] font-bold opacity-60">{m.sender_name}</div>}
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>
      {!ended && !disabled ? (
        <form onSubmit={send} className="flex gap-2 border-t border-black/5 p-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={as === "helper" ? "Reply as a Trojan…" : "Message the Trojan…"}
            className="min-w-0 flex-1 rounded-full bg-black/5 px-4 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-cardinal/30"
          />
          <button disabled={sending || !text.trim()} className="rounded-full bg-cardinal px-5 font-bold text-white disabled:opacity-40">
            Send
          </button>
        </form>
      ) : ended ? (
        <p className="border-t border-black/5 p-3 text-center text-xs text-black/40">This chat has ended.</p>
      ) : null}
      {err && <p className="px-4 pb-3 text-xs text-red-700">{err}</p>}
    </div>
  );
}
