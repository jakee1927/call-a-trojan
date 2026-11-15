import { GapReport } from "@/components/GapReport";
import { Nav } from "@/components/Nav";
import { insightsData } from "@/lib/insights";
import { SEED_QUESTIONS } from "@/lib/corpus";

export const dynamic = "force-dynamic";
export const metadata = { title: "USG Insights · Call a Trojan" };

// Clearly-labeled sample trend so the chart shape is visible before real volume exists.
const SAMPLE_WEEK = [["Mon", 42], ["Tue", 57], ["Wed", 61], ["Thu", 88], ["Fri", 49], ["Sat", 21], ["Sun", 33]] as const;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-black/45">{label}</div>
      <div className="mt-1 text-3xl font-black tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-black/50">{sub}</div>}
    </div>
  );
}

export default async function Insights() {
  let d: Awaited<ReturnType<typeof insightsData>> | null = null;
  try {
    d = await insightsData();
  } catch (e) {
    console.error("[insights]", e);
  }
  if (!d) return <main className="p-10">Insights are unavailable right now.</main>;
  const routeTotal = d.byRoute.ai + d.byRoute.both + d.byRoute.trojan || 1;
  const realDays = d.byDay.slice(-7);
  const useSample = realDays.length < 3;
  const series = useSample ? SAMPLE_WEEK.map(([k, v]) => [k, v] as [string, number]) : realDays.map(([k, v]) => [k.slice(5), v] as [string, number]);
  const max = Math.max(...series.map((s) => s[1]), 1);
  const maxTopic = d.topTopics[0]?.[1] ?? 1;
  return (
    <main className="poster-bg min-h-screen pb-24">
      <Nav active="insights" />
      <section className="mx-auto max-w-5xl space-y-6 px-4 pt-6">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-cardinal">For USC Undergraduate Student Government</div>
          <h1 className="mt-1 text-4xl font-black tracking-tight md:text-5xl">What Trojans are asking</h1>
          <p className="mt-2 max-w-2xl text-black/60">Live from every question asked on Call a Trojan. No names, no student records.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Questions asked" value={String(d.total)} sub={`${d.byAudience.applicant ?? 0} applicants · ${d.byAudience.incoming ?? 0} incoming`} />
          <Stat label="Answered by AI" value={`${Math.round((d.byRoute.ai / routeTotal) * 100)}%`} sub="from official usc.edu pages, cited" />
          <Stat label="Median time to a Trojan" value={d.medianMin == null ? "—" : d.medianMin < 1.5 ? "1 min" : `${Math.round(d.medianMin)} min`} sub={`${d.handoffs} handoffs · ${d.stillOpen} still open`} />
          <Stat label="Verified answers" value={String(d.verifiedCount)} sub={`reused ${d.verifiedUses}× by later students`} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
            <h2 className="text-sm font-black uppercase tracking-[0.15em] text-black/50">Who answered</h2>
            <div className="mt-4 flex h-5 overflow-hidden rounded-full bg-black/5">
              <div className="bg-cardinal" style={{ width: `${(d.byRoute.ai / routeTotal) * 100}%` }} />
              <div className="bg-gold" style={{ width: `${(d.byRoute.both / routeTotal) * 100}%` }} />
              <div className="bg-ink" style={{ width: `${(d.byRoute.trojan / routeTotal) * 100}%` }} />
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              <li><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-cardinal" />AI from USC pages: <b>{d.byRoute.ai}</b></li>
              <li><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-gold" />Pages + a Trojan: <b>{d.byRoute.both}</b></li>
              <li><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-ink" />Only a Trojan could answer: <b>{d.byRoute.trojan}</b></li>
            </ul>
            {d.avgCost != null && (
              <p className="mt-4 text-xs text-black/45">
                Avg AI cost ${d.avgCost.toFixed(3)} per question{d.medianLatencyMs ? ` · median ${(d.medianLatencyMs / 1000).toFixed(1)}s` : ""} (from token logs)
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
            <h2 className="text-sm font-black uppercase tracking-[0.15em] text-black/50">Top topics</h2>
            {d.topTopics.length === 0 && <p className="mt-3 text-sm text-black/40">No questions yet.</p>}
            <ul className="mt-3 space-y-1.5">
              {d.topTopics.map(([t, n]) => (
                <li key={t} className="flex items-center gap-2 text-sm">
                  <span className="w-36 shrink-0 truncate font-semibold">{t}</span>
                  <span className="h-2.5 rounded-full bg-cardinal/80" style={{ width: `${(n / maxTopic) * 60}%` }} />
                  <span className="text-xs text-black/50">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black uppercase tracking-[0.15em] text-black/50">Questions per day</h2>
            {useSample && <span className="rounded bg-gold px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider">sample data</span>}
          </div>
          <div className="mt-4 flex h-36 items-end gap-2">
            {series.map(([k, v]) => (
              <div key={k} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[11px] text-black/45">{v}</span>
                <div className={`w-full rounded-t-lg ${useSample ? "bg-black/15" : "bg-cardinal"}`} style={{ height: `${(v / max) * 100}%` }} />
                <span className="text-[11px] font-semibold text-black/55">{k}</span>
              </div>
            ))}
          </div>
          {useSample && <p className="mt-2 text-xs text-black/40">Sample shape shown until there are 3+ days of real questions.</p>}
        </div>

        {(() => {
          const comm = SEED_QUESTIONS.filter((q) => (q as { origin?: string }).origin === "community");
          if (!comm.length) return null;
          const full = comm.filter((q) => q.expected_route === "ai").length;
          const part = comm.filter((q) => q.expected_route === "both").length;
          const none = comm.filter((q) => q.expected_route === "trojan").length;
          return (
            <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-black uppercase tracking-[0.15em] text-black/50">Does usc.edu answer what students actually ask?</h2>
                <span className="rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black/55">sampled by hand from r/USC, Nov 2026</span>
              </div>
              <p className="mt-3 text-lg">
                Of <b>{comm.length}</b> recurring student questions, <b className="text-cardinal">{full}</b> are fully answered on usc.edu, <b>{part}</b> partly, and{" "}
                <b className="text-cardinal">{none} not at all</b>.
              </p>
              <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-black/5">
                <div className="bg-cardinal" style={{ width: `${(full / comm.length) * 100}%` }} />
                <div className="bg-gold" style={{ width: `${(part / comm.length) * 100}%` }} />
                <div className="bg-ink" style={{ width: `${(none / comm.length) * 100}%` }} />
              </div>
              <p className="mt-2 text-xs text-black/45">Those are the questions Call a Trojan routes to real Trojans, and every answer they approve closes a gap.</p>
            </div>
          );
        })()}

        <GapReport initial={d.gap} />
      </section>
    </main>
  );
}
