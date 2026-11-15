import "server-only";
import { siteUrl } from "@/lib/notify";
import { getCall, mergeMeta, updateCall, type TranscriptLine } from "./calls";
import {
  hangupOpenAI,
  PHONE_GREETING,
  PHONE_MAX_SECONDS,
  redirectCall,
  referCall,
  sendSms,
  spokenLink,
  waitUrl,
} from "./phone";
import { normalizePhone, onShiftHumans, signTicket } from "./pick";
import { asAudience, createHandoffForCall, lookupUsc, safeJson } from "./tools";
import { twilioEnv, xmlEscape } from "./twilio";

type Ev = { type: string; [k: string]: unknown };

/**
 * Server-side "sideband" for a phone call the AI Trojan answered over SIP: receives the model's events,
 * runs its tools (lookup_usc, transfer_to_trojan, end_call), and keeps the transcript.
 * Runs inside the webhook function's after(), so it must finish before Vercel's maxDuration (300 s).
 */
export async function runSideband(o: { openaiCallId: string; rowId: string }) {
  const key = process.env.OPENAI_API_KEY!;
  const row = await getCall(o.rowId);
  const meta = (row?.meta ?? {}) as Record<string, string | undefined>;
  const caller = meta.caller ?? null;
  const line = meta.line ?? twilioEnv()?.from ?? null;
  const code = meta.code ?? "";
  const parentSid = row?.twilio_call_sid ?? null;
  const ticket = signTicket({ call_id: o.rowId, mode: "phone" });
  const started = Date.now();
  const transcript: TranscriptLine[] = [];
  const toolMs: number[] = [];
  let audience = asAudience(row?.audience);

  const pending = new Map<string, { resp: string; output: unknown | null }>();
  const doneResponses = new Set<string>();
  /** Runs after the model finishes the line it says next (goodbye / "connecting you now"). */
  let afterNextLine: (() => Promise<void>) | null = null;
  let armedAfter: string | null = null; // response id that must finish before afterNextLine runs
  let lastResponseStart = Date.now();
  let lastAiWords = 0;
  let endReason = "caller_hung_up";

  // Auth via subprotocol: works with Node's built-in WebSocket on any version (no custom headers needed).
  const ws = new WebSocket(`wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(o.openaiCallId)}`, [
    "realtime",
    `openai-insecure-api-key.${key}`,
  ]);
  const send = (e: Record<string, unknown>) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(e));
  };

  const flush = () => {
    for (const [id, p] of pending) {
      if (p.output !== null && doneResponses.has(p.resp)) {
        send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: id, output: JSON.stringify(p.output) } });
        pending.delete(id);
        send({ type: "response.create" });
      }
    }
  };

  /** Rough time for the phone to finish playing the last AI line (~170 wpm) after generation finishes. */
  const speechTail = () => Math.max(900, lastAiWords * 360 - (Date.now() - lastResponseStart) + 900);

  const transfer = async (args: Record<string, unknown>) => {
    if (args.audience) audience = asAudience(args.audience);
    const h = await createHandoffForCall(o.rowId, {
      question: args.question,
      summary: args.summary,
      audience,
      mode: "voice",
      notePrefix: "From the Call a Trojan phone line",
    });
    const humans = await onShiftHumans();
    // Never ring the caller's own phone (e.g. Jake testing from the cell he's on shift with).
    const helper = humans.find((x) => normalizePhone(x.phone) && normalizePhone(x.phone) !== caller);
    const env = twilioEnv();
    if (helper && (parentSid ? env : true)) {
      const phone = normalizePhone(helper.phone)!;
      await updateCall(o.rowId, { helper_id: helper.id });
      await mergeMeta(o.rowId, { transfer: { helper_id: helper.id, at: new Date().toISOString() } });
      afterNextLine = async () => {
        endReason = "transferred";
        if (parentSid && env) {
          const base = siteUrl();
          const q = `t=${encodeURIComponent(ticket)}`;
          const xml =
            `<?xml version="1.0" encoding="UTF-8"?><Response>` +
            `<Dial callerId="${xmlEscape(line ?? env.from)}" timeout="25" answerOnBridge="true" action="${xmlEscape(`${base}/api/voice/inbound/after?stage=transfer&${q}`)}">` +
            `<Number url="${xmlEscape(`${base}/api/voice/inbound/whisper?${q}`)}">${xmlEscape(phone)}</Number></Dial></Response>`;
          await redirectCall(env, parentSid, xml); // ends the SIP leg to OpenAI; the caller now rings the Trojan
        } else {
          await referCall(o.openaiCallId, `tel:${phone}`); // Elastic SIP Trunk setup: hand off with SIP REFER
        }
      };
      return { status: "connecting", trojan_first_name: helper.name.split(" ")[0], question_saved: h.ok };
    }
    // Nobody on shift: keep the handoff queued and give them the wait-page link.
    const sms = await sendSms(caller, line, `Call a Trojan: your question is saved. A real Trojan will answer it here: ${waitUrl(code)}`);
    await mergeMeta(o.rowId, { sms: sms.ok ? "sent" : `failed: ${sms.error ?? ""}`.slice(0, 200) });
    return {
      status: "queued",
      question_saved: h.ok,
      spoken_link: spokenLink(code),
      code: code.split("").join(" "),
      texted: sms.ok,
      tell_caller: h.promise ?? "A Trojan usually replies within a couple hours.",
    };
  };

  const runTool = async (callId: string, name: string, argsRaw: string) => {
    const args = (safeJson(argsRaw) ?? {}) as Record<string, unknown>;
    const t0 = Date.now();
    let output: unknown = { error: "tool failed" };
    try {
      if (name === "lookup_usc") {
        if (args.audience) audience = asAudience(args.audience);
        const r = await lookupUsc(o.rowId, args.question, audience);
        output = r.output;
        toolMs.push(Date.now() - t0);
      } else if (name === "transfer_to_trojan") {
        output = await transfer(args);
      } else if (name === "end_call") {
        endReason = "ai_end_call";
        output = { ok: true };
        afterNextLine = async () => {
          await hangupOpenAI(o.openaiCallId).catch(() => {});
        };
        // If the model says nothing more, hang up anyway.
        setTimeout(() => void afterNextLine?.().catch(() => {}), 6000);
      }
    } catch (e) {
      console.error("[voice/sideband] tool", name, e);
    }
    const p = pending.get(callId);
    if (p) p.output = output;
    flush();
  };

  const onEvent = (ev: Ev) => {
    switch (ev.type) {
      case "response.created":
        lastResponseStart = Date.now();
        if (afterNextLine && !armedAfter) armedAfter = String((ev.response as { id?: string })?.id ?? "");
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (String(ev.transcript ?? "").trim()) transcript.push({ role: "student", text: String(ev.transcript).trim(), at: new Date().toISOString() });
        break;
      case "response.output_audio_transcript.done": {
        const t = String(ev.transcript ?? "").trim();
        lastAiWords = t.split(/\s+/).length;
        if (t) transcript.push({ role: "ai", text: t, at: new Date().toISOString() });
        break;
      }
      case "response.function_call_arguments.done":
        pending.set(String(ev.call_id), { resp: String(ev.response_id), output: null });
        void runTool(String(ev.call_id), String(ev.name), String(ev.arguments ?? "{}"));
        break;
      case "response.done": {
        const r = ev.response as { id?: string; status?: string; output?: { type: string }[] };
        doneResponses.add(String(r?.id));
        flush();
        if (afterNextLine && armedAfter && armedAfter === r?.id) {
          const act = afterNextLine;
          afterNextLine = null;
          armedAfter = null;
          setTimeout(() => void act().catch((e) => console.error("[voice/sideband] after-line", e)), speechTail());
        }
        break;
      }
      case "error":
        console.error("[voice/sideband] error event", JSON.stringify(ev.error).slice(0, 300));
        break;
    }
  };

  await new Promise<void>((resolve) => {
    const wrap = setTimeout(() => {
      send({
        type: "response.create",
        response: {
          instructions:
            "We're almost out of time on this call. In one or two sentences, wrap up: offer to connect them with a real Trojan (transfer_to_trojan) or say goodbye and call end_call.",
        },
      });
    }, (PHONE_MAX_SECONDS - 35) * 1000);
    const hard = setTimeout(() => {
      endReason = "time_limit";
      void hangupOpenAI(o.openaiCallId).catch(() => {});
      setTimeout(() => ws.close(), 1500);
    }, PHONE_MAX_SECONDS * 1000);
    const done = () => {
      clearTimeout(wrap);
      clearTimeout(hard);
      resolve();
    };
    ws.onopen = () => {
      send({
        type: "response.create",
        response: { instructions: `Say this first, warmly and naturally, word for word: "${PHONE_GREETING}" Don't call any tools yet.` },
      });
    };
    ws.onmessage = (m) => {
      try {
        onEvent(JSON.parse(String(m.data)));
      } catch (e) {
        console.error("[voice/sideband] event", e);
      }
    };
    ws.onerror = (e) => console.error("[voice/sideband] ws error", (e as unknown as { message?: string })?.message ?? "");
    ws.onclose = (e) => {
      console.log(`[voice/sideband] closed ${e.code} after ${Math.round((Date.now() - started) / 1000)}s`);
      done();
    };
  });

  const fresh = await getCall(o.rowId);
  await updateCall(o.rowId, {
    status: endReason === "transferred" ? "transferred" : "ended",
    ended_at: endReason === "transferred" ? null : new Date().toISOString(),
    duration_s: Math.round((Date.now() - started) / 1000),
    transcript,
    metrics: { ...(fresh?.metrics ?? {}), toolMs, end_reason: endReason },
  });
}
