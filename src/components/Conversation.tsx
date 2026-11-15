"use client";
import { useRef, useState } from "react";
import type { AskHeader, Audience } from "@/lib/types";
import { AnswerCard } from "./AnswerCard";
import { EarlierTurn, FollowUpBox, type Turn } from "./FollowUp";

/**
 * A saved question (/q/<id>) that the student can keep talking to: the stored answer first, then any
 * follow-ups they send from here. Each follow-up carries the earlier turns to /api/ask.
 */
export function Conversation({
  question,
  audience,
  header,
  markdown,
  initialHandoff,
  orgSlug,
}: {
  question: string;
  audience: Audience;
  header: AskHeader;
  markdown: string;
  initialHandoff?: { id: string; status: string } | null;
  orgSlug?: string | null;
}) {
  const [thread, setThread] = useState<Turn[]>([]);
  const [current, setCurrent] = useState<{ q: string; header: AskHeader | null; markdown: string; first: boolean }>({ q: question, header, markdown, first: true });
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const latestRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    if (streaming) return;
    const earlier: Turn[] = [...thread, { q: current.q, header: current.header, markdown: current.markdown }];
    setThread(earlier);
    setCurrent({ q: text, header: null, markdown: "", first: false });
    setError(null);
    setStreaming(true);
    setRound((r) => r + 1);
    setTimeout(() => latestRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          audience,
          org_slug: orgSlug ?? null,
          history: earlier.map((t) => ({ question: t.q, answer: t.markdown })),
        }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Something went wrong.");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let h: AskHeader | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        if (!h) {
          const nl = buf.indexOf("\n");
          if (nl < 0) continue;
          const parsed = JSON.parse(buf.slice(0, nl));
          if (parsed.error) throw new Error(parsed.error);
          h = parsed as AskHeader;
          buf = buf.slice(nl + 1);
          if (h.question_id) {
            try {
              window.history.replaceState(null, "", `/q/${h.question_id}`);
            } catch {}
          }
        }
        setCurrent({ q: text, header: h, markdown: buf, first: false });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="space-y-6">
      {thread.map((t, i) => (
        <EarlierTurn key={i} turn={t} />
      ))}
      <div ref={latestRef} className="scroll-mt-6">
        <AnswerCard
          key={round}
          question={current.q}
          audience={audience}
          header={current.header}
          markdown={current.markdown}
          streaming={streaming}
          initialHandoff={current.first ? initialHandoff : null}
          orgSlug={orgSlug}
        />
      </div>
      {error && <div className="rounded-2xl bg-red-50 p-4 text-red-800">{error}</div>}
      {current.header && !streaming && <FollowUpBox busy={streaming} onSend={send} />}
    </div>
  );
}
