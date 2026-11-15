import { readTicket } from "@/voice/server/pick";
import { asAudience, createHandoffForCall, lookupUsc, safeJson } from "@/voice/server/tools";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

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
  const audience = asAudience(t.audience);

  if (body.name === "lookup_usc") {
    return Response.json(await lookupUsc(t.call_id, args.question, audience));
  }

  if (body.name === "leave_for_trojan") {
    const r = await createHandoffForCall(t.call_id, {
      question: args.question,
      summary: args.summary,
      questionId: args.question_id,
      audience,
      baseUrl: req.url,
    });
    return Response.json({
      question_id: r.question_id,
      handoff_id: r.handoff_id,
      output: r.ok
        ? { ok: true, tell_caller: r.promise ?? "A Trojan will reply in the app, usually within a couple hours." }
        : { ok: true, tell_caller: "I've saved it for a real Trojan; they'll reply in the app." },
    });
  }

  return Response.json({ output: { ok: true } });
}
