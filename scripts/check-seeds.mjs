// Sanity check: one seed question per expected route through /api/ask/text, and verify every [S#] resolves.
// Usage: node scripts/check-seeds.mjs <baseUrl> [mode]   (mode: type | voice)
import { readFileSync } from "node:fs";

const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const mode = process.argv[3] || "type";
const corpus = JSON.parse(readFileSync(new URL("../src/generated/corpus.json", import.meta.url)));
const total = corpus.pages.length;

const picks = ["ai", "both", "trojan"].map((r) => corpus.seedQuestions.find((s) => s.expected_route === r));
let ok = true;
for (const s of picks) {
  const t0 = Date.now();
  const res = await fetch(`${base}/api/ask/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: s.question, audience: s.audience, mode, persist: false }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    ok = false;
    console.log(`FAIL ${s.expected_route}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    continue;
  }
  const r = await res.json();
  const refs = [...new Set([...r.answer_markdown.matchAll(/\[S(\d+)\]/g)].map((m) => Number(m[1])))];
  const bad = refs.filter((n) => n < 1 || n > total || !r.sources.some((x) => x.ref === `S${n}` && x.url));
  const routeOk = r.route === s.expected_route;
  if (bad.length) ok = false;
  console.log(
    `${routeOk ? "route ok " : "route DIFF"} expected=${s.expected_route} got=${r.route} conf=${r.confidence} ${ms}ms` +
      ` refs=[${refs.map((n) => "S" + n).join(",")}] unresolved=[${bad.join(",")}] helpers=${r.helpers.length} words=${r.answer_markdown.split(/\s+/).length}`,
  );
  console.log(`   Q: ${s.question}`);
  for (const src of r.sources) console.log(`   ${src.ref} ${src.url}`);
  console.log(`   A: ${r.answer_markdown.replace(/\n+/g, " ").slice(0, 260)}…`);
}
process.exit(ok ? 0 : 1);
