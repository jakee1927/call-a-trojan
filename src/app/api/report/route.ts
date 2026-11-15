import { db } from "@/lib/supabase-server";

/** Students flag a verified answer. Three reports hide it (expires it now). */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const id = String(b.verified_answer_id ?? "");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const supa = db();
  const { data } = await supa.from("verified_answers").select("reports").eq("id", id).single();
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  const reports = (data.reports ?? 0) + 1;
  const patch: Record<string, unknown> = { reports };
  if (reports >= 3) patch.expires_at = new Date().toISOString();
  await supa.from("verified_answers").update(patch).eq("id", id);
  return Response.json({ ok: true, reports });
}
