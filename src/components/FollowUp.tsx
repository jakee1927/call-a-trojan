"use client";
import { useState } from "react";
import type { AskHeader } from "@/lib/types";
import { Markdown } from "./Markdown";

export type Turn = { q: string; header: AskHeader | null; markdown: string };

/** Reply box under an answer: answer the AI's question or ask a follow-up, keeping the conversation. */
export function FollowUpBox({ onSend, busy }: { onSend: (text: string) => void; busy: boolean }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (t.length < 2 || busy) return;
        setText("");
        onSend(t);
      }}
      className="flex items-center gap-2 rounded-2xl border border-black/10 bg-white p-2 shadow-sm"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Reply or ask a follow-up…"
        aria-label="Reply or ask a follow-up"
        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-black/35"
      />
      <button
        disabled={busy || text.trim().length < 2}
        className="rounded-xl bg-ink px-4 py-2.5 text-sm font-black text-gold transition hover:bg-black disabled:opacity-40"
      >
        Send
      </button>
    </form>
  );
}

/** An earlier turn of the conversation, shown compactly above the newest answer. */
export function EarlierTurn({ turn }: { turn: Turn }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] font-semibold text-white">{turn.q}</p>
      </div>
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-black/10 bg-white px-4 py-3 shadow-sm">
        <div className="mb-1 text-[11px] font-black uppercase tracking-[0.15em] text-cardinal">USC says</div>
        <Markdown text={turn.markdown} sources={turn.header?.sources ?? []} />
      </div>
    </div>
  );
}
