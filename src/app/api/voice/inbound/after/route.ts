import { siteUrl } from "@/lib/notify";
import { getCall, mergeMeta, updateCall } from "@/voice/server/calls";
import { say, sendSms, spokenLink, twilioRequestOk, twiml, waitUrl } from "@/voice/server/phone";
import { normalizePhone, onShiftHumans, readTicket } from "@/voice/server/pick";
import { twilioEnv, xmlEscape } from "@/voice/server/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * <Dial> action for the phone line. Query: stage=sip | noai | transfer, t=<ticket>.
 *  - sip: the AI leg ended. Normal hang-up → done. SIP failure → fall back to ringing an on-shift Trojan.
 *  - noai: the AI line is switched off → same fallback.
 *  - transfer: we rang a Trojan. Bridged → done. No answer → give the wait-page link (spoken + SMS).
 */
export async function POST(req: Request) {
  const params = Object.fromEntries(new URLSearchParams(await req.text()));
  if (!twilioRequestOk(req, params)) return new Response("forbidden", { status: 403 });
  const u = new URL(req.url);
  const stage = u.searchParams.get("stage");
  const tk = readTicket(u.searchParams.get("t"));
  if (!tk || tk.mode !== "phone") return twiml("<Hangup/>");
  const row = await getCall(tk.call_id);
  const meta = (row?.meta ?? {}) as Record<string, unknown>;
  const caller = (meta.caller as string) ?? params.From ?? null;
  const line = (meta.line as string) ?? params.To ?? twilioEnv()?.from ?? null;
  const code = (meta.code as string) ?? "";
  const status = params.DialCallStatus ?? "";
  const t = encodeURIComponent(u.searchParams.get("t") ?? "");

  if (stage === "transfer") {
    if (status === "completed" || status === "answered") {
      await updateCall(tk.call_id, { status: "ended", ended_at: new Date().toISOString() });
      return twiml("<Hangup/>");
    }
    const queued = !!meta.handoff_question_id;
    await updateCall(tk.call_id, { status: queued ? "queued" : "missed", ended_at: new Date().toISOString() });
    if (!queued) {
      return twiml(say("Sorry, no Trojan could pick up right now. Please ask your question at " + siteUrl().replace(/^https?:\/\//, "") + ", and a real Trojan will reply. Bye!") + "<Hangup/>");
    }
    const sms = await sendSms(caller, line, `Call a Trojan: your question is saved. A real Trojan will answer it here: ${waitUrl(code)}`);
    await mergeMeta(tk.call_id, { transfer_status: status, sms: sms.ok ? "sent" : `failed: ${sms.error ?? ""}`.slice(0, 200) });
    return twiml(
      say(
        `Sorry, the Trojan couldn't pick up. Your question is saved, and a real Trojan will answer it at ${spokenLink(code)}. ` +
          `Again, the code is ${code.split("").join(", ")}. ${sms.ok ? "We just texted you the link too. " : ""}Thanks for calling Call a Trojan!`,
      ) + "<Hangup/>",
    );
  }

  if (stage === "sip" && (status === "completed" || status === "answered")) {
    return twiml("<Hangup/>"); // the AI call ended normally (bye, or the AI hung up)
  }

  // SIP leg failed (or the AI line is off): ring an on-shift Trojan directly.
  if (stage === "sip") {
    console.error("[voice/inbound] SIP leg failed", { status, sip: params.DialSipResponseCode });
    await mergeMeta(tk.call_id, { sip_failed: { status, code: params.DialSipResponseCode ?? null } });
  }
  const helper = (await onShiftHumans()).find((h) => normalizePhone(h.phone) && normalizePhone(h.phone) !== caller);
  const env = twilioEnv();
  if (helper && env) {
    await updateCall(tk.call_id, { mode: "human", helper_id: helper.id, status: "ringing" });
    return twiml(
      say("Hi, you've reached Call a Trojan. Connecting you to a real USC student now.") +
        `<Dial callerId="${xmlEscape(line ?? env.from)}" timeout="25" answerOnBridge="true" action="${xmlEscape(`${siteUrl()}/api/voice/inbound/after?stage=transfer&t=${t}`)}">` +
        `<Number url="${xmlEscape(`${siteUrl()}/api/voice/inbound/whisper?t=${t}`)}">${xmlEscape(normalizePhone(helper.phone)!)}</Number></Dial>`,
    );
  }
  await updateCall(tk.call_id, { status: "missed", ended_at: new Date().toISOString() });
  const site = siteUrl();
  const sms = await sendSms(caller, line, `Call a Trojan: ask your USC question here and a real Trojan will reply: ${site}`);
  return twiml(
    say(
      `Hi, you've reached Call a Trojan. No Trojan is on the line right now. Ask your question at ${site.replace(/^https?:\/\//, "").replace(/\./g, " dot ")}, and a real USC student will reply. ${sms.ok ? "We just texted you the link. " : ""}Bye!`,
    ) + "<Hangup/>",
  );
}
