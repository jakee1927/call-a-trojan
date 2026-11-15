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

const AUDIENCE_WORDS: Record<Audience, string> = {
  current: "a current USC student",
  incoming: "an admitted student about to start at USC",
  applicant: "someone applying to USC (or their parent)",
};

type WebResult = { answer: string; sources: { title: string; url: string }[]; ms: number } | null;

/** Live web search (OpenAI Responses API, hosted web_search tool), preferring official usc.edu pages. */
export async function webSearchUsc(question: string, audience: Audience): Promise<WebResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || process.env.VOICE_WEB_SEARCH === "0") return null;
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Number(process.env.VOICE_WEB_TIMEOUT_MS || 10000));
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.VOICE_WEB_MODEL || "gpt-6-luna",
        tools: [{ type: "web_search" }],
        reasoning: { effort: "low" },
        max_output_tokens: 2000,
        instructions:
          "You research questions for Call a Trojan, a USC help line. Search the web, strongly preferring official usc.edu pages (schools, departments, Registrar, catalogue, admissions). " +
          "Reply in 2-4 plain sentences meant to be read aloud: no URLs, no markdown, no lists. Say which page the facts come from in words. If you can't find it, say so plainly.",
        input: `The person asking is ${AUDIENCE_WORDS[audience]}. Question: ${question}`,
      }),
      cache: "no-store",
    });
    const j = (await res.json()) as {
      output?: { content?: { type: string; text?: string; annotations?: { type: string; url?: string; title?: string }[] }[] }[];
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(j.error?.message ?? String(res.status));
    const parts = (j.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text");
    const answer = parts.map((p) => p.text ?? "").join(" ").replace(/\(\[[^\]]*\]\([^)]*\)\)/g, "").replace(/\s+/g, " ").trim();
    const seen = new Set<string>();
    const sources = parts
      .flatMap((p) => p.annotations ?? [])
      .filter((a) => a.type === "url_citation" && a.url)
      .map((a) => ({ title: a.title || new URL(a.url!).hostname, url: a.url!.replace(/[?&]utm_source=openai/, "") }))
      .filter((s) => !seen.has(s.url) && seen.add(s.url))
      .slice(0, 4);
    return answer ? { answer: speakable(answer), sources, ms: Date.now() - t0 } : null;
  } catch (e) {
    console.error("[voice/tool] web search", String(e).slice(0, 200));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupUsc(callId: string, rawQuestion: unknown, audience: Audience): Promise<LookupResult> {
  const t0 = Date.now();
  const question = String(rawQuestion ?? "").trim().slice(0, 1000);
  if (question.length < 3) return { ms: 0, question_id: null, sources: [], output: { error: "Ask the caller to repeat the question." } };
  // The live web search runs alongside our grounded answer (verified Trojan answers + saved USC pages).
  const webP = webSearchUsc(question, audience);
  try {
    const [r, web] = await Promise.all([askText({ question, audience, mode: "voice", persist: true }), webP]);
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
    if (r.question_id) await mergeMeta(callId, { last_question_id: r.question_id, web_ms: web?.ms ?? null });
    const webSources = (web?.sources ?? []).map((s, i) => ({ ref: `W${i + 1}`, title: s.title, url: s.url }));
    return {
      ms: Date.now() - t0,
      question_id: r.question_id ?? null,
      sources: [...(r.sources as LookupResult["sources"]), ...webSources],
      route: r.route,
      output: {
        route: r.route,
        confidence: r.confidence,
        official_answer: speakable(r.answer_markdown),
        official_sources: r.sources.map((s) => s.title),
        web_answer: web?.answer ?? null,
        web_sources: webSources.map((s) => s.title),
        trojan_answers: trojan,
        note:
          "official_answer comes from USC pages we've checked; web_answer is a live web search. Use whichever actually answers the question " +
          "(official_answer wins if they conflict) and paraphrase it in 1-3 spoken sentences. If neither answers it, say so. " +
          (r.route === "ai" ? "" : "Then offer to connect them with a real Trojan."),
        question_id: r.question_id ?? null,
      },
    };
  } catch (e) {
    console.error("[voice/tool] lookup", e);
    const web = await webP;
    if (web) {
      return {
        ms: Date.now() - t0,
        question_id: null,
        sources: web.sources.map((s, i) => ({ ref: `W${i + 1}`, title: s.title, url: s.url })),
        output: { web_answer: web.answer, web_sources: web.sources.map((s) => s.title), note: "Paraphrase the web answer in 1-3 spoken sentences." },
      };
    }
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
