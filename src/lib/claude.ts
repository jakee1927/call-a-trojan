import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./supabase-server";

export const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
export function claude(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

// Claude Opus 5.5 list prices, $ per million tokens.
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };

export function costUsd(u: Anthropic.Usage): number {
  return (
    ((u.input_tokens ?? 0) * PRICE.input +
      (u.output_tokens ?? 0) * PRICE.output +
      (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) /
    1_000_000
  );
}

export async function logUsage(route: string, usage: Anthropic.Usage | undefined, ms?: number) {
  if (!usage) return;
  const row = {
    route,
    model: MODEL,
    input_tokens: usage.input_tokens ?? 0,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cost_usd: Number(costUsd(usage).toFixed(5)),
    ms: ms ?? null,
  };
  console.log(`[usage] ${route}`, JSON.stringify(row));
  try {
    await db().from("usage_log").insert(row);
  } catch (e) {
    console.error("[usage] insert failed", e);
  }
}

export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
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
