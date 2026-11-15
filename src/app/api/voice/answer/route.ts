import { currentHelperId } from "@/lib/helper-auth";
import { db } from "@/lib/supabase-server";
import { getCall, updateCall } from "@/voice/server/calls";
import { ringChannel } from "@/voice/server/pick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** For the helper's /call/answer page (no-Twilio fallback): which channel rings me? */
export async function GET() {
  const id = await currentHelperId();
  if (!id) return Response.json({ error: "signed_out" }, { status: 401 });
  const { data } = await db().from("helpers").select("id, name, on_shift_until").eq("id", id).maybeSingle();
  return Response.json({
    helper: data ? { id: data.id, name: data.name, on_shift: !!data.on_shift_until && new Date(data.on_shift_until) > new Date() } : null,
    channel: ringChannel(id),
  });
}

/** Helper accepted / declined / hung up. Body: { call_id, status: "connected" | "ended" | "declined" } */
export async function POST(req: Request) {
  const id = await currentHelperId();
  if (!id) return Response.json({ error: "signed_out" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const row = await getCall(String(body.call_id ?? ""));
  if (!row || row.helper_id !== id) return Response.json({ error: "not your call" }, { status: 404 });
  const now = new Date().toISOString();
  if (body.status === "connected") await updateCall(row.id, { status: "connected", answered_at: row.answered_at ?? now });
  else if (body.status === "declined") await updateCall(row.id, { status: "no-answer", ended_at: now });
  else if (body.status === "ended" && row.status !== "ended") await updateCall(row.id, { status: "ended", ended_at: now });
  return Response.json({ ok: true });
}
