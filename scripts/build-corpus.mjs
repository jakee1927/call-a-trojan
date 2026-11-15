// Bundles data/ (written by the scrape agents) into src/generated/corpus.json so
// serverless routes don't depend on runtime file tracing. Deterministic order keeps
// the prompt-cache prefix stable across deploys.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "data");
const out = path.join(root, "src", "generated", "corpus.json");
const MAX_TOTAL_CHARS = 380_000; // ~95k tokens
const MAX_PAGE_CHARS = 16_000;

function readJsonDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => {
      try {
        return [{ file: f, data: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }];
      } catch (e) {
        console.warn(`[corpus] skip ${f}: ${e.message}`);
        return [];
      }
    });
}

const pages = [];
let total = 0;
for (const { file, data } of readJsonDir(path.join(dataDir, "pages"))) {
  if (!data?.url || !data?.text) continue;
  const text = String(data.text).slice(0, MAX_PAGE_CHARS).trim();
  if (text.length < 200) continue;
  if (total + text.length > MAX_TOTAL_CHARS) {
    console.warn(`[corpus] budget reached, skipping ${file}`);
    continue;
  }
  total += text.length;
  pages.push({
    id: data.id ?? file.replace(/\.json$/, ""),
    url: data.url,
    title: data.title ?? data.id,
    area: data.area ?? "other",
    audiences: Array.isArray(data.audiences) ? data.audiences : ["current"],
    topics: Array.isArray(data.topics) ? data.topics : [],
    fetched_at: data.fetched_at ?? null,
    text,
  });
}

const seedQuestions = readJsonDir(path.join(dataDir, "seed-questions")).flatMap(({ file, data }) =>
  (Array.isArray(data) ? data : []).map((q) => ({ ...q, area: file.replace(/\.json$/, "") })),
);

let usg = null;
const usgPath = path.join(dataDir, "orgs", "usg.json");
if (fs.existsSync(usgPath)) {
  try {
    usg = JSON.parse(fs.readFileSync(usgPath, "utf8"));
  } catch {}
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ pages, seedQuestions, usg }, null, 0));
console.log(`[corpus] ${pages.length} pages, ${total} chars, ${seedQuestions.length} seed questions, usg=${!!usg}`);
