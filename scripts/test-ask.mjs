// First-hour test 1: cached streaming call x N against a running app.
// Usage: node scripts/test-ask.mjs [baseUrl] [n]
// Reports time-to-header, time-to-first-text, header parse; then reads usage_log (cache reads) via the service key.
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
const n = Number(process.argv[3] ?? 10);
const env = Object.fromEntries(
  (fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const qs = [
  "When does spring 2027 registration open for continuing students?",
  "What is D-clearance and how do I get it?",
  "Which professor should I take for CSCI 104?",
  "How many units can I take Pass/No Pass?",
  "How does my club get USG funding for an event?",
];
const rows = [];
for (let i = 0; i < n; i++) {
  const q = qs[i % qs.length];
  const t0 = Date.now();
  const res = await fetch(`${base}/api/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, audience: "current" }) });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", tHeader = null, tText = null, header = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    if (!tHeader && buf.includes("\n")) {
      tHeader = Date.now() - t0;
      try { header = JSON.parse(buf.slice(0, buf.indexOf("\n"))); } catch { header = null; }
    }
    if (tHeader && !tText && buf.slice(buf.indexOf("\n") + 1).trim().length > 0) tText = Date.now() - t0;
  }
  const total = Date.now() - t0;
  rows.push({ i, q: q.slice(0, 40), ok: !!header && !header.error, route: header?.route, conf: header?.confidence, tHeader, tText, total, len: buf.length });
  console.log(JSON.stringify(rows.at(-1)));
}
if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  await new Promise((r) => setTimeout(r, 1500));
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/usage_log?route=eq.ask&order=created_at.desc&limit=${n}&select=input_tokens,cache_read_tokens,cache_write_tokens,output_tokens,cost_usd,ms`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const usage = (await r.json()).reverse();
  console.table(usage);
}
const okCount = rows.filter((r) => r.ok).length;
const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`header parsed ${okCount}/${n}; median time-to-header ${med(rows.map((r) => r.tHeader))}ms; median first text ${med(rows.map((r) => r.tText ?? 0))}ms; median total ${med(rows.map((r) => r.total))}ms`);
