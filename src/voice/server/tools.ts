import "server-only";
import { askText, UNOFFICIAL_HEADING, unofficialSources } from "@/lib/ask";
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

/** Fallback web search (OpenAI Responses API, hosted web_search tool), used only when the main engine fails. */
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
          "You research questions for Call a Trojan, a USC help line. Search the web, official usc.edu pages first (schools, departments, Registrar, catalogue, admissions, advising). If a fact comes from anywhere other than a usc.edu page, say so in the sentence. " +
          "Run two or three targeted searches: the program's or office's own page, plus USC-wide guidance that applies to this person (first-year or transfer advising, General Education). " +
          "Be concrete: name the specific courses with their codes, requirements, dates and the advising or office contact the pages give. If it depends on something you don't know (their major, entry term), give what applies to everyone in their situation, then say what it depends on. " +
          "Reply in 2-4 plain sentences meant to be read aloud: no URLs, no markdown, no lists. Say which page the facts come from in words. If you can't find it, say so plainly.",
        input: `Today is ${new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "long" })}. The person asking is ${AUDIENCE_WORDS[audience]}. Question: ${question}`,
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
  try {
    // One engine for typed answers and calls: saved USC pages + verified Trojan answers + a live search of USC's sites.
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
    // The written answer ends with a "not from official USC pages" list; on a call the AI says it instead.
    const unofficial = unofficialSources(r.answer_markdown);
    const body = r.answer_markdown.split(UNOFFICIAL_HEADING)[0].replace(/\n+---\s*$/, "").trim();
    // Pages the answer linked from its web search, shown as sources next to the saved-page ones.
    const seen = new Set<string>();
    const webSources = Array.from(body.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g))
      .map((m) => ({ title: m[1], url: m[2] }))
      .filter((x) => !seen.has(x.url) && seen.add(x.url))
      .slice(0, 4)
      .map((x, i) => {
        const off = unofficial.find((u) => u.url === x.url);
        return { ref: `W${i + 1}`, title: off ? `${off.title} · not an official USC page` : x.title, url: x.url };
      });
    return {
      ms: Date.now() - t0,
      question_id: r.question_id ?? null,
      sources: [...(r.sources as LookupResult["sources"]), ...webSources],
      route: r.route,
      output: {
        route: r.route,
        confidence: r.confidence,
        answer: spoken(body),
        sources: [...r.sources.map((s) => s.title), ...webSources.map((s) => s.title)],
        not_official_usc: unofficial.map((u) => u.title),
        trojan_answers: trojan,
        note:
          (r.route === "ai"
            ? "Paraphrase the answer in 1-3 spoken sentences. Keep its specifics (course codes, dates, contacts)."
            : "Give the answer briefly, keeping its specifics, then offer to connect them with a real Trojan.") +
          (unofficial.length
            ? ` Part of this is NOT from an official USC page (${unofficial.map((u) => u.title).join("; ")}). When you say that part, say where it's from, e.g. "that's from Reddit, not an official USC page".`
            : ""),
        question_id: r.question_id ?? null,
      },
    };
  } catch (e) {
    console.error("[voice/tool] lookup", e);
    // The main engine failed: fall back to a plain web search so the caller still gets an answer.
    const web = await webSearchUsc(question, audience);
    if (web) {
      return {
        ms: Date.now() - t0,
        question_id: null,
        sources: web.sources.map((s, i) => ({ ref: `W${i + 1}`, title: s.title, url: s.url })),
        output: {
          answer: web.answer,
          sources: web.sources.map((s) => s.title),
          note: "Paraphrase this in 1-3 spoken sentences. If a fact isn't from a usc.edu page, say where it's from.",
        },
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

/** Spoken text: drop citation-style links (a link right after the sentence it supports); keep the words of inline links. */
function spoken(md: string): string {
  return speakable(md.replace(/([.!?;:)])\s*\[[^\]]+\]\(https?:\/\/[^)\s]+\)/g, "$1")).replace(/[ \t]{2,}/g, " ");
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
