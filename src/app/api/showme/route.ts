import { showMe } from "@/lib/ai-tasks";
import { db } from "@/lib/supabase-server";
import type { Audience } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const image = String(b.image ?? "");
  const mediaType = TYPES.includes(b.media_type) ? (b.media_type as (typeof TYPES)[number]) : "image/jpeg";
  if (!image || image.length > 7_000_000) return Response.json({ error: "Attach a screenshot (under 5 MB)." }, { status: 400 });
  const question = String(b.question ?? "").trim().slice(0, 500) || "What do I do on this screen?";
  const audience: Audience = ["current", "incoming", "applicant"].includes(b.audience) ? b.audience : "current";
  const result = await showMe({ question, imageBase64: image, mediaType, width: Number(b.width) || undefined, height: Number(b.height) || undefined });
  if (!result) return Response.json({ error: "Couldn't read that screenshot. Try a clearer one, or ask a Trojan." }, { status: 502 });
  const md =
    `${result.answer}\n\n` + result.steps.map((s) => `${s.n}. ${s.text}`).join("\n");
  const { data } = await db()
    .from("questions")
    .insert({
      text: question,
      audience,
      org_slug: b.org_slug === "usg" ? "usg" : null,
      mode: "showme",
      route: result.needs_trojan ? "both" : "ai",
      confidence: result.needs_trojan ? 0.4 : 0.8,
      answer_md: `(Screenshot: ${result.what_is_this})\n\n${md}`,
      status: "answered",
      image_url: "attached",
    })
    .select("id")
    .single();
  return Response.json({ question_id: data?.id ?? null, result });
}
