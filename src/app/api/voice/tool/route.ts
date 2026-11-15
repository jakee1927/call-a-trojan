import { askText } from "@/lib/ask";
import { db } from "@/lib/supabase-server";
import type { Audience } from "@/lib/types";
import { speakable } from "@/voice/server/aiTrojan";
import { getCall, isUuid, mergeMeta } from "@/voice/server/calls";
import { readTicket } from "@/voice/server/pick";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const AUDIENCES: Audience[] = ["current", "incoming", "applicant"];

/**
 * Server side of the AI Trojan's tool calls. The browser relays the model's function call here and
 * sends our JSON back to the model as the function_call_output.
 * Body: { ticket, name, arguments: {..} }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const t = readTicket(body.ticket);
  if (!t || t.mode !== "ai") return Response.json({ error: "bad ticket" }, { status: 401 });
  const args = (typeof body.arguments === "string" ? safeJson(body.arguments) : body.arguments) ?? {};
  const audience: Audience = AUDIENCES.includes(t.audience as Audience) ? (t.audience as Audience) : "current";
  const t0 = Date.now();

  if (body.name === "lookup_usc") {
    const question = String(args.question ?? "").trim().slice(0, 1000);
    if (question.length < 3) return Response.json({ output: { error: "Ask the caller to repeat the question." } });
    try {
      const r = await askText({ question, audience, mode: "voice", persist: true });
      // Pull the Trojan answers' text so the voice model can share them ("a Trojan who did this said...").
      let trojan: { by: string; said: string }[] = [];
      if (r.used_answers.length) {
        const { data } = await db()
          .from("verified_answers")
          .select("id, answer, helper_name, helper_major, helper_year")
          .in("id", r.used_answers.map((u) => u.id));
        trojan = (data ?? []).map((v) => ({
          by: [v.helper_name, v.helper_major, v.helper_year].filter(Boolean).join(", "),
          said: String(v.answer).slice(0, 700),
        }));
      }
      if (r.question_id) await mergeMeta(t.call_id, { last_question_id: r.question_id });
      const ms = Date.now() - t0;
      return Response.json({
        ms,
        question_id: r.question_id ?? null,
        sources: r.sources,
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
      });
    } catch (e) {
      console.error("[voice/tool] lookup", e);
      return Response.json({
        ms: Date.now() - t0,
        output: { error: "The lookup failed. Say you couldn't reach USC's pages and offer to leave it for a real Trojan." },
      });
    }
  }

  if (body.name === "leave_for_trojan") {
    const question = String(args.question ?? "").trim().slice(0, 1000);
    const summary = args.summary ? String(args.summary).slice(0, 800) : null;
    let questionId = isUuid(args.question_id) ? args.question_id : null;
    if (!questionId) {
      // The last lookup already saved the question; hand that one off (it has the AI's answer for the briefing).
      const row = await getCall(t.call_id);
      const last = row?.meta?.last_question_id;
      if (isUuid(last)) questionId = last;
    }
    try {
      if (!questionId && question) {
        // Record the question so the handoff has something to point to.
        const { data } = await db()
          .from("questions")
          .insert({ text: question, audience, mode: "voice", route: "trojan", status: "answered" })
          .select("id")
          .single();
        questionId = data?.id ?? null;
      }
      if (!questionId) throw new Error("no question");
      const { POST: createHandoff } = await import("@/app/api/handoff/route");
      const res = await createHandoff(
        new Request(new URL("/api/handoff", req.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question_id: questionId, note: summary ? `From an AI Trojan call: ${summary}` : "From an AI Trojan call." }),
        }),
      );
      const j = (await res.json().catch(() => ({}))) as { handoff_id?: string; promise?: string };
      await mergeMeta(t.call_id, { handoff_id: j.handoff_id ?? null, handoff_question_id: questionId });
      return Response.json({
        question_id: questionId,
        handoff_id: j.handoff_id ?? null,
        output: { ok: true, tell_caller: j.promise ?? "A Trojan will reply in the app, usually within a couple hours." },
      });
    } catch (e) {
      console.error("[voice/tool] handoff", e);
      await mergeMeta(t.call_id, { handoff_requested: { question, summary, at: new Date().toISOString() } });
      return Response.json({ output: { ok: true, tell_caller: "I've saved it for a real Trojan; they'll reply in the app." } });
    }
  }

  return Response.json({ output: { ok: true } });
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
