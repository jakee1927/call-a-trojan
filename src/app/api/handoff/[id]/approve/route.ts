import { db, broadcast } from "@/lib/supabase-server";
import { currentHelperId } from "@/lib/helper-auth";

/** Helper approves (optionally edited) Q&A → verified_answers, expiring after one semester. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentHelperId();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim().slice(0, 500);
  const answer = String(body.answer ?? "").trim().slice(0, 3000);
  const topics = Array.isArray(body.topics) ? body.topics.map(String).slice(0, 6) : [];
  if (!question || !answer) return Response.json({ error: "Question and answer are required." }, { status: 400 });
  const supa = db();
  const { data: h } = await supa.from("handoffs").select("id,helper_id,status,question_id,verified_answer_id").eq("id", id).single();
  if (!h || h.helper_id !== me) return Response.json({ error: "Not your question." }, { status: 403 });
  if (h.verified_answer_id) return Response.json({ verified_answer_id: h.verified_answer_id });
  const [{ data: hp }, { data: q }] = await Promise.all([
    supa.from("helpers").select("name,major,year").eq("id", me).single(),
    supa.from("questions").select("audience").eq("id", h.question_id).single(),
  ]);
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 122); // ~one semester
  const { data: va, error } = await supa
    .from("verified_answers")
    .insert({
      question,
      answer,
      topics,
      helper_id: me,
      helper_name: hp?.name ?? "A Trojan",
      helper_major: hp?.major ?? null,
      helper_year: hp?.year ?? null,
      audience: q?.audience ?? "current",
      handoff_id: id,
      expires_at: expires.toISOString(),
    })
    .select("id")
    .single();
  if (error || !va) return Response.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  await supa
    .from("handoffs")
    .update({ status: "approved", verified_answer_id: va.id, closed_at: new Date().toISOString() })
    .eq("id", id);
  await broadcast(id, "status", { status: "approved" });
  await broadcast("inbox", "handoff", { id, kind: "approved" });
  return Response.json({ verified_answer_id: va.id });
}
