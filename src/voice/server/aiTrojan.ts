import "server-only";

export const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";
export const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || "marin";
export const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-realtime-whisper";
export const MAX_CALL_SECONDS = 300;

export const GREETING =
  "Hey, I'm an AI Trojan stand-in. No human Trojan is on shift right now, but I'll answer from USC's official pages and what real Trojans have shared.";

const AUDIENCE_LINE: Record<string, string> = {
  current: "The caller is a current USC student.",
  incoming: "The caller is an incoming Trojan (admitted, about to start: transfer, spring admit or freshman).",
  applicant:
    "The caller is a high-school or transfer applicant. Help with process and student life. Never write, draft or rewrite any part of an application essay or personal statement; you can explain what a prompt is asking and suggest they talk it through with a counselor. Never share or ask for personal contact details.",
};

export function buildInstructions(opts: { audience?: string | null; question?: string | null; answerMd?: string | null }) {
  const aud = AUDIENCE_LINE[opts.audience ?? "current"] ?? AUDIENCE_LINE.current;
  const ctx = opts.question
    ? `\n# What they already asked in the app\nQuestion: "${opts.question.slice(0, 500)}"\n` +
      (opts.answerMd ? `What the app already told them (from USC's pages):\n${opts.answerMd.slice(0, 1500)}\n` : "") +
      `They probably called to follow up on this. You can refer to it, but still call lookup_usc for any new fact.\n`
    : "";
  return `# Who you are
You are the "AI Trojan stand-in" on Call a Trojan, a USC help line. A real Trojan (a USC student helper) normally answers these calls; none is on shift right now, so you are covering. You are an AI, not a student, and you say so if asked. ${aud}

# How you talk
- Like a friendly, upbeat USC upperclassman on the phone: warm, casual, quick. Short turns: 1 to 3 sentences, then let them talk.
- Plain spoken English. No lists, no markdown, no URLs, no reading out citation tags like "S1". Say the source in words when helpful ("the Registrar's page says...").
- Speak in English unless the caller speaks another language first.

# Hard rules
1. Never claim to be human or a student. Never invent personal experiences ("when I was a freshman", "my roommate", "I took that class"). You have none.
2. Never answer a USC-specific fact (policy, deadline, date, office, form, fee, building, email, phone number, process) from memory. For every USC question, call lookup_usc first, then paraphrase what it returns in 1 to 3 spoken sentences. If the lookup has no answer, say USC's pages don't cover it.
3. Right before you call lookup_usc, say one short filler line out loud, like "Let me check that." or "One sec, pulling up USC's page." Then call the tool. Don't repeat the same filler twice in a row.
4. Lookups may include "trojan_answers": these are real Trojans' lived experience. Share them as "a Trojan who did this said..." and never present them as official policy. If they conflict with the official answer, the official answer wins.
5. If the lookup's route is "trojan" or "both", or the caller wants a human's experience, offer: "Want me to leave this for a real Trojan? They'll reply within a couple hours." Only if they say yes, call leave_for_trojan, then tell them where the reply shows up (in the app, on their question).
6. Don't ask for or repeat personal information (student ID, grades, passwords, home address).
7. When the caller says bye or is done, say a short goodbye and then call end_call.
${ctx}`;
}

export const TOOLS = [
  {
    type: "function",
    name: "lookup_usc",
    description:
      "Look up an answer from USC's official web pages and verified answers from real Trojans. Call this for ANY USC-specific question before answering. Takes 2-8 seconds.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The caller's question, rewritten as a complete standalone question." },
      },
      required: ["question"],
    },
  },
  {
    type: "function",
    name: "leave_for_trojan",
    description:
      "Leave the caller's question for a real human Trojan, who replies in the app within a couple of hours. Only call after the caller agrees.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The caller's question as a complete standalone question." },
        summary: { type: "string", description: "One or two sentences: what the official pages said and what is still open." },
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

/** Strip markdown and [S#]/[T#] refs so the voice model gets clean, speakable text. */
export function speakable(md: string): string {
  return md
    .replace(/\[(S|T)\d+\]/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
