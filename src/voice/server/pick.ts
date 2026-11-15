import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/supabase-server";
import { isUuid } from "./calls";
import { twilioEnv } from "./twilio";

export type PublicTrojan = {
  id: string;
  name: string;
  year: string | null;
  major: string | null;
  avatar_url: string | null;
  tags: string[];
};

export type Override = "auto" | "ai" | "human";
export type Plan =
  | { mode: "human"; transport: "twilio" | "app"; helper: PublicTrojan; reason: string }
  | { mode: "ai"; reason: string; humanUnavailable?: string };

type HelperRow = PublicTrojan & { phone: string | null; on_shift_until: string | null; is_ai: boolean };

export function parseOverride(v: unknown): Override {
  return v === "ai" || v === "human" ? v : "auto";
}

export function defaultOverride(): Override {
  return parseOverride(process.env.NEXT_PUBLIC_CALL_DEFAULT);
}

export function humanTransport(): "twilio" | "app" {
  const forced = process.env.VOICE_HUMAN_TRANSPORT;
  if (forced === "app") return "app";
  if (forced === "twilio") return "twilio";
  return twilioEnv() ? "twilio" : "app";
}

/** Question/handoff context used both for matching and for the AI's opening context. */
export async function loadContext(questionId?: string | null, handoffId?: string | null) {
  const out: { questionId: string | null; question: string | null; answerMd: string | null; helperIds: string[]; handoffHelperId: string | null; audience: string | null } =
    { questionId: null, question: null, answerMd: null, helperIds: [], handoffHelperId: null, audience: null };
  try {
    if (isUuid(handoffId)) {
      const { data } = await db().from("handoffs").select("question_id, helper_id").eq("id", handoffId).maybeSingle();
      if (data) {
        out.handoffHelperId = data.helper_id ?? null;
        if (!questionId) questionId = data.question_id;
      }
    }
    if (isUuid(questionId)) {
      const { data } = await db().from("questions").select("id, text, answer_md, header, audience").eq("id", questionId).maybeSingle();
      if (data) {
        out.questionId = data.id;
        out.question = data.text;
        out.answerMd = data.answer_md ?? null;
        out.audience = data.audience ?? null;
        const hs = (data.header?.helpers ?? []) as { id?: string }[];
        out.helperIds = hs.map((h) => h.id).filter(isUuid);
      }
    }
  } catch (e) {
    console.error("[voice] loadContext", e);
  }
  return out;
}

/** On-shift human Trojans with a phone, best match first. */
export async function onShiftHumans(prefer: string[] = []): Promise<HelperRow[]> {
  try {
    const { data, error } = await db()
      .from("helpers")
      .select("id, name, year, major, avatar_url, tags, phone, on_shift_until, is_ai")
      .eq("is_ai", false)
      .gt("on_shift_until", new Date().toISOString())
      .not("phone", "is", null)
      .order("on_shift_until", { ascending: false })
      .limit(20);
    if (error) throw error;
    const rows = ((data ?? []) as HelperRow[]).filter((h) => (h.phone ?? "").trim().length >= 8);
    const rank = (h: HelperRow) => {
      const i = prefer.indexOf(h.id);
      return i === -1 ? 99 : i;
    };
    return rows.sort((a, b) => rank(a) - rank(b));
  } catch (e) {
    console.error("[voice] onShiftHumans", e);
    return [];
  }
}

export const toPublic = (h: HelperRow): PublicTrojan => ({
  id: h.id,
  name: h.name,
  year: h.year,
  major: h.major,
  avatar_url: h.avatar_url,
  tags: h.tags ?? [],
});

export async function decide(opts: { questionId?: string | null; handoffId?: string | null; override?: Override }) {
  const override = opts.override && opts.override !== "auto" ? opts.override : defaultOverride();
  const ctx = await loadContext(opts.questionId, opts.handoffId);
  if (override === "ai") return { plan: { mode: "ai", reason: "forced" } as Plan, ctx, helperPhone: null };
  const prefer = [ctx.handoffHelperId, ...ctx.helperIds].filter((x): x is string => !!x);
  const humans = await onShiftHumans(prefer);
  const h = humans[0];
  if (h) {
    return {
      plan: { mode: "human", transport: humanTransport(), helper: toPublic(h), reason: prefer.includes(h.id) ? "matched" : "on_shift" } as Plan,
      ctx,
      helperPhone: normalizePhone(h.phone),
    };
  }
  return {
    plan: { mode: "ai", reason: "no_human_on_shift", humanUnavailable: override === "human" ? "No human Trojan with a phone is on shift." : undefined } as Plan,
    ctx,
    helperPhone: null,
  };
}

/** Best-effort E.164 for US numbers typed loosely ("213-555-1234"). */
export function normalizePhone(p: string | null): string | null {
  if (!p) return null;
  const t = p.trim();
  if (t.startsWith("+")) return "+" + t.slice(1).replace(/\D/g, "");
  const d = t.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d ? "+" + d : null;
}

/** Signed ticket so only the browser that started a call can poll / end it. */
function ticketSecret() {
  return `voice:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}:${process.env.TWILIO_AUTH_TOKEN ?? ""}:${process.env.OPENAI_API_KEY?.slice(-6) ?? ""}`;
}
/** Secret-ish broadcast channel the helper's /call/answer page listens on for incoming calls. */
export function ringChannel(helperId: string) {
  return `ring_${crypto.createHmac("sha256", ticketSecret()).update(helperId).digest("hex").slice(0, 24)}`;
}

export function signTicket(parts: Record<string, string>): string {
  const body = Buffer.from(JSON.stringify(parts)).toString("base64url");
  const sig = crypto.createHmac("sha256", ticketSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}
export function readTicket(t: unknown): Record<string, string> | null {
  if (typeof t !== "string") return null;
  const [body, sig] = t.split(".");
  if (!body || !sig) return null;
  const want = crypto.createHmac("sha256", ticketSecret()).update(body).digest("base64url");
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
}
