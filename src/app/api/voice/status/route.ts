import { getCall, updateCall } from "@/voice/server/calls";
import { readTicket } from "@/voice/server/pick";
import { fetchCall, twilioEnv } from "@/voice/server/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Poll the state of the human Trojan's phone leg.
 * Returns { state: "ringing" | "connected" | "ended", reason? }.
 */
export async function GET(req: Request) {
  const t = readTicket(new URL(req.url).searchParams.get("ticket"));
  if (!t || t.mode !== "human") return Response.json({ error: "bad ticket" }, { status: 401 });

  if (t.sid) {
    const env = twilioEnv();
    if (!env) return Response.json({ state: "ended", reason: "twilio_not_ready" });
    try {
      const c = await fetchCall(env, t.sid);
      const s = c.status;
      const state = s === "in-progress" ? "connected" : s === "queued" || s === "initiated" || s === "ringing" ? "ringing" : "ended";
      if (state === "connected") {
        const row = await getCall(t.call_id);
        if (row && !row.answered_at) await updateCall(t.call_id, { status: "connected", answered_at: new Date().toISOString() });
      }
      return Response.json({ state, twilio_status: s, reason: state === "ended" ? s : undefined });
    } catch (e) {
      console.error("[voice/status]", e);
      return Response.json({ state: "unknown" });
    }
  }

  // App transport: state comes from the call row (the answer page updates it).
  const row = await getCall(t.call_id);
  return Response.json({ state: row?.status === "connected" ? "connected" : row?.status === "ended" ? "ended" : "ringing" });
}
