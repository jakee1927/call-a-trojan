import "server-only";
import { siteUrl } from "@/lib/notify";
import { getCall, mergeMeta, updateCall, type TranscriptLine } from "./calls";
import {
  hangupOpenAI,
  PHONE_GREETING,
  PHONE_MAX_SECONDS,
  redirectCall,
  referCall,
  textCaller,
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

  const ws = await openSideband(o.openaiCallId, key);
  if (!ws) {
    // Without the sideband the AI can't greet, look anything up or transfer: hand the caller to the human fallback.
    console.error("[voice/sideband] could not connect; moving the caller to the human fallback");
    await mergeMeta(o.rowId, { sideband_failed: true });
    const env = twilioEnv();
    if (parentSid && env) {
      const url = `${siteUrl()}/api/voice/inbound/after?stage=noai&t=${encodeURIComponent(ticket)}`;
      await redirectCall(env, parentSid, `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${xmlEscape(url)}</Redirect></Response>`).catch((e) =>
        console.error("[voice/sideband] fallback redirect", e),
      );
    } else await hangupOpenAI(o.openaiCallId).catch(() => {});
    return;
  }
  // Greet the instant the sideband is up: the caller hears the AI introduce itself right after pickup.
  ws.send(
    JSON.stringify({
      type: "response.create",
      response: { instructions: `Say this first, warmly and naturally, word for word: "${PHONE_GREETING}" Don't call any tools yet.` },
    }),
  );
  const send = (e: Record<string, unknown>) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(e));
  };

  // ---------- turn control ----------
  // The session has create_response and interrupt_response off: OpenAI's turn detector only tells us when the
  // caller spoke. We decide when the AI answers, one response at a time, so line noise or the AI's own echo can't
  // cut it off or make it answer twice, and the caller can't interrupt it mid-sentence.

  /** True while the model is producing a response. */
  let responding = false;
  /** A response is needed as soon as the current one finishes (a caller turn, or a rejected tool response). */
  let wantResponse = false;
  let lastCreate: "tool" | "filler" | "turn" | null = null;
  /** When the AI's last line finishes playing on the phone (estimated from its length, or observed). */
  let aiQuietAt = 0;
  let sawBufferEvents = false;
  let bufferPlaying = false;
  const aiSpeaking = () => responding || (sawBufferEvents ? bufferPlaying : Date.now() < aiQuietAt);
  /** The caller turn being heard: did it start over the AI's speech, and how long was it? */
  let speechOverlapped = false;
  let speechStartMs = 0;
  let speechLenMs = 0;
  let speechEndedAt = 0; // wall-clock time the caller actually stopped talking
  const SILENCE_MS = Number(process.env.VOICE_PHONE_SILENCE_MS || 550); // the detector reports the stop this much later
  const dropped = new Set<string>(); // caller items we ignored
  const awaiting = new Map<string, ReturnType<typeof setTimeout>>(); // short turns waiting for their transcript

  const createResponse = (kind: "tool" | "turn") => {
    responding = true;
    wantResponse = false;
    lastCreate = kind;
    send({ type: "response.create" });
  };
  const flush = () => {
    if (responding) return false;
    for (const [id, p] of pending) {
      if (p.output !== null && doneResponses.has(p.resp)) {
        send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: id, output: JSON.stringify(p.output) } });
        pending.delete(id);
        createResponse("tool");
        return true; // one at a time; the next result goes out when this response is done
      }
    }
    return false;
  };
  /** The caller finished a real turn: answer it (after the current response, and not while a lookup is running). */
  const respondToCaller = () => {
    if (pending.size > 0) return; // the answer to the running lookup will take this turn into account
    if (responding) wantResponse = true;
    else createResponse("turn");
  };
  const dropTurn = (itemId: string) => {
    dropped.add(itemId);
    send({ type: "conversation.item.delete", item_id: itemId });
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
    // Nobody on shift: keep the handoff queued and text them the wait-page link (no link read aloud).
    const q = String(args.question ?? "").trim().slice(0, 120);
    const t = await textCaller(
      o.rowId,
      caller,
      line,
      `Call a Trojan here! Your question${q ? ` ("${q}")` : ""} is saved. A real USC student will answer it here: ${waitUrl(code)}`,
    );
    return {
      status: "queued",
      question_saved: h.ok,
      texting_link: t.queued,
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
        // A lookup that has to search USC's sites takes ~10 s: say one more line partway so the line isn't silent.
        const stillChecking = setTimeout(() => {
          if (responding || !pending.has(callId)) return;
          responding = true;
          lastCreate = "filler";
          send({
            type: "response.create",
            response: {
              tool_choice: "none",
              instructions:
                'The lookup is still running. Say exactly one short line like "Still checking USC\'s site, just a few more seconds." Nothing else, and do not answer the question yet.',
            },
          });
        }, 4800);
        try {
          const r = await lookupUsc(o.rowId, args.question, audience);
          output = r.output;
        } finally {
          clearTimeout(stillChecking);
        }
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
        responding = true;
        lastResponseStart = Date.now();
        if (afterNextLine && !armedAfter) armedAfter = String((ev.response as { id?: string })?.id ?? "");
        break;

      // --- the caller's side ---
      case "input_audio_buffer.speech_started":
        speechOverlapped = aiSpeaking();
        speechStartMs = Number(ev.audio_start_ms ?? 0);
        break;
      case "input_audio_buffer.speech_stopped":
        speechLenMs = Math.max(0, Number(ev.audio_end_ms ?? 0) - speechStartMs);
        speechEndedAt = Date.now() - SILENCE_MS;
        break;
      case "input_audio_buffer.committed": {
        const id = String(ev.item_id ?? "");
        // Anything said over the AI's speech is ignored: echo, noise, or the caller talking over it. A turn that
        // started over the AI but kept going well after it finished is the caller's real reply, so it is kept.
        if (speechOverlapped && (aiSpeaking() || speechEndedAt < aiQuietAt + 400)) {
          dropTurn(id);
          break;
        }
        if (speechLenMs >= 1200) respondToCaller();
        // A short blip may be a cough or line noise: wait briefly for its transcript before answering.
        else awaiting.set(id, setTimeout(() => (awaiting.delete(id), respondToCaller()), 1200));
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const id = String(ev.item_id ?? "");
        const text = String(ev.transcript ?? "").trim();
        if (dropped.has(id)) break;
        const waiting = awaiting.get(id);
        if (waiting) {
          clearTimeout(waiting);
          awaiting.delete(id);
          if (/[a-z0-9]/i.test(text)) respondToCaller();
          else dropTurn(id); // no words in it: noise
        }
        if (/[a-z0-9]/i.test(text)) transcript.push({ role: "student", text, at: new Date().toISOString() });
        break;
      }

      // --- the AI's side ---
      case "output_audio_buffer.started":
        sawBufferEvents = true;
        bufferPlaying = true;
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        sawBufferEvents = true;
        bufferPlaying = false;
        aiQuietAt = Date.now();
        break;
      case "response.output_audio_transcript.done": {
        const t = String(ev.transcript ?? "").trim();
        lastAiWords = t.split(/\s+/).length;
        // Audio is generated faster than it plays: estimate when this line ends on the phone (~175 wpm).
        if (!sawBufferEvents) aiQuietAt = Math.max(aiQuietAt, lastResponseStart + 400 + lastAiWords * 340);
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
        responding = false;
        if (!flush() && wantResponse) createResponse(lastCreate === "tool" ? "tool" : "turn");
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
        if (/active_response/.test(JSON.stringify(ev.error ?? ""))) {
          // A response is already in progress: ours goes out when it finishes (the filler line is just skipped).
          responding = true;
          if (lastCreate !== "filler") wantResponse = true;
        } else if (!/item.*(not found|does not exist)|not_found/i.test(JSON.stringify(ev.error ?? ""))) {
          // Any other rejection must not leave us waiting forever.
          setTimeout(() => {
            if (Date.now() - lastResponseStart < 300) return; // a real response just started
            responding = false;
            if (!flush() && wantResponse) createResponse("turn");
          }, 400);
        }
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

/**
 * Connects to a SIP call's sideband. Auth must be the Authorization header: the call_id endpoint rejects the
 * browser-style "openai-insecure-api-key" subprotocol (503). Retries briefly in case the call isn't joinable yet.
 */
async function openSideband(openaiCallId: string, key: string): Promise<WebSocket | null> {
  const url = `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(openaiCallId)}`;
  for (const wait of [0, 300, 700, 1500, 2500]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const ws = await new Promise<WebSocket | null>((resolve) => {
      // Node's built-in WebSocket (undici) accepts { headers } as its second argument.
      const w = new WebSocket(url, { headers: { Authorization: `Bearer ${key}` } } as unknown as string[]);
      const t = setTimeout(() => {
        try {
          w.close();
        } catch {}
        resolve(null);
      }, 5000);
      w.onopen = () => {
        clearTimeout(t);
        resolve(w);
      };
      w.onerror = () => {
        clearTimeout(t);
        resolve(null);
      };
    });
    if (ws) return ws;
    console.error(`[voice/sideband] connect attempt failed (waited ${wait} ms)`);
  }
  return null;
}
