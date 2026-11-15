import { db, broadcast } from "@/lib/supabase-server";
import { currentHelperId } from "@/lib/helper-auth";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentHelperId();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
  const supa = db();
  const { data, error } = await supa
    .from("handoffs")
    .update({ helper_id: me, status: "claimed", claimed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "open")
    .select("id,question_id")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) {
    const { data: cur } = await supa.from("handoffs").select("helper_id,status").eq("id", id).single();
    if (cur?.helper_id === me) return Response.json({ ok: true });
    return Response.json({ error: "Another Trojan already claimed this one." }, { status: 409 });
  }
  const { data: hp } = await supa.from("public_helpers").select("id,name,year,major,tags,avatar_url,is_demo").eq("id", me).single();
  const { data: sys } = await supa
    .from("messages")
    .insert({ handoff_id: id, sender: "system", body: `${hp?.name ?? "A Trojan"} joined the chat.` })
    .select("id,sender,sender_name,body,created_at")
    .single();
  await supa.from("questions").update({ status: "claimed" }).eq("id", data.question_id);
  await broadcast(id, "status", { status: "claimed", helper: hp });
  if (sys) await broadcast(id, "message", sys);
  await broadcast("inbox", "handoff", { id, kind: "claimed" });
  return Response.json({ ok: true });
}
