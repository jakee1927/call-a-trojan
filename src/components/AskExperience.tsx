"use client";
import { useRef, useState } from "react";
import type { AskHeader, Audience } from "@/lib/types";
import { AnswerCard } from "./AnswerCard";
import { ShowMe } from "./ShowMe";
import { CallButton } from "@/voice/CallButton";

type Mode = "type" | "showme" | "call";
export type Suggestion = { question: string; audience: Audience; expected_route: "ai" | "trojan" | "both" };

const AUD_LABEL: Record<Audience, string> = { current: "Current", incoming: "Incoming", applicant: "Applicant" };
const ROUTE_HINT: Record<string, string> = { ai: "USC's pages answer it", both: "Pages + a Trojan", trojan: "Only a Trojan knows" };

export function AskExperience({
  suggestions,
  initialAudience = "current",
  lockAudience,
  orgSlug,
  flags,
  placeholder,
}: {
  suggestions: Suggestion[];
  initialAudience?: Audience;
  lockAudience?: boolean;
  orgSlug?: string | null;
  flags: { showme: boolean; call: boolean };
  placeholder?: string;
}) {
  const [mode, setMode] = useState<Mode>("type");
  const [audience, setAudience] = useState<Audience>(initialAudience);
  const [text, setText] = useState("");
  const [asked, setAsked] = useState<{ q: string; audience: Audience } | null>(null);
  const [header, setHeader] = useState<AskHeader | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function ask(q: string, aud: Audience = audience) {
    const question = q.trim();
    if (question.length < 3 || streaming) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAsked({ q: question, audience: aud });
    setHeader(null);
    setMarkdown("");
    setError(null);
    setStreaming(true);
    setRound((r) => r + 1);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, audience: aud, org_slug: orgSlug ?? null, mode }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Something went wrong.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let gotHeader = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        if (!gotHeader) {
          const nl = buf.indexOf("\n");
          if (nl < 0) continue;
          const h = JSON.parse(buf.slice(0, nl));
          if (h.error) throw new Error(h.error);
          setHeader(h as AskHeader);
          gotHeader = true;
          buf = buf.slice(nl + 1);
          if (h.question_id) {
            try {
              window.history.replaceState(null, "", `/q/${h.question_id}`);
            } catch {}
          }
        }
        setMarkdown(buf);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setStreaming(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    ask(text);
  }

  return (
    <div className="w-full">
      <div className="frost rounded-3xl border border-white/60 p-3 shadow-xl shadow-cardinal/10 md:p-4">
        <div className="flex flex-wrap items-center gap-2 px-1 pb-3">
          <div className="flex rounded-full bg-black/5 p-1" role="tablist" aria-label="Input mode">
            {(["type", "showme", "call"] as Mode[])
              .filter((m) => m === "type" || (m === "showme" ? flags.showme : flags.call))
              .map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${mode === m ? "bg-cardinal text-white shadow" : "text-black/60 hover:text-ink"}`}
                >
                  {m === "type" ? "Type" : m === "showme" ? "Show me" : "Call"}
                </button>
              ))}
          </div>
          {!lockAudience && (
            <div className="ml-auto flex rounded-full bg-black/5 p-1" role="tablist" aria-label="Who's asking">
              {(["current", "incoming", "applicant"] as Audience[]).map((a) => (
                <button
                  key={a}
                  role="tab"
                  aria-selected={audience === a}
                  onClick={() => setAudience(a)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${audience === a ? "bg-ink text-gold" : "text-black/55 hover:text-ink"}`}
                >
                  {AUD_LABEL[a]}
                </button>
              ))}
            </div>
          )}
        </div>

        {mode === "type" && (
          <form onSubmit={submit} className="flex items-center gap-2 rounded-2xl bg-white p-2 shadow-inner ring-1 ring-black/5">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder ?? "Ask anything about USC…"}
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-lg outline-none placeholder:text-black/35"
              autoFocus
            />
            <button
              disabled={streaming || text.trim().length < 3}
              className="rounded-xl bg-cardinal px-5 py-3 font-black text-white transition hover:bg-cardinal-dark disabled:opacity-40"
            >
              {streaming ? "…" : "Ask"}
            </button>
          </form>
        )}

        {mode === "showme" && <ShowMe audience={audience} orgSlug={orgSlug} />}

        {mode === "call" && (
          <div className="flex flex-col items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <p className="text-sm text-black/60">Talk it through. If a Trojan who matches is on shift, we ring them. Otherwise an AI Trojan stand-in answers from USC&apos;s pages.</p>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What do you want to ask? (optional)"
              className="w-full rounded-xl bg-black/5 px-3 py-2.5 outline-none"
            />
            <CallButton audience={audience} prefill={text || undefined} />
          </div>
        )}

        {mode === "type" && (
          <div className="mt-3 flex flex-col gap-2 px-1 md:flex-row">
            {suggestions.map((s) => (
              <button
                key={s.question}
                onClick={() => {
                  setText(s.question);
                  if (!lockAudience) setAudience(s.audience);
                  ask(s.question, lockAudience ? audience : s.audience);
                }}
                className="group flex-1 rounded-xl border border-black/5 bg-white/70 p-3 text-left text-sm transition hover:border-cardinal/30 hover:bg-white"
              >
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-cardinal/70">{ROUTE_HINT[s.expected_route]}</span>
                <span className="line-clamp-2 font-medium text-ink/85 group-hover:text-ink">{s.question}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={resultRef} className="scroll-mt-6">
        {error && <div className="mt-6 rounded-2xl bg-red-50 p-4 text-red-800">{error}</div>}
        {asked && !error && (
          <div className="mt-8">
            <AnswerCard key={round} question={asked.q} audience={asked.audience} header={header} markdown={markdown} streaming={streaming} orgSlug={orgSlug} />
          </div>
        )}
      </div>
    </div>
  );
}
