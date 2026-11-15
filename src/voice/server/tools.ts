import "server-only";
import { askText } from "@/lib/ask";
import { siteUrl } from "@/lib/notify";
import { db } from "@/lib/supabase-server";
import type { Audience } from "@/lib/types";
import { speakable } from "./aiTrojan";
import { getCall, isUuid, mergeMeta } from "./calls";

/** The AI Trojan's server-side tools, shared by the web call (/api/voice/tool) and the phone line (sideband). */

export const AUDIENCES: Audience[] = ["current", "incoming", "applicant"];
export const asAudience = (a: unknown): Audience => (AUDIENCES.includes(a as Audience) ? (a as Audience) : "current");

export type LookupResult = {
  ms: number;
  question_id: string | null;
  sources: { ref: string; title: string; url: string }[];
  route?: string;
  output: Record<string, unknown>;
};

export async function lookupUsc(callId: string, rawQuestion: unknown, audience: Audience): Promise<LookupResult> {
  const t0 = Date.now();
  const question = String(rawQuestion ?? "").trim().slice(0, 1000);
  if (question.length < 3) return { ms: 0, question_id: null, sources: [], output: { error: "Ask the caller to repeat the question." } };
  try {
    const r = await askText({ question, audience, mode: "voice", persist: true });
    // Pull the Trojan answers' text so the voice model can share them ("a Trojan who did this said...").
    let trojan: { by: string; said: string }[] = [];
    if (r.used_answers.length) {
      const { data } = await db()
        .from("verified_answers")
        .select("id, answer, helper_name, helper_major, helper_year")
        .in(
          "id",
          r.used_answers.map((u) => u.id),
        );
      trojan = (data ?? []).map((v) => ({
        by: [v.helper_name, v.helper_major, v.helper_year].filter(Boolean).join(", "),
        said: String(v.answer).slice(0, 700),
      }));
    }
    if (r.question_id) await mergeMeta(callId, { last_question_id: r.question_id });
    return {
      ms: Date.now() - t0,
      question_id: r.question_id ?? null,
      sources: r.sources as LookupResult["sources"],
      route: r.route,
      output: {
        route: r.route,
        confidence: r.confidence,
        official_answer: speakable(r.answer_markdown),
        official_sources: r.sources.map((s) => s.title),
        trojan_answers: trojan,
        note:
          r.route === "ai"
            ? "Paraphrase the official answer in 1-3 spoken sentences."
            : "Give the official part briefly, then offer to leave this for a real Trojan.",
        question_id: r.question_id ?? null,
      },
    };
  } catch (e) {
    console.error("[voice/tool] lookup", e);
    return {
      ms: Date.now() - t0,
      question_id: null,
      sources: [],
      output: { error: "The lookup failed. Say you couldn't reach USC's pages and offer to leave it for a real Trojan." },
    };
  }
}

export type HandoffResult = { question_id: string | null; handoff_id: string | null; promise: string | null; ok: boolean };

/** Hand the caller's question to a real Trojan via main's handoff route (briefing + Discord alert happen there). */
export async function createHandoffForCall(
  callId: string,
  opts: { question?: unknown; summary?: unknown; questionId?: unknown; audience: Audience; mode?: string; baseUrl?: string; notePrefix?: string },
): Promise<HandoffResult> {
  const question = String(opts.question ?? "").trim().slice(0, 1000);
  const summary = opts.summary ? String(opts.summary).slice(0, 800) : null;
  let questionId = isUuid(opts.questionId) ? opts.questionId : null;
  const row = await getCall(callId);
  if (!questionId) {
    // The last lookup already saved the question; hand that one off (it has the AI's answer for the briefing).
    const last = row?.meta?.last_question_id;
    if (isUuid(last)) questionId = last;
  }
  const prefix = opts.notePrefix ?? "From an AI Trojan call";
  try {
    if (!questionId && question) {
      // Record the question so the handoff has something to point to.
      const { data } = await db()
        .from("questions")
        .insert({ text: question, audience: opts.audience, mode: opts.mode ?? "voice", route: "trojan", status: "answered" })
        .select("id")
        .single();
      questionId = data?.id ?? null;
    }
    if (!questionId) throw new Error("no question");
    const { POST: createHandoff } = await import("@/app/api/handoff/route");
    const res = await createHandoff(
      new Request(new URL("/api/handoff", opts.baseUrl ?? siteUrl()), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: questionId, note: summary ? `${prefix}: ${summary}` : `${prefix}.` }),
      }),
    );
    const j = (await res.json().catch(() => ({}))) as { handoff_id?: string; promise?: string };
    await mergeMeta(callId, { handoff_id: j.handoff_id ?? null, handoff_question_id: questionId });
    return { ok: true, question_id: questionId, handoff_id: j.handoff_id ?? null, promise: j.promise ?? null };
  } catch (e) {
    console.error("[voice/tool] handoff", e);
    await mergeMeta(callId, { handoff_requested: { question, summary, at: new Date().toISOString() } });
    return { ok: false, question_id: questionId, handoff_id: null, promise: null };
  }
}

export function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
