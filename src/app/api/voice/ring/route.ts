import { broadcast } from "@/lib/supabase-server";
import { insertCall, updateCall } from "@/voice/server/calls";
import { decide, parseOverride, ringChannel, signTicket } from "@/voice/server/pick";
import { conferenceTwiml, createCall, twilioEnv, voiceAccessToken } from "@/voice/server/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starts a real call to an on-shift human Trojan.
 *  - transport "twilio": dials the Trojan's phone over PSTN into a private conference, and returns a Voice SDK
 *    token so the laptop browser joins the same conference.
 *  - transport "app": broadcasts an "incoming call" to the Trojan's open /call/answer page; audio goes over WebRTC.
 * Body: { questionId?, handoffId?, audience?, prefill?, call? }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { plan, ctx, helperPhone } = await decide({
    questionId: body.questionId,
    handoffId: body.handoffId,
    override: parseOverride(body.call) === "ai" ? "auto" : parseOverride(body.call),
  });
  if (plan.mode !== "human") return Response.json({ error: "no_human", message: "No human Trojan is on shift right now." }, { status: 409 });

  const question = ctx.question ?? (typeof body.prefill === "string" ? body.prefill.slice(0, 300) : null);
  const room = `ct_${crypto.randomUUID()}`;
  const callId = await insertCall({
    mode: "human",
    transport: plan.transport,
    status: "ringing",
    helper_id: plan.helper.id,
    audience: typeof body.audience === "string" ? body.audience : ctx.audience,
    prompt: question,
    question_id: ctx.questionId,
    handoff_id: typeof body.handoffId === "string" ? body.handoffId : null,
    room,
  });

  if (plan.transport === "twilio") {
    const env = twilioEnv();
    if (!env || !helperPhone) return Response.json({ error: "twilio_not_ready" }, { status: 503 });
    const whisper = question
      ? `Call a Trojan. A student is asking: ${question.slice(0, 140)}. Connecting you now.`
      : "Call a Trojan. A student is on the line. Connecting you now.";
    try {
      const pstn = await createCall(env, helperPhone, conferenceTwiml(room, { say: whisper }), 30);
      await updateCall(callId, { twilio_call_sid: pstn.sid });
      return Response.json({
        call_id: callId,
        transport: "twilio",
        helper: plan.helper,
        room,
        token: voiceAccessToken(env, `student_${callId.replace(/-/g, "").slice(0, 20)}`),
        ticket: signTicket({ call_id: callId, mode: "human", sid: pstn.sid, room }),
      });
    } catch (e) {
      console.error("[voice/ring] twilio", e);
      await updateCall(callId, { status: "failed", meta: { error: String(e).slice(0, 300) } });
      return Response.json({ error: "dial_failed", message: "Couldn't ring the Trojan's phone." }, { status: 502 });
    }
  }

  // App transport: ring the Trojan's open /call/answer page.
  await broadcast(ringChannel(plan.helper.id), "ring", {
    call_id: callId,
    room,
    question,
    audience: body.audience ?? ctx.audience ?? "current",
    at: Date.now(),
  });
  return Response.json({
    call_id: callId,
    transport: "app",
    helper: plan.helper,
    room,
    ticket: signTicket({ call_id: callId, mode: "human", room }),
  });
}
