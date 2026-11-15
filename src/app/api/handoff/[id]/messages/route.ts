import { db, broadcast } from "@/lib/supabase-server";
import { currentHelperId } from "@/lib/helper-auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const text = String(body.body ?? "").trim().slice(0, 2000);
  if (!text) return Response.json({ error: "empty" }, { status: 400 });
  const supa = db();
  const { data: h } = await supa.from("handoffs").select("id,status,helper_id").eq("id", id).single();
  if (!h) return Response.json({ error: "not found" }, { status: 404 });
  if (h.status === "approved") return Response.json({ error: "This conversation is closed." }, { status: 409 });

  let sender: "student" | "helper" = "student";
  let senderName: string | null = body.sender_name ? String(body.sender_name).slice(0, 60) : null;
  if (body.as === "helper") {
    const me = await currentHelperId();
    if (!me || me !== h.helper_id) return Response.json({ error: "Claim this question first." }, { status: 403 });
    sender = "helper";
    const { data: hp } = await supa.from("helpers").select("name").eq("id", me).single();
    senderName = hp?.name ?? "Trojan";
  }
  const { data: msg, error } = await supa
    .from("messages")
    .insert({ handoff_id: id, sender, sender_name: senderName, body: text })
    .select("id,sender,sender_name,body,created_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await broadcast(id, "message", msg);
  if (sender === "student") await broadcast("inbox", "handoff", { id, kind: "message" });
  return Response.json({ message: msg });
}
