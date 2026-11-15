"use client";
import { useEffect, useRef, useState } from "react";
import type { AskHeader, Audience, MatchedHelper, UsedAnswer } from "@/lib/types";
import { Markdown, citedSources } from "./Markdown";
import { Avatar } from "./Avatar";
import { Chat } from "./Chat";
import { CallButton } from "@/voice/CallButton";
import { boomFrom, rain } from "./Fx";

function monthYear(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
function yy(year?: string | null) {
  if (!year) return "";
  const m = year.match(/(\d{2})(\d{2})?$/);
  if (!m) return year;
  return `'${m[2] ?? m[1]}`;
}

export function TrojanAnswer({ a }: { a: UsedAnswer }) {
  const [reported, setReported] = useState(false);
  const [going, setGoing] = useState(false);
  async function report() {
    // The answer dissolves, then the thank-you takes its place.
    setGoing(true);
    window.setTimeout(() => setReported(true), 600);
    await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verified_answer_id: a.id }) });
  }
  const who = [a.helper_name, [a.helper_major, yy(a.helper_year)].filter(Boolean).join(" "), monthYear(a.approved_at)].filter(Boolean).join(" · ");
  if (reported)
    return (
      <p className="pop rounded-2xl border-[2.5px] border-dashed border-ink px-4 py-3 text-sm font-bold">💨 Poof. Reported, thanks for keeping it real.</p>
    );
  return (
    <figure className={`rounded-2xl border-[2.5px] border-ink bg-white p-4 ${going ? "poof" : ""}`}>
      <blockquote className="text-[17px] font-medium leading-relaxed">“{a.answer}”</blockquote>
      <figcaption className="mt-3 text-sm leading-snug">
        <span className="font-extrabold">{who}</span>
        {a.is_sample && <span className="note-tag ml-2">sample</span>}
        <span className="mt-0.5 block text-muted">
          Their experience, not official policy. Answered “{a.question}”{" "}
          <button onClick={report} disabled={going} data-fx="none" className="font-bold underline underline-offset-2 hover:text-cardinal">
            Report
          </button>
        </span>
      </figcaption>
    </figure>
  );
}

function HelperPick({ h, i }: { h: MatchedHelper; i: number }) {
  return (
    <li className="pop" style={{ "--i": i + 3 } as React.CSSProperties}>
      <div className={`sticker sticker-gold flex items-center gap-3 !rounded-2xl p-3 text-ink !shadow-[4px_4px_0_var(--ink)] ${i % 2 ? "tilt-r" : "tilt-l"}`}>
        <span className="wiggle-hover rounded-full border-[2.5px] border-ink">
          <Avatar name={h.name} url={h.avatar_url} size={44} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-extrabold">
            {h.name}
            <span className="ml-2 text-sm font-semibold">{[h.major, yy(h.year)].filter(Boolean).join(" ")}</span>
          </div>
          <div className="text-sm font-medium leading-snug">{h.why}</div>
          {h.is_demo && <span className="note-tag mt-1">demo profile</span>}
        </div>
        {h.online && (
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-extrabold">
            <span className="live-dot" /> On shift
          </span>
        )}
      </div>
    </li>
  );
}

const WAITING = [
  "Opening 47 usc.edu tabs so you don't have to…",
  "Waking up Traveler…",
  "Polishing Tommy Trojan's sword…",
  "Speed-reading the Registrar…",
  "Checking what real Trojans said…",
];

/** While the answer is on its way: a horse runs and the excuses rotate. */
function Waiting() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setN((v) => v + 1), 1400);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="sticker pop relative overflow-hidden p-5">
      <span aria-hidden className="absolute bottom-1 left-0 text-3xl" style={{ animation: "gallop 2.2s linear infinite" }}>
        🐎
      </span>
      <p key={n} className="drop display pb-7 text-2xl" role="status">
        {WAITING[n % WAITING.length]}
      </p>
    </div>
  );
}

export function AnswerCard({
  question,
  audience,
  header,
  markdown,
  streaming,
  initialHandoff,
  orgSlug,
}: {
  question: string;
  audience: Audience;
  header: AskHeader | null;
  markdown: string;
  streaming: boolean;
  initialHandoff?: { id: string; status: string } | null;
  orgSlug?: string | null;
}) {
  const needsTrojan = header && (header.route === "trojan" || header.route === "both");
  const sources = header ? citedSources(markdown, header.sources) : [];
  const hasTrojan = !!header && header.used_answers.length > 0;

  // When a live answer lands on "needs a Trojan", the whole page feels it.
  const alarm = useRef<HTMLDivElement>(null);
  const sawHeader = useRef(!!header);
  useEffect(() => {
    if (header && !sawHeader.current) {
      sawHeader.current = true;
      if (header.route !== "ai") boomFrom(alarm.current);
      if (header.used_answers.length > 0) rain(["✌️"], 18);
    }
  }, [header]);

  return (
    <div className="space-y-6">
      <div className="sticker sticker-ink drop tilt-l p-5 md:p-6">
        <p className="text-sm font-extrabold text-gold">
          {audience === "current" ? "🎒 A current student asked" : audience === "incoming" ? "📦 An incoming student asked" : "🤞 An applicant asked"}
        </p>
        <h2 className="display mt-1.5 text-[1.7rem] leading-[1.08] text-white md:text-[2.3rem]">{question}</h2>
      </div>

      {!header && !markdown && <Waiting />}

      {needsTrojan && (
        <div ref={alarm} className="sticker sticker-cardinal slam p-5 md:p-6">
          <h3 className="display text-[1.9rem] leading-none md:text-[2.6rem]">
            <span aria-hidden className="ringing mr-2">🚨</span>
            The AI tapped out. <span className="text-gold">This one needs a Trojan.</span>
          </h3>
          <p className="mt-2 max-w-[60ch] font-medium text-white/90">
            {header.route === "both"
              ? "USC's pages cover the policy. A Trojan who's done it can tell you how it actually works."
              : "USC's websites don't answer this. A Trojan who's been there can."}
          </p>
          {header.helpers.length > 0 && (
            <ul className="mt-4 grid gap-4 md:grid-cols-2">
              {header.helpers.map((h, i) => (
                <HelperPick key={h.id} h={h} i={i} />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Two lanes only when a Trojan has actually answered; otherwise USC's answer takes the full width. */}
      {(header || markdown) && (
        <div className={hasTrojan ? "grid items-start gap-6 md:grid-cols-2" : ""}>
          <section className="sticker pop p-5 md:p-6" style={{ "--i": 1 } as React.CSSProperties}>
            <h3 className="display text-2xl text-cardinal">USC says</h3>
            <p className="text-sm font-semibold text-muted">Straight from official usc.edu pages</p>
            <div className="mt-3">
              <Markdown text={markdown} sources={header?.sources ?? []} streaming={streaming} />
            </div>
            {!streaming && sources.length > 0 && (
              <div className="mt-5 border-t-[2.5px] border-dashed border-line-strong pt-4">
                <h4 className="text-sm font-extrabold">Receipts 🧾</h4>
                <ol className="mt-2 flex flex-wrap gap-2 text-sm">
                  {sources.map((s) => (
                    <li key={s.ref} className="max-w-full">
                      <a href={s.url} target="_blank" rel="noreferrer" className="chip !max-w-full !py-0.5 !text-sm !font-bold">
                        <span className="tabular-nums text-cardinal">{s.ref.slice(1)}</span>
                        <span className="truncate">{s.title}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>

          {hasTrojan && (
            <section className="sticker sticker-gold pop tilt-r relative p-5 md:p-6" style={{ "--i": 3 } as React.CSSProperties}>
              <span aria-hidden className="stamp display absolute -right-3 -top-4 rounded-xl border-[3px] border-cardinal bg-white px-3 py-1 text-lg text-cardinal">
                VERIFIED ✌️
              </span>
              <h3 className="display text-2xl">Trojans say</h3>
              <p className="text-sm font-semibold">From students who have actually done it</p>
              <div className="mt-3 space-y-4">
                {header.used_answers.map((a) => (
                  <TrojanAnswer key={a.id} a={a} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {header && !streaming && (
        <div className="sticker sticker-tint pop p-5 md:p-6" style={{ "--i": 2 } as React.CSSProperties}>
          {!hasTrojan && !initialHandoff && (
            <p className="mb-4 max-w-[60ch] font-semibold">
              <span className="display mr-1 text-xl">No Trojan has answered this yet.</span> Ask one, and their answer helps every student who asks after you.
            </p>
          )}
          <HandoffBox questionId={header.question_id} audience={audience} question={question} needsTrojan={!!needsTrojan} orgSlug={orgSlug} initialHandoff={initialHandoff} />
        </div>
      )}
    </div>
  );
}

export function HandoffBox({
  questionId,
  audience,
  question,
  needsTrojan,
  orgSlug,
  initialHandoff,
}: {
  questionId: string;
  audience: Audience;
  question: string;
  needsTrojan: boolean;
  orgSlug?: string | null;
  initialHandoff?: { id: string; status: string } | null;
}) {
  const [handoff, setHandoff] = useState<{ id: string; status: string; promise?: string } | null>(initialHandoff ?? null);
  const [asking, setAsking] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => {
    try {
      setName(localStorage.getItem("ct_name") ?? "");
    } catch {}
  }, []);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handOff() {
    if (!questionId) return;
    setBusy(true);
    setErr(null);
    try {
      try {
        localStorage.setItem("ct_name", name);
      } catch {}
      const r = await fetch("/api/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: questionId, asker_name: name || null, note: note || null, org_slug: orgSlug }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Couldn't reach a Trojan");
      setHandoff({ id: d.handoff_id, status: d.status, promise: d.promise });
      rain(["✌️", "📨", "✌️"], 50);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (handoff)
    return (
      <div className="space-y-4">
        <p>
          <span className="display mr-2 text-2xl text-cardinal">Sent to the Trojans! ✌️</span>
          <span className="font-semibold">{handoff.promise ?? ""}</span>
        </p>
        <Chat handoffId={handoff.id} as="student" myName={name || null} promise={handoff.promise} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <CallButton questionId={questionId} handoffId={handoff.id} audience={audience} prefill={question} />
          <a href={`/q/${questionId}`} className="link text-sm">
            Link to this conversation
          </a>
        </div>
      </div>
    );

  if (asking)
    return (
      <div className="pop max-w-2xl space-y-3">
        <h3 className="display text-2xl">Ask a Trojan</h3>
        {audience === "applicant" && (
          <p className="text-sm font-medium">
            A USC student ambassador will reply here. Replies are async, contact details are never exchanged, and Trojans coach but never write essays for you.
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-[180px_1fr]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" aria-label="Your first name" className="field" />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything that helps? (optional, no IDs or grades)"
            aria-label="Anything that helps? Optional. No IDs or grades."
            className="field"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button onClick={handOff} disabled={busy} data-fx="boom" className="btn btn-primary btn-lg">
            {busy ? "Finding a Trojan…" : "Send it ✌️"}
          </button>
          <button onClick={() => setAsking(false)} className="btn">
            Never mind
          </button>
          {err && <span className="font-bold text-[#c81e1e]">😵 {err}</span>}
        </div>
      </div>
    );

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <button onClick={() => setAsking(true)} data-fx="boom" className={`btn btn-lg ${needsTrojan ? "btn-primary" : "btn-dark"}`}>
        {needsTrojan ? "Ask a Trojan ✌️" : "Ask a Trojan anyway"}
      </button>
      <CallButton questionId={questionId} audience={audience} prefill={question} />
      <span className="text-sm font-bold">Real USC students. Free.</span>
    </div>
  );
}
