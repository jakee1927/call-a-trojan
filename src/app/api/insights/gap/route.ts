import { gapReport } from "@/lib/ai-tasks";
import { db } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Claude writes "Questions USC's websites can't answer" from the handoff log. */
export async function POST() {
  const supa = db();
  const { data: recent } = await supa.from("gap_reports").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 60_000)
    return Response.json({ error: "A report was just generated. Try again in a minute." }, { status: 429 });
  const { data: qs } = await supa
    .from("questions")
    .select("text,route,topics,audience,status")
    .in("route", ["trojan", "both"])
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (qs ?? []).map((q) => ({ question: q.text, route: q.route, topics: q.topics ?? [], audience: q.audience, status: q.status }));
  if (rows.length < 3) return Response.json({ error: "Need at least 3 handed-off questions first." }, { status: 400 });
  const body = await gapReport(rows);
  const { data } = await supa.from("gap_reports").insert({ body_md: body, handoff_count: rows.length }).select("body_md,created_at,handoff_count").single();
  return Response.json({ report: data });
}
