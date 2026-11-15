import "server-only";
import { db } from "./supabase-server";

export async function insightsData() {
  const supa = db();
  const [{ data: qs }, { data: hs }, { data: vas }, { data: usage }, { data: gap }, { data: cs }] = await Promise.all([
    supa.from("questions").select("route,topics,status,audience,mode,created_at").order("created_at", { ascending: false }).limit(5000),
    supa.from("handoffs").select("status,created_at,claimed_at,closed_at").limit(5000),
    supa.from("verified_answers").select("uses,is_sample,expires_at").limit(5000),
    supa.from("usage_log").select("route,cost_usd,cache_read_tokens,input_tokens,ms").eq("route", "ask").order("created_at", { ascending: false }).limit(500),
    supa.from("gap_reports").select("body_md,created_at,handoff_count").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    // transport: 'phone' = inbound to the public number, 'openai-webrtc' = AI call in the browser,
    // 'twilio' / 'app' = outbound rings to a Trojan. meta (caller number) is never read here.
    supa.from("calls").select("transport,mode,status").order("started_at", { ascending: false }).limit(2000),
  ]);
  const questions = qs ?? [];
  const handoffs = hs ?? [];
  const byRoute = { ai: 0, both: 0, trojan: 0 };
  const topics = new Map<string, number>();
  const byAudience = { current: 0, incoming: 0, applicant: 0 } as Record<string, number>;
  const byDay = new Map<string, number>();
  for (const q of questions) {
    if (q.route && q.route in byRoute) byRoute[q.route as keyof typeof byRoute]++;
    for (const t of q.topics ?? []) topics.set(t, (topics.get(t) ?? 0) + 1);
    byAudience[q.audience] = (byAudience[q.audience] ?? 0) + 1;
    const day = new Date(q.created_at).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const answeredByTrojan = handoffs.filter((h) => h.status === "closed" || h.status === "approved").length;
  const stillOpen = handoffs.filter((h) => h.status === "open" || h.status === "claimed").length;
  const mins = handoffs
    .filter((h) => h.claimed_at)
    .map((h) => (new Date(h.claimed_at!).getTime() - new Date(h.created_at).getTime()) / 60000)
    .sort((a, b) => a - b);
  const median = mins.length ? mins[Math.floor(mins.length / 2)] : null;
  const costs = (usage ?? []).map((u) => Number(u.cost_usd));
  const avgCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
  const lat = (usage ?? []).map((u) => u.ms).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
  const realVerified = (vas ?? []).filter((v) => !v.is_sample);
  const calls = (cs ?? []) as CallRow[];
  const phoneCalls = calls.filter((c) => c.transport === "phone").length;
  const webCalls = calls.filter((c) => c.transport === "openai-webrtc").length;
  return {
    total: questions.length,
    byRoute,
    byAudience,
    answeredByAi: byRoute.ai,
    answeredByTrojan,
    stillOpen,
    handoffs: handoffs.length,
    medianMin: median,
    topTopics: Array.from(topics.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10),
    verifiedCount: realVerified.length,
    verifiedUses: realVerified.reduce((a, v) => a + (v.uses ?? 0), 0),
    avgCost,
    medianLatencyMs: lat.length ? lat[Math.floor(lat.length / 2)] : null,
    byDay: Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    gap: gap ?? null,
    phoneCalls,
    webCalls,
    voiceQuestions: questions.filter((q) => q.mode === "voice").length,
  };
}

type CallRow = { transport?: string | null; mode?: string; status?: string };
