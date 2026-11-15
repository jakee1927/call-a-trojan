// Route every seed question through /api/ask/text (persist:false) and save the routes.
// Usage: node scripts/route-all-seeds.mjs <baseUrl> <out.json> [compareWith.json]
import { readFileSync, writeFileSync } from "node:fs";

const [base = "http://localhost:3000", out = "routes.json", prevPath] = process.argv.slice(2);
const corpus = JSON.parse(readFileSync(new URL("../src/generated/corpus.json", import.meta.url)));
const seeds = corpus.seedQuestions;
const results = new Array(seeds.length);
let next = 0;

async function worker() {
  while (next < seeds.length) {
    const i = next++;
    const s = seeds[i];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(`${base.replace(/\/$/, "")}/api/ask/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: s.question, audience: s.audience, persist: false }),
        });
        const j = await r.json();
        results[i] = { question: s.question, audience: s.audience, expected: s.expected_route, got: j.route, confidence: j.confidence };
        break;
      } catch (e) {
        results[i] = { question: s.question, expected: s.expected_route, got: "ERROR", error: String(e) };
      }
    }
  }
}
await Promise.all(Array.from({ length: Number(process.env.CONCURRENCY ?? 3) }, worker));
writeFileSync(out, JSON.stringify(results, null, 1));

const match = results.filter((r) => r.got === r.expected).length;
console.log(`${base}: ${match}/${results.length} match expected_route`);
const byExp = {};
for (const r of results) (byExp[`${r.expected}->${r.got}`] ??= 0), byExp[`${r.expected}->${r.got}`]++;
console.log(JSON.stringify(byExp));
if (prevPath) {
  const prev = JSON.parse(readFileSync(prevPath, "utf8"));
  const pm = new Map(prev.map((p) => [p.question, p]));
  console.log("Flipped vs previous run:");
  for (const r of results) {
    const p = pm.get(r.question);
    if (p && p.got !== r.got) console.log(`  ${p.got} -> ${r.got} (expected ${r.expected}) ${r.question}`);
  }
}
