"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Chat } from "../Chat";
import { Markdown } from "../Markdown";
import type { Briefing, QADraft, Source } from "@/lib/types";

type Detail = {
  handoff: { id: string; status: string; briefing: Briefing | null; draft?: QADraft | null; helper_id: string | null; created_at: string; verified_answer_id: string | null };
  question: { id: string; text: string; audience: string; route: string | null; answer_md: string | null; asker_name: string | null; image_url: string | null } | null;
  helper: { id: string; name: string } | null;
  viewer: { helper_id: string; is_assignee: boolean } | null;
};

export function HelperHandoff({ id, sources }: { id: string; sources: Source[] }) {
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<QADraft | null>(null);
  const [showAi, setShowAi] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/handoff/${id}`, { cache: "no-store" });
    if (!r.ok) return setErr("Couldn't load this question.");
    const data = (await r.json()) as Detail;
    setD(data);
    if (data.handoff.draft) setDraft((cur) => cur ?? data.handoff.draft!);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(path: string, body?: unknown) {
    setBusy(path);
    setErr(null);
    try {
      const r = await fetch(`/api/handoff/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const res = await r.json();
      if (!r.ok) throw new Error(res.error ?? "Something went wrong");
      if (res.draft) setDraft(res.draft);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!d) return <div className="p-8 text-center text-black/40">{err ?? "Loading…"}</div>;
  if (!d.viewer)
    return (
      <div className="p-8 text-center">
        <p className="mb-3">Sign in to the Trojan app to answer this.</p>
        <Link href="/trojan" className="rounded-full bg-cardinal px-5 py-2.5 font-bold text-white">Sign in</Link>
      </div>
    );

  const h = d.handoff;
  const b = h.briefing;
  const mine = d.viewer.is_assignee;

  return (
    <div className="min-h-screen bg-paper pb-16">
      <div className="bg-cardinal px-4 pb-5 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto max-w-xl">
          <Link href="/trojan" className="text-sm text-white/70">← Inbox</Link>
          <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-gold">Briefing · {d.question?.audience ?? "student"}{d.question?.asker_name ? ` · ${d.question.asker_name}` : ""}</div>
          <h1 className="mt-1 text-2xl font-black leading-tight">{b?.title ?? d.question?.text}</h1>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-4 px-4 pt-4">
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <Row label="They asked" text={b?.asked ?? d.question?.text ?? ""} />
          <Row label="The AI said" text={b?.ai_said ?? "…"} />
          <Row label="Still open for you" text={b?.still_open ?? "The AI is writing the briefing…"} strong />
          {d.question?.image_url && <p className="text-xs text-black/45">📷 The student attached a screenshot.</p>}
          {d.question?.answer_md && (
            <button onClick={() => setShowAi((v) => !v)} className="text-xs font-bold text-cardinal underline">
              {showAi ? "Hide" : "Show"} the full AI answer
            </button>
          )}
          {showAi && d.question?.answer_md && (
            <div className="rounded-xl bg-black/5 p-3">
              <Markdown text={d.question.answer_md} sources={sources} />
            </div>
          )}
        </div>

        {h.status === "open" && (
          <button onClick={() => act("claim")} disabled={!!busy} className="w-full rounded-2xl bg-cardinal py-4 text-lg font-black text-white shadow-lg shadow-cardinal/30 disabled:opacity-60">
            {busy ? "Claiming…" : "Claim & reply"}
          </button>
        )}

        {h.status !== "open" && !mine && (
          <p className="rounded-2xl bg-white p-4 text-center text-sm text-black/55">{d.helper?.name ?? "Another Trojan"} has this one.</p>
        )}

        {mine && h.status !== "open" && (
          <>
            <Chat handoffId={id} as="helper" disabled={h.status !== "claimed"} onStatus={(s) => { if (s !== h.status) load(); }} />
            {h.status === "claimed" && (
              <button onClick={() => act("close")} disabled={!!busy} className="w-full rounded-2xl bg-ink py-3.5 font-black text-white disabled:opacity-60">
                {busy === "close" ? "Drafting the Q&A…" : "End chat & save answer"}
              </button>
            )}
          </>
        )}

        {mine && h.status === "closed" && draft && (
          <div className="space-y-3 rounded-2xl border-2 border-gold bg-white p-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-cardinal">Approve your verified answer</div>
              <p className="text-sm text-black/55">The AI drafted this from your chat with names and personal details removed. Edit anything, then approve. The next student who asks gets it instantly.</p>
            </div>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-black/45">Question</span>
              <textarea value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} rows={2} className="mt-1 w-full rounded-xl bg-black/5 p-3 text-[15px] outline-none focus:ring-2 focus:ring-cardinal/30" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-black/45">Your answer</span>
              <textarea value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} rows={6} className="mt-1 w-full rounded-xl bg-black/5 p-3 text-[15px] outline-none focus:ring-2 focus:ring-cardinal/30" />
            </label>
            <div className="flex flex-wrap gap-1">
              {draft.topics.map((t) => (
                <span key={t} className="rounded-full bg-gold/40 px-2 py-0.5 text-xs font-semibold">{t}</span>
              ))}
            </div>
            <button onClick={() => act("approve", draft)} disabled={!!busy} className="w-full rounded-xl bg-cardinal py-3.5 text-lg font-black text-white disabled:opacity-60">
              {busy === "approve" ? "Saving…" : "✓ Approve"}
            </button>
            <p className="text-center text-[11px] text-black/40">Shown as your experience, not official policy. Expires after one semester.</p>
          </div>
        )}

        {mine && h.status === "approved" && (
          <div className="rounded-2xl bg-ink p-5 text-center text-white">
            <div className="text-3xl">✓</div>
            <div className="text-xl font-black text-gold">Verified answer saved.</div>
            <p className="mt-1 text-sm text-white/70">Your answer now belongs to every Trojan who asks after them.</p>
            <Link href="/trojan" className="mt-4 inline-block rounded-full bg-white/10 px-4 py-2 text-sm font-bold">Back to inbox</Link>
          </div>
        )}

        {err && <p className="text-center text-sm text-red-700">{err}</p>}
      </div>
    </div>
  );
}

function Row({ label, text, strong }: { label: string; text: string; strong?: boolean }) {
  return (
    <div>
      <div className={`text-[11px] font-bold uppercase tracking-wider ${strong ? "text-cardinal" : "text-black/40"}`}>{label}</div>
      <p className={`text-[15px] leading-snug ${strong ? "font-semibold" : "text-black/75"}`}>{text}</p>
    </div>
  );
}
