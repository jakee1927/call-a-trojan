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
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 pb-8 pt-5">
        <header className="mb-6 flex items-center justify-between">
          <Link href={props.questionId ? `/q/${props.questionId}` : "/"} className="btn !py-1">
            Back
          </Link>
          <span className="display text-xl text-cardinal">Call a Trojan</span>
        </header>
        {planErr && <p className="text-center text-[#b42318]">{planErr}</p>}
        {!plan && !planErr && <Dialing label="Finding a Trojan…" />}
        {plan?.mode === "human" && <HumanCall {...props} plan={plan} />}
        {plan?.mode === "ai" && <AiCall {...props} plan={plan} />}
      </div>
    </main>
  );
}

function Dialing({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted">
      <span aria-hidden className="ringing text-6xl">📞</span>
      <p className="display text-2xl text-ink">{label}</p>
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
      <p className="text-[15px] text-muted">Live call with a real Trojan</p>
      <div className={`rounded-full border-[3px] border-ink bg-white p-1 shadow-[6px_6px_0_var(--ink)] ${h.state === "ringing" || h.state === "dialing" ? "ringing" : h.state === "connected" ? "bob" : ""}`}>
        <Avatar name={trojan.name} url={trojan.avatar_url} size={128} />
      </div>
      <div>
        <h1 className="display text-5xl">{trojan.name}</h1>
        <p className="mt-1 text-muted">{[trojan.year, trojan.major].filter(Boolean).join(" · ")}</p>
        {trojan.tags?.length > 0 && <p className="mt-1 text-sm text-muted">Ask me about {trojan.tags.slice(0, 3).join(", ")}</p>}
      </div>
      <p className={`display text-2xl tabular-nums ${h.state === "connected" ? "text-ok" : "text-cardinal"}`} aria-live="polite">
        {label}
      </p>
      {(props.plan.question || props.prefill) && (
        <p className="max-w-md text-[15px] text-muted">“{props.plan.question ?? props.prefill}”</p>
      )}
      {h.trial && h.state === "connected" && h.elapsed < 12 && (
        <p className="max-w-md rounded-lg bg-gold-tint px-3 py-2 text-sm">Twilio trial line: the Trojan presses any key on their phone to connect.</p>
      )}
      {h.error && <p className="max-w-md text-sm font-semibold text-[#b42318]">{h.error}</p>}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {(h.state === "idle" || h.state === "ended" || h.state === "error") && (
          <button
            onClick={() => {
              unlockAudio();
              void h.start({ listenOnly: h.listenOnly || props.stage });
            }}
            data-fx="boom" className="btn btn-go btn-lg"
          >
            {h.state === "idle" ? `Call ${trojan.name.split(" ")[0]}` : "Call again"}
          </button>
        )}
        {(h.state === "dialing" || h.state === "ringing" || h.state === "connected") && (
          <button onClick={() => h.end("student_hung_up")} className="btn btn-stop btn-lg">
            Hang up
          </button>
        )}
        <label className="flex cursor-pointer items-center gap-2 px-2 py-3 text-[15px]">
          <input type="checkbox" checked={h.listenOnly} onChange={(e) => h.setListenOnly(e.target.checked)} className="h-4 w-4 accent-cardinal" />
          Listen only (mute this mic)
        </label>
      </div>
      {h.transport === "app" && h.state === "ringing" && (
        <p className="text-sm text-muted">Ringing {trojan.name.split(" ")[0]}&apos;s Trojan app…</p>
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
      <div className="sticker sticker-ink sticky top-2 z-10 flex items-center justify-between gap-4 px-4 py-3">
        <div>
          <p className="display text-xl leading-tight text-gold">AI Trojan (stand-in)</p>
          <p className="text-sm text-white/80">Not a real student. Answers from USC&apos;s official pages.</p>
        </div>
        <div className="shrink-0 text-right text-[15px] tabular-nums">
          {live ? (
            <>
              <span className="live-dot mr-2 align-middle" />
              {mmss(ai.elapsed)}
              <span className="block text-sm text-white/75">{mmss(left)} left</span>
            </>
          ) : (
            <span className="text-white/80">{ai.status === "connecting" ? "Connecting…" : ai.status === "ended" ? "Ended" : ""}</span>
          )}
        </div>
      </div>

      {props.plan.humanUnavailable && (
        <p className="rounded-lg bg-gold-tint px-3 py-2 text-[15px]">{props.plan.humanUnavailable} You&apos;re talking to the AI stand-in.</p>
      )}
      {!props.plan.humanUnavailable && ai.status !== "live" && ai.status !== "ended" && (
        <p className="text-[15px] text-muted">No human Trojan is on shift right now, so an AI stand-in will pick up. It says so first.</p>
      )}

      {/* Transcript */}
      <div ref={scroller} className="sticker flex min-h-[40vh] flex-1 flex-col gap-3 overflow-y-auto p-4">
        {ai.lines.length === 0 && (
          <p className="m-auto max-w-xs text-center text-[15px] text-muted">
            {ai.status === "connecting" ? "Connecting to the AI Trojan…" : ai.status === "ended" ? "No transcript." : "The live transcript shows up here."}
          </p>
        )}
        {ai.lines
          .filter((l, i, all) => l.text.trim() || i === all.length - 1)
          .map((l) => (
            <Bubble key={l.id} line={l} />
          ))}
        {ai.toolBusy && (
          <p className="self-start text-sm text-muted">
            {ai.toolBusy}
          </p>
        )}
      </div>

      {ai.error && <p className="text-center text-sm font-semibold text-[#b42318]">{ai.error}</p>}
      {!props.plan.ai_ready && <p className="text-center text-sm text-[#b42318]">The AI Trojan isn&apos;t configured on this deploy yet.</p>}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {(ai.status === "idle" || ai.status === "ended" || ai.status === "error") && props.plan.ai_ready && (
          <button
            onClick={() => {
              unlockAudio();
              void ai.start();
            }}
            data-fx="boom" className="btn btn-go btn-lg"
          >
            {ai.status === "idle" ? "Start call" : "Call again"}
          </button>
        )}
        {(ai.status === "connecting" || live) && (
          <>
            <button onClick={() => ai.hangUp("student_hung_up")} className="btn btn-stop btn-lg">
              Hang up
            </button>
            <button
              onClick={() => ai.setMuted(!ai.micMuted)}
              className={`btn btn-lg ${ai.micMuted ? "btn-dark" : "btn-line"}`}
            >
              {ai.micMuted ? "Unmute" : "Mute"}
            </button>
          </>
        )}
        {live && (
          <span className="text-[15px] text-muted">
            {ai.speaking === "ai" ? "AI Trojan is talking…" : ai.speaking === "student" ? "Listening…" : ai.toolBusy ? "" : "Go ahead, ask anything about USC."}
          </span>
        )}
      </div>

      {ai.status === "ended" && (
        <div className="border-t border-line pt-4 text-center text-[15px]">
          {ai.handoff ? (
            <p>
              Saved for a real Trojan.{" "}
              {questionLink && (
                <Link className="link font-semibold" href={`/q/${questionLink}`}>
                  Watch for their reply
                </Link>
              )}
            </p>
          ) : questionLink ? (
            <p>
              Want a human take?{" "}
              <Link className="link font-semibold" href={`/q/${questionLink}`}>
                Open your question and ask a real Trojan
              </Link>
            </p>
          ) : (
            <p>Thanks for calling. Every path ends at a real Trojan; leave a question and one will reply.</p>
          )}
        </div>
      )}

      {(props.stage || process.env.NODE_ENV !== "production") && ai.metrics.turnMs.length + ai.metrics.toolMs.length > 0 && (
        <p className="text-center text-xs tabular-nums text-muted">
          connect {ai.metrics.connectMs ?? "–"}ms · speech→audio {ai.metrics.turnMs.join(", ")}ms · lookup {ai.metrics.toolMs.join(", ")}ms
        </p>
      )}
    </section>
  );
}

function Bubble({ line }: { line: Line }) {
  if (line.role === "system") return <p className="self-center text-sm text-muted">{line.text}</p>;
  const me = line.role === "student";
  return (
    <div className={`flex max-w-[85%] flex-col ${me ? "self-end items-end" : "self-start items-start"}`}>
      <span className="mb-0.5 text-[13px] text-muted">{me ? "You" : "AI Trojan (stand-in)"}</span>
      <p className={`pop rounded-2xl border-2 border-ink px-3.5 py-2 text-[15px] font-medium leading-snug ${me ? "rounded-br-sm bg-cardinal text-white" : "rounded-bl-sm bg-gold-tint text-ink"} ${line.done ? "" : "opacity-80"}`}>
        {line.text || (me ? "…" : "")}
      </p>
      {!me && line.sources && line.sources.length > 0 && line.done && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {line.sources.slice(0, 3).map((s) => (
            <a key={s.ref} href={s.url} target="_blank" rel="noreferrer" className="link text-[13px]">
              {s.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
