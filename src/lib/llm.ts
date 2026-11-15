import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { db } from "./supabase-server";

/**
 * One place that talks to an LLM. AI_PROVIDER=openai (default) | anthropic.
 *
 * Prompt layout for every call, in this order so the provider can cache the prefix:
 *   1. stable system text (instructions + the whole corpus for ask): identical bytes every request
 *   2. per-request system text (date, persona, verified answers, helper roster)
 *   3. the user turn (question last)
 */

export type Provider = "openai" | "anthropic";
export type Effort = "none" | "low" | "medium";
export type ImagePart = {
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
};

export type LlmRequest = {
  /** usage_log route name */
  route: string;
  /** cached prefix (stable across requests) */
  system: string;
  /** per-request system context, after the cached prefix */
  context?: string;
  user: string;
  image?: ImagePart;
  effort: Effort;
  maxTokens: number;
  /** OpenAI only: override OPENAI_MODEL for this call (e.g. the voice model) */
  openaiModel?: string;
};

export function provider(): Provider {
  return process.env.AI_PROVIDER === "anthropic" ? "anthropic" : "openai";
}

const ANTHROPIC_MODEL = "claude-opus-5-5";
export function model(): string {
  return provider() === "anthropic"
    ? ANTHROPIC_MODEL
    : process.env.OPENAI_MODEL || "gpt-6.1-terra";
}

let oa: OpenAI | null = null;
let an: Anthropic | null = null;
const openai = () => (oa ??= new OpenAI());
const anthropic = () => (an ??= new Anthropic());

// ---------- usage + cost ----------

type Usage = {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
};

// $ per million tokens: [uncached input, cache read, cache write, output]
const PRICES: [prefix: string, p: [number, number, number, number]][] = [
  ["claude-opus-5", [4, 0.2, 5, 20]],
  ["gpt-6-astra", [10, 1, 12.5, 50]],
  ["gpt-6.1-sol", [2, 0.1, 2.5, 10]],
  ["gpt-6.1-terra", [1, 0.1, 1.25, 5]],
  ["gpt-6-luna", [0.1, 0.01, 0.125, 0.5]],
];

function cost(m: string, u: Usage): number {
  const p = PRICES.find(([pre]) => m.startsWith(pre))?.[1] ?? PRICES[1][1];
  return (
    (u.input * p[0] +
      u.cacheRead * p[1] +
      u.cacheWrite * p[2] +
      u.output * p[3]) /
    1_000_000
  );
}

export async function logUsage(route: string, u: Usage | null, ms?: number, usedModel?: string) {
  if (!u) return;
  const m = usedModel ?? model();
  const row = {
    route,
    model: m,
    input_tokens: u.input,
    cache_read_tokens: u.cacheRead,
    cache_write_tokens: u.cacheWrite,
    output_tokens: u.output,
    cost_usd: Number(cost(m, u).toFixed(5)),
    ms: ms ?? null,
  };
  console.log(`[usage] ${route}`, JSON.stringify(row));
  try {
    await db().from("usage_log").insert(row);
  } catch (e) {
    console.error("[usage] insert failed", e);
  }
}

function fromOpenAI(
  u: OpenAI.Responses.ResponseUsage | null | undefined,
): Usage | null {
  if (!u) return null;
  const cacheRead = u.input_tokens_details?.cached_tokens ?? 0;
  const cacheWrite = u.input_tokens_details?.cache_write_tokens ?? 0;
  // input_tokens counts every input token; store the uncached remainder like Anthropic does.
  return {
    input: Math.max(0, u.input_tokens - cacheRead - cacheWrite),
    cacheRead,
    cacheWrite,
    output: u.output_tokens,
  };
}

function fromAnthropic(u: Anthropic.Usage | null | undefined): Usage | null {
  if (!u) return null;
  return {
    input: u.input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
  };
}

// ---------- request builders ----------

function openaiInput(r: LlmRequest): OpenAI.Responses.ResponseInput {
  const input: OpenAI.Responses.ResponseInput = [
    { role: "developer", content: r.system },
  ];
  if (r.context) input.push({ role: "developer", content: r.context });
  input.push({
    role: "user",
    content: r.image
      ? [
          {
            type: "input_image",
            image_url: `data:${r.image.mediaType};base64,${r.image.base64}`,
            detail: "high",
          },
          { type: "input_text", text: r.user },
        ]
      : r.user,
  });
  return input;
}

function openaiBase(r: LlmRequest) {
  return {
    model: r.openaiModel || model(),
    input: openaiInput(r),
    reasoning: { effort: r.effort },
    max_output_tokens: r.maxTokens,
    store: false,
  };
}

function anthropicBase(r: LlmRequest) {
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: r.system, cache_control: { type: "ephemeral" } },
  ];
  if (r.context) system.push({ type: "text", text: r.context });
  const content: Anthropic.ContentBlockParam[] = [];
  if (r.image)
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: r.image.mediaType,
        data: r.image.base64,
      },
    });
  content.push({ type: "text", text: r.user });
  return {
    model: ANTHROPIC_MODEL,
    max_tokens: r.maxTokens,
    thinking: { type: "adaptive" as const },
    system,
    messages: [{ role: "user" as const, content }],
  };
}

const anthropicEffort = (e: Effort) => (e === "none" ? "low" : e);

// ---------- public API ----------

export type TextStream = {
  /** text deltas, in order */
  deltas: AsyncGenerator<string>;
  /** resolves after deltas finish: whether the model refused */
  done: () => Promise<{ refused: boolean }>;
};

/** Stream text. Usage is logged when the stream ends. */
export function streamText(r: LlmRequest): TextStream {
  const t0 = Date.now();
  let refused = false;

  async function* openaiDeltas() {
    const stream = await openai().responses.create({
      ...openaiBase(r),
      stream: true,
    });
    for await (const ev of stream) {
      if (ev.type === "response.output_text.delta") yield ev.delta;
      else if (ev.type === "response.refusal.delta") refused = true;
      else if (
        ev.type === "response.completed" ||
        ev.type === "response.incomplete"
      ) {
        await logUsage(r.route, fromOpenAI(ev.response.usage), Date.now() - t0, r.openaiModel || model());
      } else if (ev.type === "response.failed") {
        throw new Error(ev.response.error?.message ?? "OpenAI response failed");
      } else if (ev.type === "error") {
        throw new Error(ev.message);
      }
    }
  }

  async function* anthropicDeltas() {
    const stream = anthropic().messages.stream({
      ...anthropicBase(r),
      output_config: { effort: anthropicEffort(r.effort) },
    });
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta")
        yield ev.delta.text;
    }
    const final = await stream.finalMessage();
    refused = final.stop_reason === "refusal";
    await logUsage(r.route, fromAnthropic(final.usage), Date.now() - t0);
  }

  return {
    deltas: provider() === "anthropic" ? anthropicDeltas() : openaiDeltas(),
    done: async () => ({ refused }),
  };
}

/** Whole text, streamed under the hood (avoids long-request timeouts). */
export async function generateText(
  r: LlmRequest,
): Promise<{ text: string; refused: boolean }> {
  const s = streamText(r);
  let text = "";
  for await (const d of s.deltas) text += d;
  return { text, refused: (await s.done()).refused };
}

/** Structured output validated against a zod schema. Returns null on refusal or bad output. */
export async function generateObject<S extends z.ZodType>(
  r: LlmRequest,
  schema: S,
  name: string,
): Promise<z.infer<S> | null> {
  const t0 = Date.now();
  if (provider() === "anthropic") {
    const res = await anthropic().messages.parse({
      ...anthropicBase(r),
      output_config: { effort: anthropicEffort(r.effort), format: zodOutputFormat(schema) },
    });
    await logUsage(r.route, fromAnthropic(res.usage), Date.now() - t0);
    return (res.parsed_output as z.infer<S> | null) ?? null;
  }
  const res = await openai().responses.parse({
    ...openaiBase(r),
    text: { format: zodTextFormat(schema, name) },
  });
  await logUsage(r.route, fromOpenAI(res.usage), Date.now() - t0, r.openaiModel || model());
  return (res.output_parsed as z.infer<S> | null) ?? null;
}

/** Pull the first JSON object out of model text (tolerates code fences / prose). */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
