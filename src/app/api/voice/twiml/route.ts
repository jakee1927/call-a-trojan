import { siteUrl } from "@/lib/notify";
import { conferenceTwiml, validTwilioSignature } from "@/voice/server/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Voice URL of the TwiML App. Twilio calls this when the laptop's Voice SDK connects:
 * it drops the browser leg into the call's private conference room (the phone leg is already headed there).
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  if (process.env.TWILIO_SKIP_SIGNATURE !== "1") {
    const u = new URL(req.url);
    const fwdHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
    const fwdProto = req.headers.get("x-forwarded-proto") ?? "https";
    const candidates = Array.from(
      new Set([req.url, `${fwdProto}://${fwdHost}${u.pathname}${u.search}`, `https://${fwdHost}${u.pathname}${u.search}`, `${siteUrl()}${u.pathname}${u.search}`]),
    );
    if (!validTwilioSignature(authToken, req.headers.get("x-twilio-signature"), candidates, params)) {
      console.error("[voice/twiml] bad signature", { candidates });
      return new Response("forbidden", { status: 403 });
    }
  }
  const room = params.room ?? "";
  const xml = /^ct_[0-9a-f-]{36}$/.test(room)
    ? conferenceTwiml(room)
    : `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this call link is invalid.</Say><Hangup/></Response>`;
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}
