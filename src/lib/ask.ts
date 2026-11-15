import "server-only";
import { generateText, streamText, type LlmRequest } from "./llm";
import { PAGES, SOURCES, USG } from "./corpus";
import { db } from "./supabase-server";
import type {
  AskHeader,
  AskTextResult,
  Audience,
  MatchedHelper,
  Route,
  UsedAnswer,
} from "./types";

export type AskInput = {
  question: string;
  audience: Audience;
  orgSlug?: string | null;
  askerName?: string | null;
  mode?: "type" | "showme" | "call" | "voice";
  /** set to false for callers (voice tool) that don't want a questions row */
  persist?: boolean;
};

// ---------- Cached block: instructions + every official page (stable across requests) ----------

const INSTRUCTIONS = `You are the answer engine of "Call a Trojan", a USC (University of Southern California) help desk.
USC's websites say what the policy is. Real Trojans (USC student helpers) know how it actually works. Your job:
answer from the official USC pages below, and when they aren't enough, say so plainly and hand the student to a Trojan.

How to decide the route:
- "ai": the official sources fully answer the question. Answer it with [S#] citations.
- "both": the sources answer part of it (the policy, the dates, the form), but the student also needs lived know-how
  (who to email, how long it really takes, what to say, which option people pick). Answer the official part, then
  name exactly what a Trojan can add.
- "trojan": the sources don't cover it, or it's about experience, opinion or judgment (which professor, is it worth it,
  what's it actually like). Say briefly what USC's pages do and don't say, and that a Trojan will answer.
- If the question is unrelated to USC student life, answer briefly, route "ai", confidence low.

Confidence is 0 to 1: how sure you are the official sources answer the question correctly and completely.

Hard rules:
- Every official fact carries an [S#] citation that points to a source below. Never invent policies, dates, deadlines,
  fees, emails or phone numbers. If it isn't in the sources, say you don't see it in USC's pages.
- Verified Trojan answers ([T#], given after the sources) are lived experience, never official policy. A Trojan answer
  never overrides an official fact; if they conflict, the official source wins and you say so.
- Only list a [T#] in used_answers if it genuinely answers this question (paraphrases count; different topics don't).
- Pick helpers from the roster whose tags, major or year make them a good match, max 3, best first, each with a short
  concrete "why" (under 12 words, e.g. "Transferred from SMC; did D-clearance for POIR"). Pick helpers whenever the
  route is "trojan" or "both"; otherwise an empty list is fine.
- When official sources contradict each other (different dates, numbers, emails, rooms), don't pick one: say plainly
  that USC's pages disagree, cite both sides ([S#] each), and use route "both" so a Trojan can confirm what's current.
- Don't ask for or repeat personal information (student IDs, grades, passwords).

Output format, exactly:
Line 1: one single-line JSON object and nothing else (no code fence):
{"route":"ai|trojan|both","confidence":0.0,"topics":["short-kebab-topic"],"helper_tags":["tag"],"used_answers":["T1"],"helpers":[{"ref":"H1","why":"..."}]}
Then a blank line, then the answer in Markdown for the "USC says" lane:
- Lead with the direct answer in one or two sentences. Then short bullets or numbered steps if useful.
- Cite as [S1], [S2] right after the fact. Do not write URLs; the app links the refs.
- Keep it under about 180 words. No headings bigger than bold text. No sign-off.
- Don't restate Trojan answers in this lane (the app shows them in their own lane). You may end with one sentence like
  "A Trojan can tell you how long it actually takes." when the route is "both" or "trojan".`;

function renderSources(): string {
  return PAGES.map(
    (p, i) =>
      `<source ref="S${i + 1}" title="${p.title.replace(/"/g, "'")}" url="${p.url}" audiences="${p.audiences.join(",")}">\n${p.text}\n</source>`,
  ).join("\n\n");
}

let CACHED_SYSTEM: string | null = null;
function cachedSystem(): string {
  if (!CACHED_SYSTEM) {
    CACHED_SYSTEM = `${INSTRUCTIONS}\n\n<official_sources count="${PAGES.length}">\n${renderSources()}\n</official_sources>`;
  }
  return CACHED_SYSTEM;
}

// ---------- Per-request block: persona, org info, verified answers, helper roster ----------

const PERSONAS: Record<Audience, string> = {
  current: `The asker is a current USC student. Be direct and practical, like a sharp upperclassman.`,
  incoming: `The asker is an incoming Trojan (admitted transfer, spring admit or admitted freshman) who hasn't started yet
and may not know USC vocabulary (D-clearance, OASIS/STARS, myUSC, Trojan Check). Define USC jargon in a few words the
first time you use it. Prefer orientation, transfer and registration sources.`,
  applicant: `The asker is a prospective applicant (often a high-school student, possibly first-gen) who isn't at USC yet.
Be warm and plain-spoken. Answer from admissions and student-life sources. Trojans who answer applicants are student
ambassadors who reply asynchronously. Never write, edit or ghostwrite essays or application answers (coach instead:
what to think about). Never share or ask for personal contact details, social handles or phone numbers.`,
};

type VerifiedRow = {
  id: string;
  question: string;
  answer: string;
  helper_name: string | null;
  helper_major: string | null;
  helper_year: string | null;
  audience: string;
  topics: string[];
  approved_at: string;
  is_sample: boolean;
};
type HelperRow = {
  id: string;
  name: string;
  year: string | null;
  major: string | null;
  tags: string[];
  bio: string | null;
  avatar_url: string | null;
  online: boolean;
  is_demo: boolean;
  is_ai: boolean;
  org_slug: string | null;
};

async function loadContext() {
  const supa = db();
  const [va, hp] = await Promise.all([
    supa
      .from("verified_answers")
      .select(
        "id,question,answer,helper_name,helper_major,helper_year,audience,topics,approved_at,is_sample",
      )
      .gt("expires_at", new Date().toISOString())
      .order("approved_at", { ascending: true })
      .limit(300),
    supa
      .from("public_helpers")
      .select(
        "id,name,year,major,tags,bio,avatar_url,online,is_demo,is_ai,org_slug",
      )
      .eq("is_ai", false)
      .limit(80),
  ]);
  if (va.error) console.error("[ask] verified_answers", va.error.message);
  if (hp.error) console.error("[ask] helpers", hp.error.message);
  return {
    verified: (va.data ?? []) as VerifiedRow[],
    helpers: (hp.data ?? []) as HelperRow[],
  };
}

function monthYear(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

function renderDynamic(
  input: AskInput,
  verified: VerifiedRow[],
  helpers: HelperRow[],
): string {
  const parts: string[] = [];
  const now = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "full",
  });
  parts.push(`Today is ${now} (Pacific).`);
  parts.push(
    `<persona audience="${input.audience}">\n${PERSONAS[input.audience]}\n</persona>`,
  );
  if (input.orgSlug === "usg" && USG) {
    parts.push(
      `<org slug="usg" name="${USG.name}">\nThe student is asking at the USG front desk. Prefer USG context below (cite the matching [S#] when a source covers it).\n${USG.info_md}\n</org>`,
    );
  }
  if (verified.length) {
    parts.push(
      `<verified_trojan_answers note="lived experience approved by a Trojan; not official policy">\n` +
        verified
          .map(
            (v, i) =>
              `<answer ref="T${i + 1}" audience="${v.audience}" topics="${(v.topics ?? []).join(",")}">\nQ: ${v.question}\nA: ${v.answer}\n</answer>`,
          )
          .join("\n") +
        `\n</verified_trojan_answers>`,
    );
  } else {
    parts.push(`<verified_trojan_answers>(none yet)</verified_trojan_answers>`);
  }
  if (helpers.length) {
    parts.push(
      `<helper_roster>\n` +
        helpers
          .map(
            (h, i) =>
              `H${i + 1}: ${h.name}${h.year ? `, ${h.year}` : ""}${h.major ? `, ${h.major}` : ""}; tags: ${(h.tags ?? []).join(", ") || "none"}${h.bio ? `; ${h.bio}` : ""}${h.online ? " (on shift now)" : ""}`,
          )
          .join("\n") +
        `\n</helper_roster>`,
    );
  } else {
    parts.push(
      `<helper_roster>(no helpers yet; return an empty helpers list)</helper_roster>`,
    );
  }
  return parts.join("\n\n");
}

function buildRequest(
  route: string,
  input: AskInput,
  verified: VerifiedRow[],
  helpers: HelperRow[],
): LlmRequest {
  return {
    route,
    system: cachedSystem(), // identical bytes every request: instructions + whole corpus
    context: renderDynamic(input, verified, helpers),
    user: `Question: ${input.question.trim()}`,
    effort: "low",
    maxTokens: 8000,
  };
}

// ---------- Header parsing ----------

type ModelHeader = {
  route?: string;
  confidence?: number;
  topics?: string[];
  helper_tags?: string[];
  used_answers?: string[];
  helpers?: { ref?: string; id?: string; why?: string }[];
};

/** Find the header line. Returns [header, restOfText] or null if not complete yet. */
function splitHeader(buf: string): [ModelHeader | null, string] | null {
  const trimmed = buf.replace(/^\s*```(?:json)?\s*/, "");
  if (!trimmed.trimStart().startsWith("{")) {
    // Model skipped the header: treat everything as markdown once we have some text.
    return trimmed.trim().length > 40 ? [null, buf] : null;
  }
  let from = 0;
  while (true) {
    const nl = trimmed.indexOf("\n", from);
    if (nl < 0) return null;
    const line = trimmed.slice(0, nl).trim();
    try {
      const h = JSON.parse(line) as ModelHeader;
      const rest = trimmed.slice(nl + 1).replace(/^\s*```\s*\n?/, "");
      return [h, rest.replace(/^\s+/, "")];
    } catch {
      if (nl > 4000) return [null, buf];
      from = nl + 1;
    }
  }
}

function enrich(
  h: ModelHeader | null,
  verified: VerifiedRow[],
  helpers: HelperRow[],
  questionId: string,
): AskHeader {
  const route: Route =
    h?.route === "trojan" || h?.route === "both" ? h.route : "ai";
  const used: UsedAnswer[] = [];
  for (const ref of h?.used_answers ?? []) {
    const idx = Number(String(ref).replace(/\D/g, "")) - 1;
    const v = verified[idx];
    if (v && !used.some((u) => u.id === v.id)) {
      used.push({
        ref: `T${idx + 1}`,
        id: v.id,
        helper_name: v.helper_name ?? "A Trojan",
        helper_major: v.helper_major,
        helper_year: v.helper_year,
        question: v.question,
        answer: v.answer,
        approved_at: v.approved_at,
        is_sample: v.is_sample,
      });
    }
  }
  const matched: MatchedHelper[] = [];
  for (const m of h?.helpers ?? []) {
    const idx = Number(String(m.ref ?? "").replace(/\D/g, "")) - 1;
    const hr = helpers[idx] ?? helpers.find((x) => x.id === m.id);
    if (hr && !matched.some((x) => x.id === hr.id) && matched.length < 3) {
      matched.push({
        id: hr.id,
        name: hr.name,
        why: m.why ?? "",
        year: hr.year,
        major: hr.major,
        tags: hr.tags,
        avatar_url: hr.avatar_url,
        online: hr.online,
        is_demo: hr.is_demo,
      });
    }
  }
  // If the model wants a Trojan but picked nobody, fall back to tag overlap.
  if (
    (route === "trojan" || route === "both") &&
    matched.length === 0 &&
    helpers.length
  ) {
    const want = new Set(
      [...(h?.helper_tags ?? []), ...(h?.topics ?? [])].map((t) =>
        t.toLowerCase(),
      ),
    );
    const scored = helpers
      .map((x) => ({
        x,
        s:
          (x.tags ?? []).filter((t) => want.has(t.toLowerCase())).length +
          (x.online ? 0.5 : 0),
      }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 2);
    for (const { x } of scored)
      matched.push({
        id: x.id,
        name: x.name,
        why: (x.tags ?? []).slice(0, 3).join(" · "),
        year: x.year,
        major: x.major,
        tags: x.tags,
        avatar_url: x.avatar_url,
        online: x.online,
        is_demo: x.is_demo,
      });
  }
  return {
    route,
    confidence:
      typeof h?.confidence === "number"
        ? Math.max(0, Math.min(1, h.confidence))
        : 0.5,
    topics: (h?.topics ?? []).slice(0, 6),
    helper_tags: (h?.helper_tags ?? []).slice(0, 6),
    used_answers: used,
    helpers: matched,
    sources: SOURCES,
    question_id: questionId,
  };
}

async function createQuestion(input: AskInput): Promise<string> {
  if (input.persist === false) return "";
  const { data, error } = await db()
    .from("questions")
    .insert({
      text: input.question.trim().slice(0, 2000),
      audience: input.audience,
      org_slug: input.orgSlug ?? null,
      asker_name: input.askerName?.slice(0, 60) ?? null,
      mode: input.mode ?? "type",
      status: "answering",
    })
    .select("id")
    .single();
  if (error) {
    console.error("[ask] question insert", error.message);
    return "";
  }
  return data.id as string;
}

async function finish(questionId: string, header: AskHeader, markdown: string) {
  const supa = db();
  if (questionId) {
    const { error } = await supa
      .from("questions")
      .update({
        route: header.route,
        confidence: header.confidence,
        topics: header.topics,
        header: { ...header, sources: undefined },
        answer_md: markdown,
        status: header.route === "ai" ? "answered" : "needs_trojan",
      })
      .eq("id", questionId);
    if (error) console.error("[ask] question update", error.message);
  }
  for (const u of header.used_answers) {
    const { data } = await supa
      .from("verified_answers")
      .select("uses")
      .eq("id", u.id)
      .single();
    if (data)
      await supa
        .from("verified_answers")
        .update({ uses: (data.uses ?? 0) + 1 })
        .eq("id", u.id);
  }
}

// ---------- Public entry points ----------

/** Streams: line 1 = JSON header (AskHeader), then Markdown text. */
export function streamAsk(input: AskInput): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const t0 = Date.now();
      try {
        const [{ verified, helpers }, questionId] = await Promise.all([
          loadContext(),
          createQuestion(input),
        ]);
        const stream = streamText(
          buildRequest("ask", input, verified, helpers),
        );
        let buf = "";
        let header: AskHeader | null = null;
        let markdown = "";
        for await (const delta of stream.deltas) {
          if (header) {
            markdown += delta;
            controller.enqueue(enc.encode(delta));
            continue;
          }
          buf += delta;
          const split = splitHeader(buf);
          if (split) {
            header = enrich(split[0], verified, helpers, questionId);
            controller.enqueue(enc.encode(JSON.stringify(header) + "\n"));
            markdown = split[1];
            if (markdown) controller.enqueue(enc.encode(markdown));
          }
        }
        const { refused } = await stream.done();
        if (!header) {
          // Stream ended before a header was found.
          const split = splitHeader(buf + "\n");
          header = enrich(split?.[0] ?? null, verified, helpers, questionId);
          markdown = split?.[1] ?? buf;
          controller.enqueue(
            enc.encode(JSON.stringify(header) + "\n" + markdown),
          );
        }
        if (refused) {
          const note =
            "\n\nI can't help with that one here. Try asking a Trojan instead.";
          markdown += note;
          controller.enqueue(enc.encode(note));
        }
        controller.close();
        console.log(`[ask] ${header.route} in ${Date.now() - t0}ms`);
        await finish(questionId, header, markdown);
      } catch (e) {
        console.error("[ask] stream error", e);
        try {
          controller.enqueue(
            enc.encode(
              JSON.stringify({
                error: "Our AI is having a moment. You can still ask a Trojan.",
              }) + "\n",
            ),
          );
          controller.close();
        } catch {}
      }
    },
  });
}

/** Non-streaming variant (POST /api/ask/text). Shape is a contract with the voice session. */
export async function askText(input: AskInput): Promise<AskTextResult> {
  const t0 = Date.now();
  const [{ verified, helpers }, questionId] = await Promise.all([
    loadContext(),
    createQuestion(input),
  ]);
  const { text } = await generateText(
    buildRequest("ask_text", input, verified, helpers),
  );
  const split = splitHeader(text + "\n");
  const header = enrich(split?.[0] ?? null, verified, helpers, questionId);
  const markdown = (split?.[1] ?? text).trim();
  console.log(`[ask_text] ${header.route} in ${Date.now() - t0}ms`);
  await finish(questionId, header, markdown);
  const cited = new Set(
    Array.from(markdown.matchAll(/\[S(\d+)\]/g)).map((m) => `S${m[1]}`),
  );
  return {
    route: header.route,
    confidence: header.confidence,
    answer_markdown: markdown,
    sources: SOURCES.filter((s) => cited.has(s.ref)),
    used_answers: header.used_answers.map((u) => ({
      ref: u.ref,
      id: u.id,
      helper_name: u.helper_name,
    })),
    helpers: header.helpers.map((h) => ({
      id: h.id,
      name: h.name,
      why: h.why,
    })),
    question_id: questionId || undefined,
  };
}

export { monthYear };
