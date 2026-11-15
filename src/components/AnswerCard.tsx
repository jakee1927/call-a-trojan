"use client";
import { useEffect, useState } from "react";
import type { AskHeader, Audience, MatchedHelper, UsedAnswer } from "@/lib/types";
import { Markdown, citedSources } from "./Markdown";
import { Avatar } from "./Avatar";
import { Chat } from "./Chat";
import { CallButton } from "@/voice/CallButton";

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
  async function report() {
    setReported(true);
    await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verified_answer_id: a.id }) });
  }
  const who = [a.helper_name, [a.helper_major, yy(a.helper_year)].filter(Boolean).join(" "), monthYear(a.approved_at)].filter(Boolean).join(" · ");
  return (
    <div className="rounded-xl border border-gold/60 bg-white/80 p-3.5">
      <p className="text-[15px] leading-relaxed">{a.answer}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 font-bold text-gold">✓ {who}</span>
        <span className="text-black/45">Experience, not official policy</span>
        {a.is_sample && <span className="rounded bg-black/10 px-1.5 py-0.5 font-bold uppercase tracking-wide text-black/50">sample</span>}
        <button onClick={report} disabled={reported} className="ml-auto text-black/40 hover:text-cardinal disabled:text-black/30">
          {reported ? "Reported, thanks" : "⚑ Report"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-black/40">Answered: “{a.question}”</p>
    </div>
  );
}

function HelperPick({ h }: { h: MatchedHelper }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/10 p-2.5">
      <Avatar name={h.name} url={h.avatar_url} size={40} online={h.online} />
      <div className="min-w-0">
        <div className="truncate font-bold">
          {h.name}
          {h.is_demo && <span className="ml-1 text-xs font-medium opacity-60">(demo)</span>}
          <span className="ml-1.5 text-xs font-medium opacity-70">{[h.major, yy(h.year)].filter(Boolean).join(" ")}</span>
        </div>
        <div className="truncate text-sm opacity-85">{h.why}</div>
      </div>
      {h.online && <span className="ml-auto shrink-0 rounded-full bg-green-500/20 px-2 py-0.5 text-[11px] font-bold text-green-200">on shift</span>}
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

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="mt-1 rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-gold">
          {audience === "current" ? "Current" : audience === "incoming" ? "Incoming" : "Applicant"}
        </span>
        <h2 className="text-xl font-extrabold leading-tight md:text-2xl">{question}</h2>
      </div>

      {needsTrojan && (
        <div className="overflow-hidden rounded-2xl bg-cardinal text-white shadow-lg shadow-cardinal/20">
          <div className="px-5 pb-4 pt-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">The AI stopped here</div>
            <h3 className="mt-1 text-2xl font-black">This one needs a Trojan.</h3>
            <p className="mt-1 text-sm opacity-85">
              {header.route === "both"
                ? "USC's pages cover the policy. A Trojan who's done it can tell you how it actually works."
                : "USC's websites don't answer this. A Trojan who's been there can."}
            </p>
            {header.helpers.length > 0 && (
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {header.helpers.map((h) => (
                  <HelperPick key={h.id} h={h} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* USC says */}
        <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cardinal text-sm font-black text-white">U</span>
            <h3 className="text-sm font-black uppercase tracking-[0.15em] text-cardinal">USC says</h3>
            {header && (
              <span className="ml-auto text-[11px] font-semibold text-black/40">
                from official usc.edu pages
              </span>
            )}
          </div>
          {!header && !markdown ? (
            <div className="space-y-2 py-2">
              <div className="h-3 w-11/12 animate-pulse rounded bg-black/10" />
              <div className="h-3 w-9/12 animate-pulse rounded bg-black/10" />
              <div className="h-3 w-10/12 animate-pulse rounded bg-black/10" />
              <p className="pt-1 text-xs text-black/40">Reading USC&apos;s pages…</p>
            </div>
          ) : (
            <Markdown text={markdown} sources={header?.sources ?? []} streaming={streaming} />
          )}
          {!streaming && sources.length > 0 && (
            <div className="mt-3 border-t border-black/5 pt-3">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-black/40">Sources</div>
              <ul className="space-y-1">
                {sources.map((s) => (
                  <li key={s.ref} className="truncate text-xs">
                    <span className="mr-1.5 font-bold text-cardinal">{s.ref}</span>
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-black/60 underline decoration-black/20 hover:text-cardinal">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Trojans say */}
        <section className="rounded-2xl border border-gold/70 bg-gradient-to-br from-gold/25 to-gold/5 p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold text-sm font-black text-cardinal">T</span>
            <h3 className="text-sm font-black uppercase tracking-[0.15em] text-ink">Trojans say</h3>
            <span className="ml-auto text-[11px] font-semibold text-black/40">verified by real Trojans</span>
          </div>
          {header && header.used_answers.length > 0 ? (
            <div className="space-y-2.5">
              {header.used_answers.map((a) => (
                <TrojanAnswer key={a.id} a={a} />
              ))}
            </div>
          ) : (
            <p className="py-2 text-sm text-black/55">
              {streaming && !header
                ? "Checking the verified-answer bank…"
                : "No Trojan has answered this yet. Ask one, and their answer helps every student who asks after you."}
            </p>
          )}
        </section>
      </div>

      {header && !streaming && (
        <HandoffBox questionId={header.question_id} audience={audience} question={question} needsTrojan={!!needsTrojan} orgSlug={orgSlug} initialHandoff={initialHandoff} />
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
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
        <div className="rounded-2xl border border-black/10 bg-white p-4">
          {handoff ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="live-dot" />
                <span className="font-bold">Sent to the Trojans.</span>
                <span className="text-black/55">{handoff.promise ?? ""}</span>
              </div>
              <Chat handoffId={handoff.id} as="student" myName={name || null} promise={handoff.promise} />
              <div className="flex flex-wrap items-center gap-2">
                <CallButton questionId={questionId} handoffId={handoff.id} audience={audience} prefill={question} />
                <a href={`/q/${questionId}`} className="text-xs text-black/45 underline">Link to this conversation</a>
              </div>
            </div>
          ) : asking ? (
            <div className="space-y-3">
              <div className="font-bold">Ask a Trojan</div>
              {audience === "applicant" && (
                <p className="rounded-lg bg-gold/20 p-2.5 text-xs text-black/70">
                  A USC student ambassador will reply here. Replies are async, contact details are never exchanged, and Trojans coach but never write essays for you.
                </p>
              )}
              <div className="grid gap-2 md:grid-cols-[180px_1fr]">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your first name"
                  className="rounded-xl bg-black/5 px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-cardinal/30"
                />
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything that helps? (optional, no IDs or grades)"
                  className="rounded-xl bg-black/5 px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-cardinal/30"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={handOff} disabled={busy} className="rounded-full bg-cardinal px-5 py-2.5 font-bold text-white disabled:opacity-50">
                  {busy ? "Finding a Trojan…" : "Send to a Trojan"}
                </button>
                <button onClick={() => setAsking(false)} className="px-3 py-2 text-sm text-black/50">
                  Cancel
                </button>
                {err && <span className="text-sm text-red-700">{err}</span>}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setAsking(true)}
                className={`rounded-full px-5 py-2.5 font-bold ${needsTrojan ? "bg-cardinal text-white shadow-md shadow-cardinal/30" : "bg-ink text-white"}`}
              >
                {needsTrojan ? "Ask a Trojan →" : "Ask a Trojan anyway"}
              </button>
              <CallButton questionId={questionId} audience={audience} prefill={question} />
              <span className="text-xs text-black/45">Real USC students. Free.</span>
            </div>
          )}
        </div>
      
  );
}
