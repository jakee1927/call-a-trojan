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
    <div className="flex flex-col overflow-hidden rounded-2xl border-[2.5px] border-ink bg-white">
      <div className="flex items-center gap-3 border-b-[2.5px] border-ink bg-gold px-4 py-3">
        {helper ? (
          <>
            <Avatar name={helper.name} url={helper.avatar_url} size={32} online={!ended} />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold leading-tight">
                {as === "student" ? helper.name : "Chat with the student"}
                {helper.is_demo && as === "student" && <span className="ml-1.5 text-sm font-normal text-muted">(demo profile)</span>}
              </div>
              <div className="text-sm text-muted">
                {as === "student" ? [helper.major, helper.year].filter(Boolean).join(" · ") || "USC student" : ended ? "Ended" : "In progress"}
              </div>
            </div>
          </>
        ) : (
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-tight">Waiting for a Trojan</div>
            <div className="text-sm font-medium">{promise ?? "A Trojan will reply, usually within 2 hours."} You can leave this page; bookmark it to come back.</div>
          </div>
        )}
        {!live && <span className="ml-auto shrink-0 text-sm text-muted">Connecting…</span>}
      </div>
      <div className="max-h-[50vh] min-h-[120px] space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && <p className="py-6 text-center text-[15px] text-muted">No messages yet. Add any detail that helps.</p>}
        {messages.map((m) =>
          m.sender === "system" ? (
            <p key={m.id} className="py-1 text-center text-sm text-muted">
              {m.body}
            </p>
          ) : (
            <div key={m.id} className={`flex ${m.sender === as ? "justify-end" : "justify-start"}`}>
              <div className={`pop max-w-[80%] rounded-2xl border-2 border-ink px-3.5 py-2 text-[15px] font-medium leading-snug ${m.sender === as ? "rounded-br-sm bg-cardinal text-white" : "rounded-bl-sm bg-gold-tint text-ink"}`}>
                {m.sender !== as && m.sender_name && <div className="mb-0.5 text-[13px] font-semibold">{m.sender_name}</div>}
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>
      {!ended && !disabled ? (
        <form onSubmit={send} className="flex gap-3 border-t-[2.5px] border-ink p-3 pb-4">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={as === "helper" ? "Reply as a Trojan" : "Message the Trojan"}
            aria-label={as === "helper" ? "Reply as a Trojan" : "Message the Trojan"}
            className="field"
          />
          <button disabled={sending || !text.trim()} className="btn btn-primary">
            Send
          </button>
        </form>
      ) : ended ? (
        <p className="border-t border-line p-3 text-center text-sm text-muted">This chat has ended.</p>
      ) : null}
      {err && <p className="px-4 pb-3 text-sm text-[#b42318]">{err}</p>}
    </div>
  );
}
