import { db } from "@/lib/supabase-server";
import { currentHelperId } from "@/lib/helper-auth";

export const dynamic = "force-dynamic";

/** Handoff detail + chat history. Students reach it by the (unguessable) handoff UUID; helpers via cookie. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supa = db();
  const { data: h } = await supa
    .from("handoffs")
    .select("id,status,briefing,draft,helper_id,created_at,claimed_at,closed_at,verified_answer_id,question_id")
    .eq("id", id)
    .single();
  if (!h) return Response.json({ error: "not found" }, { status: 404 });
  const [{ data: msgs }, { data: q }, helper] = await Promise.all([
    supa.from("messages").select("id,sender,sender_name,body,created_at").eq("handoff_id", id).order("created_at"),
    supa.from("questions").select("id,text,audience,route,answer_md,image_url,asker_name,header,created_at").eq("id", h.question_id).single(),
    h.helper_id
      ? supa.from("public_helpers").select("id,name,year,major,tags,avatar_url,is_demo").eq("id", h.helper_id).single()
      : Promise.resolve({ data: null }),
  ]);
  const me = await currentHelperId();
  return Response.json({
    handoff: { ...h, draft: me ? h.draft : undefined },
    question: q,
    helper: helper.data,
    messages: msgs ?? [],
    viewer: me ? { helper_id: me, is_assignee: me === h.helper_id } : null,
  });
}
