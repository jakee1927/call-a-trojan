import "server-only";
import { z } from "zod";
import { generateObject, generateText } from "./llm";
import type { Audience, Briefing, QADraft } from "./types";

const BriefingSchema = z.object({
  title: z.string().describe("6-10 word headline of what the student needs"),
  asked: z
    .string()
    .describe("One or two sentences: what the student asked, de-identified"),
  ai_said: z
    .string()
    .describe(
      "One or two sentences: what the AI already answered from official USC pages",
    ),
  still_open: z
    .string()
    .describe("What a Trojan still needs to answer: the lived, practical part"),
  tags: z.array(z.string()).describe("2-4 short kebab-case topic tags"),
});

export async function writeBriefing(args: {
  question: string;
  audience: Audience;
  aiAnswer: string | null;
  route: string | null;
  studentNote?: string | null;
  hasImage?: boolean;
}): Promise<Briefing> {
  const fallback: Briefing = {
    title: args.question.slice(0, 80),
    asked: args.question,
    ai_said: args.aiAnswer ? args.aiAnswer.slice(0, 300) : "No AI answer yet.",
    still_open: "The student wants a Trojan's take.",
    tags: [],
    audience: args.audience,
  };
  try {
    const p = await generateObject(
      {
        route: "briefing",
        effort: "medium",
        maxTokens: 4000,
        system:
          "You write briefing cards for USC student helpers ('Trojans') who are about to answer another student's question. " +
          "Be concrete and short; a helper should get it in 10 seconds on a phone. Remove names, emails, phone numbers and IDs. " +
          "Never invent facts beyond what's given.",
        user:
          `Audience: ${args.audience} student\n` +
          `Question: ${args.question}\n` +
          (args.studentNote
            ? `Extra note from the student: ${args.studentNote}\n`
            : "") +
          (args.hasImage ? `The student attached a screenshot.\n` : "") +
          `AI route: ${args.route ?? "unknown"}\n` +
          `What the AI answered from USC's pages:\n${args.aiAnswer ?? "(nothing)"}`,
      },
      BriefingSchema,
      "briefing",
    );
    if (!p) return fallback;
    return { ...p, audience: args.audience };
  } catch (e) {
    console.error("[briefing]", e);
    return fallback;
  }
}

const DraftSchema = z.object({
  question: z
    .string()
    .describe(
      "The general question, reworded so any student could have asked it; no names or personal details",
    ),
  answer: z
    .string()
    .describe(
      "The helper's answer as reusable advice in the helper's voice, 2-6 sentences, no names/contact info/grades",
    ),
  topics: z.array(z.string()).describe("2-4 short kebab-case topic tags"),
});

export async function draftQA(args: {
  question: string;
  briefing: Briefing | null;
  transcript: { sender: string; body: string }[];
}): Promise<QADraft> {
  const convo = args.transcript
    .map(
      (m) =>
        `${m.sender === "helper" ? "TROJAN" : m.sender.toUpperCase()}: ${m.body}`,
    )
    .join("\n");
  try {
    const p = await generateObject(
      {
        route: "draft",
        effort: "medium",
        maxTokens: 4000,
        system:
          "You turn a finished chat between a student and a USC student helper ('Trojan') into one de-identified, reusable Q&A " +
          "for a verified-answer bank. Keep only what the Trojan actually said (their lived experience and tips); don't add facts. " +
          "Strip names, emails, phone numbers, student IDs, grades and anything that identifies either person. " +
          "If the Trojan didn't really answer, write the best faithful summary of what they did say.",
        user: `Original question: ${args.question}\n\nBriefing: ${args.briefing ? JSON.stringify(args.briefing) : "(none)"}\n\nChat:\n${convo || "(no messages)"}`,
      },
      DraftSchema,
      "qa_draft",
    );
    if (p) return p;
  } catch (e) {
    console.error("[draft]", e);
  }
  const helperLines = args.transcript
    .filter((m) => m.sender === "helper")
    .map((m) => m.body);
  return {
    question: args.question,
    answer: helperLines.join(" ").slice(0, 800),
    topics: [],
  };
}

export async function gapReport(
  rows: {
    question: string;
    route: string | null;
    topics: string[];
    audience: string;
    status: string;
  }[],
): Promise<string> {
  const { text } = await generateText({
    route: "gap_report",
    effort: "medium",
    maxTokens: 6000,
    system:
      "You write a short report for USC Undergraduate Student Government titled \"Questions USC's websites can't answer\". " +
      "Input is a log of questions students asked that our AI had to hand to a real student helper because official USC pages " +
      "didn't cover them. Group them into 3-6 themes. For each theme: a bold one-line theme name, how many questions, one or two " +
      "representative (paraphrased, de-identified) questions, and one concrete recommendation for which USC office or page should " +
      "fix the gap. End with a one-sentence takeaway. Markdown, under 350 words. Don't invent counts beyond the log.",
    user: JSON.stringify(rows),
  });
  return text.trim();
}

const ShowMeSchema = z.object({
  what_is_this: z
    .string()
    .describe("One sentence: which USC page/app this screenshot shows"),
  answer: z
    .string()
    .describe(
      "One or two sentences answering the student's question in plain words",
    ),
  steps: z
    .array(
      z.object({
        n: z.number(),
        text: z
          .string()
          .describe(
            "Imperative step, under 18 words, naming the exact on-screen label",
          ),
        box: z
          .object({
            x: z.number(),
            y: z.number(),
            w: z.number(),
            h: z.number(),
          })
          .nullable()
          .describe(
            "Normalized 0-1 box (x,y = top-left) around the element to click for this step, or null if not visible",
          ),
      }),
    )
    .describe("1-6 numbered steps"),
  needs_trojan: z
    .boolean()
    .describe(
      "True if the screenshot/question needs a human Trojan's judgment",
    ),
  sensitive_warning: z
    .string()
    .nullable()
    .describe(
      "If the image shows grades, IDs, or other personal info, a short warning; else null",
    ),
});
export type ShowMeResult = z.infer<typeof ShowMeSchema>;

export async function showMe(args: {
  question: string;
  imageBase64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  width?: number;
  height?: number;
}): Promise<ShowMeResult | null> {
  const user =
    `Student's question about this screenshot: ${args.question || "What do I do here?"}\n` +
    (args.width && args.height
      ? `Image size: ${args.width}x${args.height} pixels.\n`
      : "") +
    "Give numbered steps. For each step, return a tight normalized bounding box (0-1 fractions of image width/height, x,y = top-left corner) " +
    "around the exact button, link or field to use. Be precise: the box is drawn over the image.";
  try {
    return await generateObject(
      {
        route: "showme",
        effort: "medium",
        maxTokens: 6000,
        user,
        image: { base64: args.imageBase64, mediaType: args.mediaType },
        system:
          "You help USC students navigate USC websites and apps (myUSC, Web Registration, OASIS/STARS, Brightspace, Workday, etc.) from a screenshot. " +
          "Only describe what is visible; never guess at policies. Don't repeat personal information from the image.",
      },
      ShowMeSchema,
      "show_me",
    );
  } catch (e) {
    console.error("[showme]", e);
    return null;
  }
}
