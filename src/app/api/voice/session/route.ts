import { buildInstructions, MAX_CALL_SECONDS, REALTIME_MODEL, REALTIME_VOICE, TOOLS, TRANSCRIBE_MODEL } from "@/voice/server/aiTrojan";
import { insertCall } from "@/voice/server/calls";
import { loadContext, signTicket } from "@/voice/server/pick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUDIENCES = ["current", "incoming", "applicant"];

/**
 * Mints a short-lived OpenAI Realtime client secret for the AI Trojan stand-in.
 * The real OPENAI_API_KEY stays on the server; the browser only gets `ek_...` (valid ~2 minutes to start a call).
 */
export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: "no_key", message: "The AI Trojan isn't configured yet (OPENAI_API_KEY)." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const ctx = await loadContext(body.questionId, body.handoffId);
  const audience = AUDIENCES.includes(body.audience) ? body.audience : ctx.audience ?? "current";
  const question = ctx.question ?? (typeof body.prefill === "string" ? body.prefill.slice(0, 500) : null);

  const session = (transcribeModel: string | null) => ({
    type: "realtime",
    model: REALTIME_MODEL,
    instructions: buildInstructions({ audience, question, answerMd: ctx.answerMd }),
    output_modalities: ["audio"],
    max_output_tokens: 1200,
    reasoning: { effort: process.env.OPENAI_REALTIME_EFFORT || "low" },
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: transcribeModel ? { model: transcribeModel, language: "en", prompt: "USC, Trojan, D-clearance, OASIS, Web Registration, SMC, transfer, Viterbi, Marshall, Dornsife, Annenberg" } : null,
        turn_detection:
          process.env.OPENAI_REALTIME_VAD === "server"
            ? { type: "server_vad", threshold: 0.6, prefix_padding_ms: 300, silence_duration_ms: 450 }
            : { type: "semantic_vad", eagerness: "high" },
      },
      output: { voice: REALTIME_VOICE },
    },
    tools: TOOLS,
    tool_choice: "auto",
  });

  const mint = (transcribeModel: string | null) =>
    fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 120 }, session: session(transcribeModel) }),
      cache: "no-store",
    });

  let res = await mint(TRANSCRIBE_MODEL);
  if (!res.ok) {
    const first = await res.text();
    console.error("[voice/session] mint failed", res.status, first.slice(0, 400));
    // A wrong transcription model name shouldn't kill the call: retry with a long-standing one, then none.
    res = await mint("whisper-1");
    if (!res.ok) res = await mint(null);
  }
  if (!res.ok) {
    const t = await res.text();
    console.error("[voice/session] mint failed again", res.status, t.slice(0, 400));
    return Response.json({ error: "mint_failed", message: "Couldn't start the AI Trojan." }, { status: 502 });
  }
  const json = (await res.json()) as { value?: string; expires_at?: number; client_secret?: { value?: string } };
  const secret = json.value ?? json.client_secret?.value;
  if (!secret) return Response.json({ error: "mint_failed" }, { status: 502 });

  const callId = await insertCall({
    mode: "ai",
    transport: "openai-webrtc",
    status: "connecting",
    audience,
    prompt: question,
    question_id: ctx.questionId,
    handoff_id: typeof body.handoffId === "string" ? body.handoffId : null,
    meta: { model: REALTIME_MODEL, voice: REALTIME_VOICE },
  });

  return Response.json({
    client_secret: secret,
    expires_at: json.expires_at ?? null,
    model: REALTIME_MODEL,
    call_id: callId,
    ticket: signTicket({ call_id: callId, mode: "ai", audience }),
    max_seconds: MAX_CALL_SECONDS,
    question,
  });
}
