import { after } from "next/server";
import { insertCall, mergeMeta, updateCall } from "@/voice/server/calls";
import { acceptCall, findPhoneCall, newWaitCode, numberFromSip, phoneSession, verifyOpenAIWebhook } from "@/voice/server/phone";
import { runSideband } from "@/voice/server/sideband";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // the sideband for the whole phone call lives in this function's after()

type Incoming = {
  type: string;
  data?: { call_id?: string; sip_headers?: { name: string; value: string }[] };
};

const seen = new Set<string>();

/** OpenAI webhook: realtime.call.incoming → accept the SIP call as the AI Trojan and run its tools. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyOpenAIWebhook(raw, req.headers)) {
    console.error("[voice/openai-webhook] bad signature");
    return new Response("bad signature", { status: 401 });
  }
  const evt = JSON.parse(raw) as Incoming;
  if (evt.type !== "realtime.call.incoming" || !evt.data?.call_id) return new Response(null, { status: 200 });
  const openaiCallId = evt.data.call_id;
  const hookId = req.headers.get("webhook-id") ?? openaiCallId;
  if (seen.has(hookId)) return new Response(null, { status: 200 }); // retry of one we're handling
  seen.add(hookId);

  const headers = evt.data.sip_headers ?? [];
  const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? null;
  const caller = numberFromSip(h("From"));
  const code = h("X-CT-Code");

  let row = await findPhoneCall(code, caller);
  if (row?.meta?.openai_call_id === openaiCallId) return new Response(null, { status: 200 });
  if (!row) {
    // Came straight in over a SIP trunk (no Twilio webhook first): log it now.
    const c = await newWaitCode();
    const id = await insertCall({ mode: "ai", transport: "phone", status: "ringing", room: `w_${c}`, meta: { caller, code: c, via: "trunk" } });
    row = { id, meta: { caller, code: c } } as unknown as NonNullable<typeof row>;
  }

  try {
    await acceptCall(openaiCallId, phoneSession());
  } catch (e) {
    console.error("[voice/openai-webhook] accept failed", String(e).slice(0, 400));
    await mergeMeta(row.id, { accept_error: String(e).slice(0, 300) });
    return new Response(null, { status: 200 }); // the Dial action falls back to a human
  }
  await updateCall(row.id, { status: "connected", answered_at: new Date().toISOString() });
  await mergeMeta(row.id, { openai_call_id: openaiCallId });

  const rowId = row.id;
  after(() => runSideband({ openaiCallId, rowId }).catch((e) => console.error("[voice/sideband]", e)));
  return new Response(null, { status: 200 });
}
