"use client";
import { useEffect, useRef, useState } from "react";
import type { AskHeader, Audience } from "@/lib/types";
import { AnswerCard } from "./AnswerCard";
import { EarlierTurn, FollowUpBox, type Turn } from "./FollowUp";
import { ShowMe } from "./ShowMe";
import { CallButton } from "@/voice/CallButton";
import { boomFrom, rain, shake } from "./Fx";

type Mode = "type" | "showme" | "call";
export type Suggestion = { question: string; audience: Audience; expected_route: "ai" | "trojan" | "both" };

const AUD_LABEL: Record<Audience, string> = { current: "Current", incoming: "Incoming", applicant: "Applicant" };
const AUD_EMOJI: Record<Audience, string> = { current: "🎒", incoming: "📦", applicant: "🤞" };
const ROUTE_HINT: Record<string, string> = { ai: "USC's pages got this", both: "Pages + a Trojan", trojan: "Only a Trojan knows" };
const MODE_LABEL: Record<Mode, [string, string]> = { type: ["⌨️", "Type it"], showme: ["📸", "Show a screenshot"], call: ["📞", "Call"] };
// The suggestion stickers: gold, white, cardinal, each leaning its own way.
const STICKER = ["sticker-gold tilt-l", "tilt-r", "sticker-cardinal tilt-l"];
const TEASERS = [
  "How do I get D-clearance?",
  "Is the meal plan worth it?",
  "Which dorm is the quietest?",
  "Where do I even park?",
  "Can I P/NP a GE?",
  "What's Leavey like at 2 AM?",
];

/** Types example questions into the empty ask box, one after another. */
function useTypedTeaser(active: boolean) {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let which = 0;
    let n = 0;
    let dir = 1;
    let hold = 0;
    const t = window.setInterval(() => {
      const full = TEASERS[which];
      if (hold > 0) return void hold--;
      n += dir;
      setOut(full.slice(0, n));
      if (n >= full.length) {
        dir = -1;
        hold = 22;
      } else if (n <= 0) {
        dir = 1;
        which = (which + 1) % TEASERS.length;
        hold = 4;
      }
    }, 55);
    return () => window.clearInterval(t);
  }, [active]);
  return out;
}

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
  const latestRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Earlier turns of this conversation (a follow-up keeps them; a new question from the top box clears them). */
  const [thread, setThread] = useState<Turn[]>([]);
  const askBtn = useRef<HTMLButtonElement>(null);
  const teaser = useTypedTeaser(mode === "type" && text === "" && !placeholder);
  const fightOn = useRef(false);

  function typed(v: string) {
    setText(v);
    // Say the words and it rains.
    const hit = /fight\s*on/i.test(v);
    if (hit && !fightOn.current) rain(["✌️", "✌️", "⚔️", "🏆"], 60);
    fightOn.current = hit;
  }

  async function ask(q: string, aud: Audience = audience, followUp = false) {
    const question = q.trim();
    if (question.length < (followUp ? 2 : 3) || streaming) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const earlier: Turn[] = followUp && asked && markdown ? [...thread, { q: asked.q, header, markdown }] : [];
    setThread(earlier);
    setAsked({ q: question, audience: aud });
    setHeader(null);
    setMarkdown("");
    setError(null);
    setStreaming(true);
    setRound((r) => r + 1);
    boomFrom(askBtn.current);
    setTimeout(() => (followUp ? latestRef : resultRef).current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          audience: aud,
          org_slug: orgSlug ?? null,
          mode,
          history: earlier.map((t) => ({ question: t.q, answer: t.markdown })),
        }),
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
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
        shake();
      }
    } finally {
      setStreaming(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    ask(text);
  }

  const modes = (["type", "showme", "call"] as Mode[]).filter((m) => m === "type" || (m === "showme" ? flags.showme : flags.call));

  return (
    <div className="w-full">
      <div className="sticker !shadow-[8px_8px_0_var(--ink)] p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {modes.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="How to ask">
              {modes.map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`chip ${mode === m ? "chip-on" : ""}`}>
                  <span aria-hidden>{MODE_LABEL[m][0]}</span>
                  {MODE_LABEL[m][1]}
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          {!lockAudience && (
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Who is asking">
              <span className="mr-1 text-sm font-bold text-muted">I&apos;m</span>
              {(["current", "incoming", "applicant"] as Audience[]).map((a) => (
                <button
                  key={a}
                  role="radio"
                  aria-checked={audience === a}
                  onClick={() => setAudience(a)}
                  className={`chip !px-2.5 !py-0.5 !text-sm ${audience === a ? "!bg-gold shadow-[3px_3px_0_var(--ink)] rotate-[2deg]" : ""}`}
                >
                  <span className={audience === a ? "ringing" : ""} style={{ animationIterationCount: 1 }}>{AUD_EMOJI[a]}</span> {AUD_LABEL[a]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div key={mode} className="pop mt-4">
          {mode === "type" && (
            <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
              <input
                value={text}
                onChange={(e) => typed(e.target.value)}
                placeholder={placeholder ?? (teaser || "Ask anything about USC")}
                aria-label="Your question"
                className="field !rounded-2xl !px-5 !py-4 !text-xl !font-semibold"
              />
              <button ref={askBtn} disabled={streaming || text.trim().length < 3} className="btn btn-primary btn-lg !px-8 !py-4 !text-xl">
                {streaming ? "Asking…" : "Ask ✌️"}
              </button>
            </form>
          )}

          {mode === "showme" && <ShowMe audience={audience} orgSlug={orgSlug} />}

          {mode === "call" && (
            <div className="max-w-xl space-y-3">
              <p className="font-medium">
                Talk it through. If a Trojan who matches is on shift, we ring them. Otherwise an AI stand-in answers from USC&apos;s pages, and says so first.
              </p>
              <input
                value={text}
                onChange={(e) => typed(e.target.value)}
                placeholder="What do you want to ask? (optional)"
                aria-label="What do you want to ask? (optional)"
                className="field"
              />
              <CallButton audience={audience} prefill={text || undefined} />
            </div>
          )}
        </div>
      </div>

      {mode === "type" && suggestions.length > 0 && !asked && (
        <div className="mt-8">
          <p className="display mb-3 text-xl">No idea what to ask? Steal one 👇</p>
          <ul className="grid gap-5 md:grid-cols-3">
            {suggestions.map((s, i) => (
              <li key={s.question} className="drop" style={{ "--i": i } as React.CSSProperties}>
                <button
                  onClick={() => {
                    setText(s.question);
                    // The toggle is the student's choice; a suggestion never overrides it.
                    ask(s.question, audience);
                  }}
                  className={`sticker grab block h-full w-full p-4 text-left ${STICKER[i % STICKER.length]}`}
                >
                  <span className="note-tag">{ROUTE_HINT[s.expected_route]}</span>
                  <span className="mt-2 block text-[17px] font-extrabold leading-snug">{s.question}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div ref={resultRef} className="scroll-mt-6">
        {error && (
          <p role="alert" className="sticker slam mt-6 inline-block px-4 py-3 font-bold text-[#c81e1e]">
            😵 {error}
          </p>
        )}
        {asked && !error && (
          <div className="mt-8 space-y-6">
            {thread.map((t, i) => (
              <EarlierTurn key={i} turn={t} />
            ))}
            <div ref={latestRef} className="scroll-mt-6">
              <AnswerCard key={round} question={asked.q} audience={asked.audience} header={header} markdown={markdown} streaming={streaming} orgSlug={orgSlug} />
            </div>
            {header && !streaming && <FollowUpBox busy={streaming} onSend={(t) => ask(t, asked.audience, true)} />}
          </div>
        )}
      </div>
    </div>
  );
}
