import { streamAsk } from "@/lib/ask";
import type { Audience } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const AUDIENCES: Audience[] = ["current", "incoming", "applicant"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim();
  if (question.length < 3) return Response.json({ error: "Ask a question first." }, { status: 400 });
  const audience: Audience = AUDIENCES.includes(body.audience) ? body.audience : "current";
  // Earlier turns of the conversation (the page sends them when the student replies or follows up).
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t: unknown): t is { question: string; answer: string } => {
      const x = t as { question?: unknown; answer?: unknown };
      return typeof x?.question === "string" && typeof x?.answer === "string";
    })
    .slice(-4)
    .map((t: { question: string; answer: string }) => ({ question: t.question.slice(0, 600), answer: t.answer.slice(0, 2500) }));
  const stream = streamAsk({
    history,
    question: question.slice(0, 2000),
    audience,
    orgSlug: body.org_slug === "usg" ? "usg" : null,
    askerName: body.asker_name ? String(body.asker_name) : null,
    mode: body.mode === "showme" || body.mode === "call" ? body.mode : "type",
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
