"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { mmss, unlockAudio, type Line } from "./client/audio";
import { useAiTrojan } from "./client/useAiTrojan";
import { useHumanCall, type Trojan } from "./client/useHumanCall";

type Props = {
  questionId?: string;
  handoffId?: string;
  audience?: "current" | "incoming" | "applicant";
  prefill?: string;
  call?: "auto" | "ai" | "human";
  stage?: boolean;
  autostart?: boolean;
};

type Plan =
  | { mode: "human"; transport: "twilio" | "app"; helper: Trojan; question: string | null }
  | { mode: "ai"; humanUnavailable?: string; question: string | null; ai_ready: boolean };

export default function CallScreen(props: Props) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planErr, setPlanErr] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams();
    if (props.questionId) q.set("questionId", props.questionId);
    if (props.handoffId) q.set("handoffId", props.handoffId);
    if (props.call) q.set("call", props.call);
    fetch(`/api/voice/which?${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setPlan)
      .catch(() => setPlanErr("Couldn't reach the server."));
  }, [props.questionId, props.handoffId, props.call]);

  return (
    <main className="poster-bg min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-8 pt-6">
        <header className="mb-6 flex items-center justify-between">
          <Link href={props.questionId ? `/q/${props.questionId}` : "/"} className="text-sm font-semibold text-ink/60 hover:text-ink">
            ← Back
          </Link>
          <span className="text-sm font-black tracking-tight text-cardinal">Call a Trojan</span>
        </header>
        {planErr && <p className="text-center text-cardinal">{planErr}</p>}
        {!plan && !planErr && <Dialing label="Finding a Trojan…" />}
        {plan?.mode === "human" && <HumanCall {...props} plan={plan} />}
        {plan?.mode === "ai" && <AiCall {...props} plan={plan} />}
      </div>
    </main>
  );
}

function Dialing({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-ink/70">
      <span className="h-14 w-14 animate-spin rounded-full border-4 border-cardinal/20 border-t-cardinal" />
      <p className="font-semibold">{label}</p>
    </div>
  );
}

/* ---------------------------------- Human Trojan ---------------------------------- */

function HumanCall(props: Props & { plan: Extract<Plan, { mode: "human" }> }) {
  const h = useHumanCall({
    questionId: props.questionId,
    handoffId: props.handoffId,
    audience: props.audience,
    prefill: props.prefill,
    call: props.call,
  });
  const trojan = h.helper ?? props.plan.helper;
  const started = useRef(false);
  useEffect(() => {
    if (props.autostart && !started.current) {
      started.current = true;
      void h.start({ listenOnly: props.stage });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label =
    h.state === "idle"
      ? "Ready to call"
      : h.state === "dialing"
        ? "Calling a Trojan…"
        : h.state === "ringing"
          ? "Ringing…"
          : h.state === "connected"
            ? `Connected · ${mmss(h.elapsed)}`
            : h.state === "ended"
              ? endCopy(h.endReason)
              : "Call failed";

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center" onClick={h.resumeAudio}>
      <p className="rounded-full bg-cardinal px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">Real Trojan · live call</p>
      <div className={`rounded-full p-1.5 ${h.state === "ringing" || h.state === "dialing" ? "animate-pulse ring-4 ring-gold" : h.state === "connected" ? "ring-4 ring-green-500" : ""}`}>
        <Avatar name={trojan.name} url={trojan.avatar_url} size={160} online={h.state === "connected"} />
      </div>
      <div>
        <h1 className="text-4xl font-black tracking-tight text-ink">{trojan.name}</h1>
        <p className="mt-1 text-ink/60">{[trojan.year, trojan.major].filter(Boolean).join(" · ")}</p>
        {trojan.tags?.length > 0 && <p className="mt-1 text-sm text-ink/50">Ask me about {trojan.tags.slice(0, 3).join(", ")}</p>}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${h.state === "connected" ? "text-green-700" : "text-cardinal"}`} aria-live="polite">
        {label}
      </p>
      {(props.plan.question || props.prefill) && (
        <p className="max-w-md rounded-2xl bg-white/70 px-4 py-3 text-sm text-ink/70">“{props.plan.question ?? props.prefill}”</p>
      )}
      {h.trial && h.state === "connected" && h.elapsed < 12 && (
        <p className="max-w-md rounded-xl bg-gold/30 px-3 py-2 text-sm text-ink/80">Twilio trial line: the Trojan presses any key on their phone to connect.</p>
      )}
      {h.error && <p className="max-w-md text-sm font-semibold text-cardinal">{h.error}</p>}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {(h.state === "idle" || h.state === "ended" || h.state === "error") && (
          <button
            onClick={() => {
              unlockAudio();
              void h.start({ listenOnly: h.listenOnly || props.stage });
            }}
            className="rounded-full bg-green-600 px-8 py-4 text-lg font-bold text-white shadow-lg hover:bg-green-700"
          >
            📞 {h.state === "idle" ? `Call ${trojan.name.split(" ")[0]}` : "Call again"}
          </button>
        )}
        {(h.state === "dialing" || h.state === "ringing" || h.state === "connected") && (
          <button onClick={() => h.end("student_hung_up")} className="rounded-full bg-red-600 px-8 py-4 text-lg font-bold text-white shadow-lg hover:bg-red-700">
            Hang up
          </button>
        )}
        <label className="flex cursor-pointer items-center gap-2 rounded-full bg-white/80 px-4 py-3 text-sm font-semibold text-ink/80">
          <input type="checkbox" checked={h.listenOnly} onChange={(e) => h.setListenOnly(e.target.checked)} className="h-4 w-4 accent-cardinal" />
          Listen only (mute this mic)
        </label>
      </div>
      {h.transport === "app" && h.state === "ringing" && (
        <p className="text-xs text-ink/50">Ringing {trojan.name.split(" ")[0]}&apos;s Trojan app…</p>
      )}
    </section>
  );
}

function endCopy(r: string | null) {
  if (r === "no-answer" || r === "busy" || r === "no_answer") return "No answer. Leave it for a Trojan instead?";
  if (r === "declined") return "They can't pick up right now.";
  if (r === "failed") return "The call didn't go through.";
  return "Call ended";
}

/* ---------------------------------- AI Trojan ---------------------------------- */

function AiCall(props: Props & { plan: Extract<Plan, { mode: "ai" }> }) {
  const ai = useAiTrojan({ questionId: props.questionId, handoffId: props.handoffId, audience: props.audience, prefill: props.prefill });
  const started = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.autostart && !started.current && props.plan.ai_ready) {
      started.current = true;
      void ai.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [ai.lines, ai.toolBusy]);

  const live = ai.status === "live";
  const left = Math.max(0, ai.maxSeconds - ai.elapsed);
  const questionLink = ai.handoff?.question_id ?? ai.lastQuestionId;

  return (
    <section className="flex flex-1 flex-col gap-4" onClick={ai.resumeAudio}>
      {/* Persistent disclosure badge */}
      <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-2xl border border-gold bg-ink px-4 py-3 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold text-lg font-black text-ink">AI</span>
          <div>
            <p className="font-bold leading-tight">AI Trojan (stand-in)</p>
            <p className="text-xs text-white/70">Not a real student · answers from USC&apos;s official pages</p>
          </div>
        </div>
        <div className="text-right text-sm tabular-nums">
          {live ? (
            <>
              <span className="live-dot mr-2 align-middle" />
              {mmss(ai.elapsed)}
              <span className="block text-[11px] text-white/60">{mmss(left)} left</span>
            </>
          ) : (
            <span className="text-white/70">{ai.status === "connecting" ? "Connecting…" : ai.status === "ended" ? "Ended" : ""}</span>
          )}
        </div>
      </div>

      {props.plan.humanUnavailable && (
        <p className="rounded-xl bg-gold/30 px-3 py-2 text-sm text-ink/80">{props.plan.humanUnavailable} You&apos;re talking to the AI stand-in.</p>
      )}
      {!props.plan.humanUnavailable && ai.status !== "live" && ai.status !== "ended" && (
        <p className="text-center text-sm text-ink/60">No human Trojan is on shift right now, so an AI stand-in will pick up. It says so first.</p>
      )}

      {/* Transcript */}
      <div ref={scroller} className="frost flex min-h-[40vh] flex-1 flex-col gap-3 overflow-y-auto rounded-3xl p-4 shadow-sm">
        {ai.lines.length === 0 && (
          <p className="m-auto max-w-xs text-center text-sm text-ink/50">
            {ai.status === "connecting" ? "Connecting to the AI Trojan…" : ai.status === "ended" ? "No transcript." : "The live transcript shows up here."}
          </p>
        )}
        {ai.lines
          .filter((l, i, all) => l.text.trim() || i === all.length - 1)
          .map((l) => (
            <Bubble key={l.id} line={l} />
          ))}
        {ai.toolBusy && (
          <p className="self-start rounded-full bg-gold/30 px-3 py-1 text-xs font-semibold text-ink/70">
            <span className="mr-1 inline-block animate-spin">⟳</span> {ai.toolBusy}
          </p>
        )}
      </div>

      {ai.error && <p className="text-center text-sm font-semibold text-cardinal">{ai.error}</p>}
      {!props.plan.ai_ready && <p className="text-center text-sm text-cardinal">The AI Trojan isn&apos;t configured on this deploy yet.</p>}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {(ai.status === "idle" || ai.status === "ended" || ai.status === "error") && props.plan.ai_ready && (
          <button
            onClick={() => {
              unlockAudio();
              void ai.start();
            }}
            className="rounded-full bg-green-600 px-8 py-4 text-lg font-bold text-white shadow-lg hover:bg-green-700"
          >
            📞 {ai.status === "idle" ? "Start call" : "Call again"}
          </button>
        )}
        {(ai.status === "connecting" || live) && (
          <>
            <button onClick={() => ai.hangUp("student_hung_up")} className="rounded-full bg-red-600 px-8 py-4 text-lg font-bold text-white shadow-lg hover:bg-red-700">
              Hang up
            </button>
            <button
              onClick={() => ai.setMuted(!ai.micMuted)}
              className={`rounded-full px-5 py-4 text-sm font-bold ${ai.micMuted ? "bg-cardinal text-white" : "bg-white/80 text-ink/80"}`}
            >
              {ai.micMuted ? "🔇 Muted" : "🎙️ Mute"}
            </button>
          </>
        )}
        {live && (
          <span className="text-sm text-ink/60">
            {ai.speaking === "ai" ? "AI Trojan is talking…" : ai.speaking === "student" ? "Listening…" : ai.toolBusy ? "" : "Go ahead, ask anything about USC."}
          </span>
        )}
      </div>

      {ai.status === "ended" && (
        <div className="rounded-2xl bg-white/80 p-4 text-center text-sm text-ink/80">
          {ai.handoff ? (
            <p>
              Saved for a real Trojan.{" "}
              {questionLink && (
                <Link className="font-bold text-cardinal underline" href={`/q/${questionLink}`}>
                  Watch for their reply →
                </Link>
              )}
            </p>
          ) : questionLink ? (
            <p>
              Want a human take?{" "}
              <Link className="font-bold text-cardinal underline" href={`/q/${questionLink}`}>
                Open your question and ask a real Trojan →
              </Link>
            </p>
          ) : (
            <p>Thanks for calling. Every path ends at a real Trojan; leave a question and one will reply.</p>
          )}
        </div>
      )}

      {(props.stage || process.env.NODE_ENV !== "production") && ai.metrics.turnMs.length + ai.metrics.toolMs.length > 0 && (
        <p className="text-center font-mono text-[11px] text-ink/40">
          connect {ai.metrics.connectMs ?? "–"}ms · speech→audio {ai.metrics.turnMs.join(", ")}ms · lookup {ai.metrics.toolMs.join(", ")}ms
        </p>
      )}
    </section>
  );
}

function Bubble({ line }: { line: Line }) {
  if (line.role === "system") return <p className="self-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">{line.text}</p>;
  const me = line.role === "student";
  return (
    <div className={`flex max-w-[85%] flex-col ${me ? "self-end items-end" : "self-start items-start"}`}>
      <span className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink/40">{me ? "You" : "AI Trojan (stand-in)"}</span>
      <p className={`rounded-2xl px-4 py-2 text-[15px] leading-snug ${me ? "bg-cardinal text-white" : "bg-white text-ink shadow-sm"} ${line.done ? "" : "opacity-80"}`}>
        {line.text || (me ? "…" : "")}
      </p>
      {!me && line.sources && line.sources.length > 0 && line.done && (
        <div className="mt-1 flex flex-wrap gap-1">
          {line.sources.slice(0, 3).map((s) => (
            <a key={s.ref} href={s.url} target="_blank" rel="noreferrer" className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-cardinal hover:bg-ink/10">
              {s.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
