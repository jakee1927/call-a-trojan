import { db, broadcast } from "@/lib/supabase-server";
import { currentHelperId } from "@/lib/helper-auth";
import { draftQA } from "@/lib/ai-tasks";
import type { Briefing } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Helper ends the chat; the AI drafts the de-identified Q&A for approval. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentHelperId();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
  const supa = db();
  const { data: h } = await supa.from("handoffs").select("id,helper_id,status,briefing,question_id,draft").eq("id", id).single();
  if (!h || h.helper_id !== me) return Response.json({ error: "Not your question." }, { status: 403 });
  if (h.draft && h.status === "closed") return Response.json({ draft: h.draft });
  const [{ data: q }, { data: msgs }] = await Promise.all([
    supa.from("questions").select("text").eq("id", h.question_id).single(),
    supa.from("messages").select("sender,body").eq("handoff_id", id).neq("sender", "system").order("created_at"),
  ]);
  const draft = await draftQA({ question: q?.text ?? "", briefing: h.briefing as Briefing | null, transcript: msgs ?? [] });
  await supa.from("handoffs").update({ status: "closed", closed_at: new Date().toISOString(), draft }).eq("id", id);
  const { data: sys } = await supa
    .from("messages")
    .insert({ handoff_id: id, sender: "system", body: "The Trojan ended the chat. Thanks for asking!" })
    .select("id,sender,sender_name,body,created_at")
    .single();
  await supa.from("questions").update({ status: "answered_by_trojan" }).eq("id", h.question_id);
  await broadcast(id, "status", { status: "closed" });
  if (sys) await broadcast(id, "message", sys);
  await broadcast("inbox", "handoff", { id, kind: "closed" });
  return Response.json({ draft });
}
