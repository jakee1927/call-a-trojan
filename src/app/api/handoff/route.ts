import { after } from "next/server";
import { db, broadcast } from "@/lib/supabase-server";
import { writeBriefing } from "@/lib/ai-tasks";
import { notifyDiscord, siteUrl } from "@/lib/notify";
import { replyPromise } from "@/lib/copy";
import type { Audience } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Student hands a question to a Trojan. Returns immediately; briefing + alerts happen in after(). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const questionId = String(body.question_id ?? "");
  const note = body.note ? String(body.note).slice(0, 1000) : null;
  const askerName = body.asker_name ? String(body.asker_name).slice(0, 60) : null;
  if (!questionId) return Response.json({ error: "question_id required" }, { status: 400 });
  const supa = db();
  const { data: q, error } = await supa
    .from("questions")
    .select("id,text,audience,route,answer_md,image_url")
    .eq("id", questionId)
    .single();
  if (error || !q) return Response.json({ error: "question not found" }, { status: 404 });

  // One open handoff per question.
  const { data: existing } = await supa.from("handoffs").select("id,status").eq("question_id", questionId).maybeSingle();
  if (existing) return Response.json({ handoff_id: existing.id, status: existing.status, promise: replyPromise() });

  const { data: h, error: herr } = await supa
    .from("handoffs")
    .insert({ question_id: questionId, status: "open" })
    .select("id")
    .single();
  if (herr || !h) return Response.json({ error: herr?.message ?? "could not create handoff" }, { status: 500 });

  await supa.from("questions").update({ status: "handed_off", asker_name: askerName }).eq("id", questionId);
  if (note) await supa.from("messages").insert({ handoff_id: h.id, sender: "student", sender_name: askerName, body: note });
  await broadcast("inbox", "handoff", { id: h.id, kind: "new" });

  const base = siteUrl(req);
  after(async () => {
    const briefing = await writeBriefing({
      question: q.text,
      audience: q.audience as Audience,
      aiAnswer: q.answer_md,
      route: q.route,
      studentNote: note,
      hasImage: !!q.image_url,
    });
    await supa.from("handoffs").update({ briefing }).eq("id", h.id);
    await broadcast("inbox", "handoff", { id: h.id, kind: "briefing" });
    await notifyDiscord(
      `@here 🏈 **New question for a Trojan** (${q.audience})\n**${briefing.title}**\n${briefing.still_open}\n→ ${base}/trojan/h/${h.id}`,
    );
  });

  return Response.json({ handoff_id: h.id, status: "open", promise: replyPromise() });
}
