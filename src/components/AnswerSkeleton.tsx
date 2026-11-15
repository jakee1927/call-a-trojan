"use client";
import { useEffect, useState } from "react";

/** What the answer engine is doing, by seconds waited. Covered questions finish in the first step. */
const STEPS: [number, string][] = [
  [0, "Reading USC's saved pages…"],
  [2.5, "Searching USC's websites…"],
  [6, "Checking requirements and the catalogue…"],
  [11, "Writing your answer…"],
];

const LINES = ["w-11/12", "w-9/12", "w-10/12", "w-7/12", "w-10/12", "w-8/12"];

/** Loading state for the "USC says" lane: shimmering lines plus a live status line. */
export function AnswerSkeleton() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const iv = setInterval(() => setSecs((Date.now() - t0) / 1000), 400);
    return () => clearInterval(iv);
  }, []);
  const step = STEPS.filter(([at]) => secs >= at).length - 1;
  // Lines appear one by one so the card grows while the search runs.
  const shown = Math.min(LINES.length, 3 + Math.floor(secs / 2.5));

  return (
    <div className="py-2" role="status" aria-live="polite">
      <div className="space-y-2.5">
        {LINES.slice(0, shown).map((w, i) => (
          <div key={i} className={`h-3 ${w} animate-pulse rounded bg-black/10`} style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-cardinal/80">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cardinal/25 border-t-cardinal" aria-hidden />
        {STEPS[step][1]}
      </div>
      <ol className="mt-2 flex gap-1.5" aria-hidden>
        {STEPS.map(([at], i) => (
          <li key={at} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= step ? "bg-cardinal/60" : "bg-black/10"}`} />
        ))}
      </ol>
    </div>
  );
}
