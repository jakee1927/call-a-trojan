import { db, broadcast } from "@/lib/supabase-server";
import { currentHelperId } from "@/lib/helper-auth";

export async function POST(req: Request) {
  const me = await currentHelperId();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const hours = Math.max(0, Math.min(12, Number(b.hours ?? 0)));
  const until = hours > 0 ? new Date(Date.now() + hours * 3600_000).toISOString() : null;
  const { error } = await db().from("helpers").update({ on_shift_until: until }).eq("id", me);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await broadcast("presence", "shift", { id: me, on: !!until });
  return Response.json({ on_shift_until: until });
}
