import "server-only";
import { db } from "./supabase-server";
import { SEED_QUESTIONS } from "./corpus";
import type { Audience } from "./types";

export type FaceHelper = {
  id: string;
  name: string;
  year: string | null;
  major: string | null;
  tags: string[];
  avatar_url: string | null;
  online: boolean;
  is_demo: boolean;
};

export type Suggestion = { question: string; audience: Audience; expected_route: "ai" | "trojan" | "both" };

const FALLBACK: Suggestion[] = [
  { question: "When does spring 2027 registration open, and where do I see my registration time?", audience: "current", expected_route: "ai" },
  { question: "What is D-clearance and how do I actually get it for a class that needs it?", audience: "incoming", expected_route: "both" },
  { question: "Which dining hall do Trojans actually like best, and when is it least crowded?", audience: "current", expected_route: "trojan" },
];

/** Three suggestions that each exercise a different route; prefer the requested audience. */
export function suggestions(audience: Audience): Suggestion[] {
  const pool = SEED_QUESTIONS.filter((q) => q.question && q.expected_route);
  const out: Suggestion[] = [];
  for (const route of ["ai", "both", "trojan"] as const) {
    const pick =
      pool.find((q) => q.expected_route === route && q.audience === audience && q.question.length < 120) ??
      pool.find((q) => q.expected_route === route && q.question.length < 120) ??
      pool.find((q) => q.expected_route === route) ??
      FALLBACK.find((f) => f.expected_route === route)!;
    out.push({ question: pick.question, audience: pick.audience, expected_route: route });
  }
  return out;
}

export async function homeData() {
  try {
    const supa = db();
    const [{ data: helpers }, { data: claimed }] = await Promise.all([
      supa
        .from("public_helpers")
        .select("id,name,year,major,tags,avatar_url,online,is_demo")
        .eq("is_ai", false)
        .order("on_shift_until", { ascending: false, nullsFirst: false })
        .limit(40),
      supa
        .from("handoffs")
        .select("created_at,claimed_at")
        .not("claimed_at", "is", null)
        .order("claimed_at", { ascending: false })
        .limit(25),
    ]);
    const list = (helpers ?? []) as FaceHelper[];
    const mins = (claimed ?? [])
      .map((r) => (new Date(r.claimed_at).getTime() - new Date(r.created_at).getTime()) / 60000)
      .filter((m) => m >= 0)
      .sort((a, b) => a - b);
    const median = mins.length ? mins[Math.floor(mins.length / 2)] : null;
    return { helpers: list, online: list.filter((h) => h.online).length, medianReplyMin: median };
  } catch (e) {
    console.error("[home]", e);
    return { helpers: [] as FaceHelper[], online: 0, medianReplyMin: null as number | null };
  }
}

export function typicalReply(online: number, medianMin: number | null): string {
  if (medianMin != null && medianMin < 90) return medianMin < 1.5 ? "1 min" : `${Math.round(medianMin)} min`;
  if (online > 0) return "a few min";
  return "under 2 hr";
}
