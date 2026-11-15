import { askText } from "@/lib/ask";
import type { Audience } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const AUDIENCES: Audience[] = ["current", "incoming", "applicant"];

/**
 * Non-streaming ask. Contract (used by the voice session's AI Trojan):
 * { route, confidence, answer_markdown, sources:[{ref,url,title}], used_answers:[{ref,id,helper_name}], helpers:[{id,name,why}] }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim();
  if (question.length < 3) return Response.json({ error: "question is required" }, { status: 400 });
  const audience: Audience = AUDIENCES.includes(body.audience) ? body.audience : "current";
  try {
    const result = await askText({
      question: question.slice(0, 2000),
      audience,
      orgSlug: body.org_slug === "usg" ? "usg" : null,
      mode: body.mode === "voice" ? "voice" : "type",
      persist: body.persist !== false,
    });
    return Response.json(result);
  } catch (e) {
    console.error("[ask/text]", e);
    return Response.json({ error: "ask failed" }, { status: 500 });
  }
}
