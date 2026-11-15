import { db } from "@/lib/supabase-server";
import { currentHelperId } from "@/lib/helper-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await currentHelperId();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { data, error } = await db()
    .from("handoffs")
    .select("id,status,briefing,helper_id,created_at,claimed_at,closed_at,questions(text,audience,route,image_url)")
    .or(`status.eq.open,helper_id.eq.${me}`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ me, handoffs: data ?? [] });
}
