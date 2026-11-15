import { siteUrl } from "@/lib/notify";
import { insertCall } from "@/voice/server/calls";
import { newWaitCode, phoneAiEnabled, say, sipUri, twilioRequestOk, twiml } from "@/voice/server/phone";
import { signTicket } from "@/voice/server/pick";
import { xmlEscape } from "@/voice/server/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Voice webhook of the public Call a Trojan number ("A call comes in" → POST here).
 * Logs the call, then bridges the caller to the AI Trojan over OpenAI Realtime SIP. The Dial's action
 * (/api/voice/inbound/after) catches a failed SIP leg and falls back to ringing an on-shift Trojan.
 */
export async function POST(req: Request) {
  const params = Object.fromEntries(new URLSearchParams(await req.text()));
  if (!twilioRequestOk(req, params)) return new Response("forbidden", { status: 403 });

  const code = await newWaitCode();
  const callId = await insertCall({
    mode: "ai",
    transport: "phone",
    status: "ringing",
    twilio_call_sid: params.CallSid ?? null,
    room: `w_${code}`,
    meta: { caller: params.From ?? null, line: params.To ?? null, code, caller_city: params.FromCity ?? null },
  });
  const t = encodeURIComponent(signTicket({ call_id: callId, mode: "phone" }));
  const after = `${siteUrl()}/api/voice/inbound/after?stage=sip&t=${t}`;

  if (!phoneAiEnabled()) {
    // AI line off: go straight to the human fallback.
    return twiml(`<Redirect method="POST">${xmlEscape(`${siteUrl()}/api/voice/inbound/after?stage=noai&t=${t}`)}</Redirect>`);
  }
  return twiml(
    `<Dial answerOnBridge="true" timeout="20" action="${xmlEscape(after)}"><Sip>${xmlEscape(sipUri(code))}</Sip></Dial>` +
      // Only reached if the action URL itself fails.
      say("Sorry, Call a Trojan is having trouble right now. Please try again in a minute."),
  );
}
