"use client";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";

export function GapReport({ initial }: { initial: { body_md: string; created_at: string; handoff_count: number } | null }) {
  const [report, setReport] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function gen(auto = false) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/insights/gap", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (!auto) setErr(d.error ?? "Couldn't generate the report");
        return;
      }
      setReport(d.report);
    } finally {
      setBusy(false);
    }
  }
  // No report yet: write the first one automatically from the handoff log.
  const tried = useRef(false);
  useEffect(() => {
    if (!initial && !tried.current) {
      tried.current = true;
      gen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="sticker p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="display text-3xl text-cardinal">Questions USC&apos;s websites can&apos;t answer</h2>
          <p className="mt-1 text-[15px] text-muted">Written by the AI from every question it had to hand to a Trojan.</p>
        </div>
        <button onClick={() => gen()} disabled={busy} data-fx="boom" className="btn btn-gold">
          {busy ? "Reading the log…" : report ? "Regenerate" : "Generate report"}
        </button>
      </div>
      {err && <p className="mt-3 text-sm text-[#b42318]">{err}</p>}
      {report ? (
        <div className="mt-6">
          <Markdown text={report.body_md} sources={[]} />
          <p className="mt-4 text-sm text-muted">
            From {report.handoff_count} handed-off questions · {new Date(report.created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-[15px] text-muted">{busy ? "Writing the first report…" : "No report yet."}</p>
      )}
    </section>
  );
}
