import "server-only";
import crypto from "node:crypto";
import { siteUrl } from "@/lib/notify";
import { db } from "@/lib/supabase-server";
import { REALTIME_MODEL, REALTIME_VOICE, TRANSCRIBE_MODEL } from "./aiTrojan";
import { type CallRow } from "./calls";
import { rest, twilioEnv, validTwilioSignature, xmlEscape, type TwilioEnv } from "./twilio";

/**
 * The public phone line: anyone dials the Twilio number, the AI Trojan answers over OpenAI Realtime SIP,
 * and can transfer the caller to an on-shift Trojan's phone.
 *
 *   caller → Twilio number → /api/voice/inbound → <Dial><Sip> → OpenAI SIP
 *   OpenAI → /api/voice/openai-webhook (realtime.call.incoming) → accept + sideband WebSocket (tools)
 *   transfer → Twilio REST updates the caller's leg → <Dial><Number> helper → /api/voice/inbound/after
 */

/** Phone calls are capped below Vercel's 300 s function limit, which hosts the sideband. */
export const PHONE_MAX_SECONDS = Number(process.env.VOICE_PHONE_MAX_SECONDS || 270);

export function phoneAiEnabled() {
  return !!(process.env.OPENAI_API_KEY && process.env.OPENAI_PROJECT_ID && process.env.VOICE_PHONE_AI !== "0");
}

export function sipUri(code: string) {
  const custom = process.env.OPENAI_SIP_URI; // full override, e.g. with ;secure=true
  const base = custom || `sip:${process.env.OPENAI_PROJECT_ID}@sip.api.openai.com;transport=tls`;
  // X- headers ride along as SIP headers; the webhook uses X-CT-Code to find this call.
  return `${base}?X-CT-Code=${encodeURIComponent(code)}`;
}

// ---------- OpenAI call control (Realtime SIP) ----------

async function oai(path: string, body?: unknown) {
  const res = await fetch(`https://api.openai.com/v1/realtime/calls/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`openai ${path}: ${res.status} ${text.slice(0, 300)}`);
  return text;
}
export const acceptCall = (callId: string, session: unknown) => oai(`${encodeURIComponent(callId)}/accept`, session);
export const rejectCall = (callId: string, status_code = 486) => oai(`${encodeURIComponent(callId)}/reject`, { status_code });
export const hangupOpenAI = (callId: string) => oai(`${encodeURIComponent(callId)}/hangup`);
export const referCall = (callId: string, targetUri: string) => oai(`${encodeURIComponent(callId)}/refer`, { target_uri: targetUri });

/** Standard Webhooks signature check (OpenAI webhooks). Secret looks like "whsec_<base64>". */
export function verifyOpenAIWebhook(raw: string, h: Headers): boolean {
  const secret = process.env.OPENAI_WEBHOOK_SECRET ?? "";
  const id = h.get("webhook-id");
  const ts = h.get("webhook-timestamp");
  const sigs = h.get("webhook-signature");
  if (!secret || !id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const want = crypto.createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest("base64");
  return sigs.split(" ").some((s) => {
    const v = s.split(",")[1] ?? "";
    return v.length === want.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(want));
  });
}

/** "sip:+12135550100@x" / "<sip:+12135550100@x>;tag=1" / "+12135550100" → "+12135550100" */
export function numberFromSip(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = v.match(/(?:sips?:|tel:)?(\+?\d{7,15})(?=[@;>]|$)/);
  if (!m) return null;
  const d = m[1];
  return d.startsWith("+") ? d : d.length === 10 ? `+1${d}` : `+${d}`;
}

// ---------- wait codes (spoken + texted) ----------

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L: easy to say and type
export const CODE_RE = /^[2-9A-HJ-KM-NP-Z]{4}$/;

export async function newWaitCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = Array.from(crypto.randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join("");
    try {
      const { data } = await db().from("calls").select("id").eq("room", `w_${code}`).limit(1);
      if (!data?.length) return code;
    } catch {
      return code;
    }
  }
  return Array.from(crypto.randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function waitUrl(code: string) {
  return `${siteUrl()}/call/${code}`;
}
/** How the link sounds: "call-a-trojan dot vercel dot app, slash call, slash 4, K, 7, Q". */
export function spokenLink(code: string) {
  const host = siteUrl()
    .replace(/^https?:\/\//, "")
    .replace(/\./g, " dot ");
  return `${host}, slash call, slash ${code.split("").join(", ")}`;
}

export async function findCallByCode(code: string): Promise<CallRow | null> {
  if (!CODE_RE.test(code)) return null;
  try {
    const { data } = await db().from("calls").select("*").eq("room", `w_${code}`).order("started_at", { ascending: false }).limit(1);
    return (data?.[0] as CallRow) ?? null;
  } catch {
    return null;
  }
}

/** Twilio's <Dial><Sip> leg: match by our X-CT-Code header, else by caller number in the last 2 minutes. */
export async function findPhoneCall(code: string | null, caller: string | null): Promise<CallRow | null> {
  if (code) {
    const row = await findCallByCode(code.toUpperCase());
    if (row) return row;
  }
  if (!caller) return null;
  try {
    const since = new Date(Date.now() - 120_000).toISOString();
    const { data } = await db()
      .from("calls")
      .select("*")
      .eq("transport", "phone")
      .gt("started_at", since)
      .eq("meta->>caller", caller)
      .order("started_at", { ascending: false })
      .limit(1);
    return (data?.[0] as CallRow) ?? null;
  } catch {
    return null;
  }
}

// ---------- Twilio helpers for the phone line ----------

export async function redirectCall(env: TwilioEnv, sid: string, twiml: string) {
  await rest(env, `/Calls/${encodeURIComponent(sid)}.json`, { Twiml: twiml });
}

/** SMS is best-effort: unregistered 10DLC traffic is usually blocked, so the spoken link is the real path. */
export async function sendSms(to: string | null, from: string | null, body: string): Promise<{ ok: boolean; error?: string }> {
  const env = twilioEnv();
  const sender = from || env?.from;
  if (!env || !to || !sender || process.env.VOICE_SMS === "0") return { ok: false, error: "not configured" };
  try {
    await rest(env, "/Messages.json", { To: to, From: sender, Body: body });
    return { ok: true };
  } catch (e) {
    console.error("[voice/sms]", String(e).slice(0, 300));
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

export function twiml(inner: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { "Content-Type": "text/xml" } });
}
export const say = (s: string) => `<Say voice="Polly.Joanna-Neural">${xmlEscape(s)}</Say>`;

/** Validate a Twilio webhook (raw form body) against the URLs Twilio may have signed. */
export function twilioRequestOk(req: Request, params: Record<string, string>) {
  if (process.env.TWILIO_SKIP_SIGNATURE === "1") return true;
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const path = `${u.pathname}${u.search}`;
  const candidates = Array.from(new Set([req.url, `${proto}://${host}${path}`, `https://${host}${path}`, `${siteUrl()}${path}`]));
  const ok = validTwilioSignature(process.env.TWILIO_AUTH_TOKEN ?? "", req.headers.get("x-twilio-signature"), candidates, params);
  if (!ok) console.error("[voice/phone] bad Twilio signature", { path: u.pathname });
  return ok;
}

// ---------- the phone persona ----------

export function phoneInstructions() {
  return `# Who you are
You are the "AI Trojan" answering the Call a Trojan phone line, a free USC help line run by USC students. Callers can be current students, admitted students, applicants, transfer students or parents. You answer first and triage. You are an AI, not a student, and you say so if asked. Real Trojans (USC student helpers) take over when you can't help.

# How you talk
- Like a friendly, upbeat USC upperclassman on the phone: warm, casual, quick. Short turns: 1 to 3 sentences, then let them talk.
- Plain spoken English. No lists, no markdown, no reading out citation tags like "S1". Say the source in words when helpful ("the Registrar's page says...").
- If you don't know who the caller is (student, admitted, applicant, parent) and it matters for the answer, ask once, briefly.

# Hard rules
1. Never claim to be human or a student. Never invent personal experiences. You have none.
2. Never answer a USC-specific fact (policy, deadline, date, office, form, fee, building, email, phone number, process) from memory. For every USC question, call lookup_usc first, then paraphrase what it returns in 1 to 3 spoken sentences. If the lookup has no answer, say USC's pages don't cover it.
3. Right before you call lookup_usc, say one short filler line out loud, like "Let me check that." or "One sec, pulling up USC's page." Then call the tool.
4. Lookups may include "trojan_answers": real Trojans' lived experience. Share them as "a Trojan who did this said..." and never as official policy. The official answer wins if they conflict.
5. Transfer to a real Trojan when: the lookup's route is "trojan" or "both" and they want more, the caller asks for a person, the question is about lived experience (what's it really like, which professor, is it worth it), or you can't help. Ask first: "Want me to connect you with a real Trojan?" If yes, call transfer_to_trojan.
   - If it returns status "connecting": say exactly one short line like "Connecting you to <first name>, a real Trojan, now. Hang on!" and then stop talking.
   - If it returns status "queued": tell them no Trojan is free right now, their question is saved, and a Trojan will answer at the link. Read the spoken_link slowly, then say the code again. Mention we also tried to text it to them. Then ask if there's anything else.
6. Applicants: help with process and student life. Never write, draft or rewrite any part of an application essay; you can explain what a prompt is asking.
7. Don't ask for or repeat personal information (student ID, grades, passwords, home address). Their phone number is only used to text them the link.
8. When the caller says bye or is done, say a short goodbye and then call end_call.
`;
}

export const PHONE_GREETING =
  "Hey, you've reached Call a Trojan! I'm the AI Trojan: I'm an AI, not a real student. I answer from USC's official pages, and I can connect you with a real Trojan. What's your question?";

export const PHONE_TOOLS = [
  {
    type: "function",
    name: "lookup_usc",
    description:
      "Look up an answer from USC's official web pages and verified answers from real Trojans. Call this for ANY USC-specific question before answering. Takes 3-6 seconds.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The caller's question, rewritten as a complete standalone question." },
        audience: {
          type: "string",
          enum: ["current", "incoming", "applicant"],
          description: "current = enrolled student; incoming = admitted, about to start; applicant = applying (parents of applicants count as applicant).",
        },
      },
      required: ["question"],
    },
  },
  {
    type: "function",
    name: "transfer_to_trojan",
    description:
      "Connect the caller with a real human Trojan. Saves their question for a Trojan, then rings an on-shift Trojan's phone, or queues it with a link if nobody is on shift. Only call after the caller agrees.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The caller's question as a complete standalone question." },
        summary: { type: "string", description: "One or two sentences: what the official pages said and what is still open." },
        audience: { type: "string", enum: ["current", "incoming", "applicant"] },
      },
      required: ["question"],
    },
  },
  {
    type: "function",
    name: "end_call",
    description: "Hang up after you have said goodbye.",
    parameters: { type: "object", properties: {} },
  },
];

export function phoneSession() {
  return {
    type: "realtime",
    model: REALTIME_MODEL,
    instructions: phoneInstructions(),
    output_modalities: ["audio"],
    max_output_tokens: 1200,
    reasoning: { effort: process.env.OPENAI_REALTIME_EFFORT || "low" },
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: { model: TRANSCRIBE_MODEL, language: "en" },
        turn_detection: { type: "semantic_vad", eagerness: "high" },
      },
      output: { voice: REALTIME_VOICE },
    },
    tools: PHONE_TOOLS,
    tool_choice: "auto",
  };
}
