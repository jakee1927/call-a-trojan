import "server-only";
import { db } from "@/lib/supabase-server";

/** All writes to `calls` are best-effort: a missing table or DB hiccup never breaks a live call. */

export type CallRow = {
  id: string;
  question_id: string | null;
  handoff_id: string | null;
  helper_id: string | null;
  mode: "ai" | "human";
  transport: string | null;
  status: string;
  audience: string | null;
  prompt: string | null;
  twilio_call_sid: string | null;
  room: string | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_s?: number | null;
  transcript: TranscriptLine[];
  metrics: Record<string, unknown>;
  meta: Record<string, unknown>;
};

export type TranscriptLine = { role: "student" | "ai" | "trojan" | "system"; text: string; at?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

export async function insertCall(row: Partial<CallRow> & { mode: "ai" | "human" }): Promise<string> {
  const id = row.id ?? crypto.randomUUID();
  try {
    const clean = {
      ...row,
      id,
      question_id: isUuid(row.question_id) ? row.question_id : null,
      handoff_id: isUuid(row.handoff_id) ? row.handoff_id : null,
    };
    const { error } = await db().from("calls").insert(clean);
    if (error) console.error("[calls] insert", error.message);
  } catch (e) {
    console.error("[calls] insert", e);
  }
  return id;
}

export async function updateCall(id: string, patch: Partial<CallRow>) {
  if (!isUuid(id)) return;
  try {
    const { error } = await db().from("calls").update(patch).eq("id", id);
    if (error) console.error("[calls] update", error.message);
  } catch (e) {
    console.error("[calls] update", e);
  }
}

export async function getCall(id: string): Promise<CallRow | null> {
  if (!isUuid(id)) return null;
  try {
    const { data } = await db().from("calls").select("*").eq("id", id).maybeSingle();
    return (data as CallRow) ?? null;
  } catch {
    return null;
  }
}

export async function mergeMeta(id: string, extra: Record<string, unknown>) {
  const row = await getCall(id);
  await updateCall(id, { meta: { ...(row?.meta ?? {}), ...extra } });
}
