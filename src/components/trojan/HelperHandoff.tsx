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

  if (!d) return <div className="p-8 text-center text-muted">{err ?? "Loading…"}</div>;
  if (!d.viewer)
    return (
      <div className="p-8 text-center">
        <p className="mb-3">Sign in to the Trojan app to answer this.</p>
        <Link href="/trojan" className="btn btn-primary">Sign in</Link>
      </div>
    );

  const h = d.handoff;
  const b = h.briefing;
  const mine = d.viewer.is_assignee;

  return (
    <div className="min-h-screen pb-16">
      <div className="bg-cardinal px-5 pb-5 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto max-w-xl">
          <Link href="/trojan" className="text-sm text-white/85 underline underline-offset-2">Back to inbox</Link>
          <h1 className="display mt-3 text-[2rem] leading-[1.05] text-gold">{b?.title ?? d.question?.text}</h1>
          <p className="mt-1.5 text-sm text-white/80">
            From {d.question?.asker_name ? `${d.question.asker_name}, ` : ""}
            {d.question?.audience === "applicant" ? "an applicant" : d.question?.audience === "incoming" ? "an incoming student" : "a current student"}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-6 px-5 pt-6">
        <dl className="sticker pop space-y-4 p-5">
          <Row label="They asked" text={b?.asked ?? d.question?.text ?? ""} />
          <Row label="The AI said" text={b?.ai_said ?? "…"} />
          <Row label="Still open for you" text={b?.still_open ?? "The AI is writing the briefing…"} strong />
        </dl>
        {d.question?.image_url && <p className="text-sm text-muted">The student attached a screenshot.</p>}
        {d.question?.answer_md && (
          <div>
            <button onClick={() => setShowAi((v) => !v)} className="link text-[15px]">
              {showAi ? "Hide" : "Show"} the full AI answer
            </button>
            {showAi && (
              <div className="sticker pop mt-3 p-4">
                <Markdown text={d.question.answer_md} sources={sources} />
              </div>
            )}
          </div>
        )}

        {h.status === "open" && (
          <button onClick={() => act("claim")} disabled={!!busy} data-fx="boom" className="btn btn-primary btn-lg w-full !py-4 !text-xl">
            {busy ? "Claiming…" : "Claim it ✌️"}
          </button>
        )}

        {h.status !== "open" && !mine && <p className="text-[15px] text-muted">{d.helper?.name ?? "Another Trojan"} has this one.</p>}

        {mine && h.status !== "open" && (
          <>
            <Chat handoffId={id} as="helper" disabled={h.status !== "claimed"} onStatus={(s) => { if (s !== h.status) load(); }} />
            {h.status === "claimed" && (
              <button onClick={() => act("close")} disabled={!!busy} className="btn btn-dark btn-lg w-full">
                {busy === "close" ? "Drafting the Q&A…" : "End chat and save answer"}
              </button>
            )}
          </>
        )}

        {mine && h.status === "closed" && draft && (
          <div className="sticker sticker-tint pop space-y-4 p-5">
            <div>
              <h2 className="display text-2xl">Approve your verified answer</h2>
              <p className="mt-1 text-[15px] text-muted">The AI drafted this from your chat with names and personal details removed. Edit anything, then approve. The next student who asks gets it instantly.</p>
            </div>
            <label className="block">
              <span className="text-sm font-semibold">Question</span>
              <textarea value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} rows={2} className="field mt-1" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Your answer</span>
              <textarea value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} rows={6} className="field mt-1" />
            </label>
            {draft.topics.length > 0 && <p className="text-sm text-muted">Filed under {draft.topics.join(", ")}</p>}
            <button onClick={() => act("approve", draft)} disabled={!!busy} data-fx="rain" className="btn btn-primary btn-lg w-full">
              {busy === "approve" ? "Saving…" : "Approve ✌️"}
            </button>
            <p className="text-sm text-muted">Shown as your experience, not official policy. Expires after one semester.</p>
          </div>
        )}

        {mine && h.status === "approved" && (
          <div className="sticker sticker-cardinal slam p-5">
            <h2 className="display text-3xl text-gold">Verified answer saved! ✌️</h2>
            <p className="mt-1 font-medium text-white/90">Your answer now belongs to every Trojan who asks after them.</p>
            <Link href="/trojan" className="btn btn-gold mt-4">Back to inbox</Link>
          </div>
        )}

        {err && <p className="text-sm text-[#b42318]">{err}</p>}
      </div>
    </div>
  );
}

function Row({ label, text, strong }: { label: string; text: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-sm font-extrabold text-cardinal">{label}</dt>
      <dd className={`mt-0.5 leading-snug ${strong ? "text-[17px] font-semibold" : ""}`}>{text}</dd>
    </div>
  );
}
