import { getCall, updateCall, type TranscriptLine } from "@/voice/server/calls";
import { readTicket } from "@/voice/server/pick";
import { hangUp, twilioEnv } from "@/voice/server/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * End a call (either mode) and save what the browser collected: transcript and latency metrics.
 * Also used mid-call (final=false) to checkpoint the transcript. Accepts sendBeacon (text/plain JSON).
 */
export async function POST(req: Request) {
  const body = JSON.parse((await req.text().catch(() => "")) || "{}");
  const t = readTicket(body.ticket);
  if (!t) return Response.json({ error: "bad ticket" }, { status: 401 });
  const final = body.final !== false;

  if (final && t.sid) {
    const env = twilioEnv();
    if (env) await hangUp(env, t.sid).catch(() => {});
  }

  const transcript: TranscriptLine[] = Array.isArray(body.transcript)
    ? body.transcript
        .filter((l: TranscriptLine) => l && typeof l.text === "string" && l.text.trim())
        .slice(-200)
        .map((l: TranscriptLine) => ({ role: l.role, text: l.text.slice(0, 2000), at: l.at }))
    : [];

  const row = await getCall(t.call_id);
  const patch: Record<string, unknown> = {};
  if (transcript.length) patch.transcript = transcript;
  if (body.metrics && typeof body.metrics === "object") patch.metrics = { ...(row?.metrics ?? {}), ...body.metrics };
  if (body.answered && row && !row.answered_at) patch.answered_at = new Date().toISOString();
  if (body.status === "connected" && !final) patch.status = "connected";
  if (final && row?.status !== "ended") {
    const end = new Date();
    patch.status = body.status === "no-answer" || body.status === "failed" ? body.status : "ended";
    patch.ended_at = end.toISOString();
    const startedFrom = row?.answered_at ?? (patch.answered_at as string | undefined) ?? row?.started_at;
    if (startedFrom) patch.duration_s = Math.max(0, Math.round((end.getTime() - new Date(startedFrom).getTime()) / 1000));
  }
  await updateCall(t.call_id, patch);
  return Response.json({ ok: true });
}
