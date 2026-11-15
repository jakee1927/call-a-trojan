import { GapReport } from "@/components/GapReport";
import { Hero } from "@/components/Hero";
import { Footer } from "@/components/Marquee";
import { CountUp } from "@/components/CountUp";
import { insightsData } from "@/lib/insights";
import { SEED_QUESTIONS } from "@/lib/corpus";

export const dynamic = "force-dynamic";
export const metadata = { title: "USG Insights · Call a Trojan" };

// Clearly-labeled sample trend so the chart shape is visible before real volume exists.
const SAMPLE_WEEK = [["Mon", 42], ["Tue", 57], ["Wed", 61], ["Thu", 88], ["Fri", 49], ["Sat", 21], ["Sun", 33]] as const;

const STAT_STYLE = ["tilt-l", "sticker-gold tilt-r", "sticker-cardinal tilt-l", "sticker-ink tilt-r"];

function Stat({ label, value, sub, i }: { label: string; value: string; sub?: string; i: number }) {
  return (
    <div className={`sticker grab drop p-4 ${STAT_STYLE[i % 4]}`} style={{ "--i": i } as React.CSSProperties}>
      <dt className="text-sm font-extrabold">{label}</dt>
      <dd className="display mt-1 text-[2.75rem] leading-none tabular-nums">
        <CountUp value={value} />
      </dd>
      {sub && <dd className="mt-2 text-sm font-medium leading-snug opacity-90">{sub}</dd>}
    </div>
  );
}

function Key({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-[2px] ${color}`} />
      <span>{children}</span>
    </li>
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
    <main className="min-h-screen">
      <Hero active="insights" small loud="What Trojans are" hot="asking">
        <p className="mt-4 max-w-[52ch] text-lg font-medium text-white/90">
          For USC Undergraduate Student Government. Counted from every question asked on Call a Trojan, with no names and no student records.
        </p>
      </Hero>
      <section className="mx-auto max-w-5xl px-5 pt-10">
        <dl className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <Stat i={0} label="Questions asked" value={String(d.total)} sub={`${d.total - d.voiceQuestions} typed · ${d.voiceQuestions} by voice · ${d.phoneCalls} phone call${d.phoneCalls === 1 ? "" : "s"}`} />
          <Stat i={1} label="Answered by AI" value={`${Math.round((d.byRoute.ai / routeTotal) * 100)}%`} sub="from official usc.edu pages, cited" />
          <Stat i={2} label="Median time to a Trojan" value={d.medianMin == null ? "—" : d.medianMin < 1.5 ? "1 min" : `${Math.round(d.medianMin)} min`} sub={`${d.handoffs} handoffs · ${d.stillOpen} still open`} />
          <Stat i={3} label="Verified answers" value={String(d.verifiedCount)} sub={`reused ${d.verifiedUses}× by later students`} />
        </dl>

        <div className="mt-10 grid items-start gap-6 md:grid-cols-2">
          <div className="sticker p-5 md:p-6">
            <h2 className="display text-2xl">Who answered</h2>
            <div className="grow-x mt-4 flex h-7 overflow-hidden rounded-full border-[2.5px] border-ink bg-wash">
              <div className="bg-cardinal" style={{ width: `${(d.byRoute.ai / routeTotal) * 100}%` }} />
              <div className="bg-gold" style={{ width: `${(d.byRoute.both / routeTotal) * 100}%` }} />
              <div className="bg-ink" style={{ width: `${(d.byRoute.trojan / routeTotal) * 100}%` }} />
            </div>
            <ul className="mt-4 space-y-1.5 text-[15px]">
              <Key color="bg-cardinal">AI from USC pages <b className="font-semibold tabular-nums">{d.byRoute.ai}</b></Key>
              <Key color="bg-gold">Pages and a Trojan <b className="font-semibold tabular-nums">{d.byRoute.both}</b></Key>
              <Key color="bg-ink">Only a Trojan could answer <b className="font-semibold tabular-nums">{d.byRoute.trojan}</b></Key>
            </ul>
            {d.avgCost != null && (
              <p className="mt-4 text-sm text-muted">
                Average AI cost ${d.avgCost.toFixed(3)} per question{d.medianLatencyMs ? ` · median ${(d.medianLatencyMs / 1000).toFixed(1)}s` : ""} (from token logs)
              </p>
            )}
          </div>
          <div className="sticker p-5 md:p-6">
            <h2 className="display text-2xl">Top topics</h2>
            {d.topTopics.length === 0 && <p className="mt-3 text-[15px] text-muted">No questions yet.</p>}
            <ul className="mt-4 space-y-2">
              {d.topTopics.map(([t, n], i) => (
                <li key={t} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-3 text-[15px] font-semibold">
                  <span className="truncate">{t}</span>
                  <span className={`grow-x h-4 rounded-full border-2 border-ink ${i % 2 ? "bg-gold" : "bg-cardinal"}`} style={{ width: `${Math.max(4, (n / maxTopic) * 100)}%`, "--i": i } as React.CSSProperties} />
                  <span className="text-right text-sm tabular-nums text-muted">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="sticker mt-6 p-5 md:p-6">
          <h2 className="display text-2xl">
            Questions per day
            {useSample && <span className="note-tag ml-2 align-middle">sample data</span>}
          </h2>
          <div className="mt-5 flex h-36 items-end gap-2 border-b border-line-strong">
            {series.map(([k, v], i) => (
              <div key={k} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-sm font-bold tabular-nums">{v}</span>
                <div className={`grow-y w-full max-w-16 rounded-t-xl border-[2.5px] border-b-0 border-ink ${useSample ? "bg-gold-tint" : i % 2 ? "bg-gold" : "bg-cardinal"}`} style={{ height: `${(v / max) * 78}%`, "--i": i } as React.CSSProperties} />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2">
            {series.map(([k]) => (
              <span key={k} className="flex-1 text-center text-sm text-muted">{k}</span>
            ))}
          </div>
          {useSample && <p className="mt-3 text-sm text-muted">Sample shape shown until there are 3 or more days of real questions.</p>}
        </div>

        {(() => {
          const comm = SEED_QUESTIONS.filter((q) => (q as { origin?: string }).origin === "community");
          if (!comm.length) return null;
          const full = comm.filter((q) => q.expected_route === "ai").length;
          const part = comm.filter((q) => q.expected_route === "both").length;
          const none = comm.filter((q) => q.expected_route === "trojan").length;
          return (
            <div className="sticker sticker-tint mt-6 p-5 md:p-6">
              <h2 className="display text-2xl">Does usc.edu answer what students actually ask?</h2>
              <p className="mt-3 max-w-[60ch] text-xl leading-snug">
                Of <b className="font-bold">{comm.length}</b> recurring student questions, <b className="font-bold">{full}</b> are fully answered on usc.edu,{" "}
                <b className="font-bold">{part}</b> partly, and <b className="font-bold text-cardinal">{none} not at all</b>.
              </p>
              <div className="grow-x mt-5 flex h-7 overflow-hidden rounded-full border-[2.5px] border-ink bg-wash">
                <div className="bg-cardinal" style={{ width: `${(full / comm.length) * 100}%` }} />
                <div className="bg-gold" style={{ width: `${(part / comm.length) * 100}%` }} />
                <div className="bg-ink" style={{ width: `${(none / comm.length) * 100}%` }} />
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
                <Key color="bg-cardinal">Fully answered</Key>
                <Key color="bg-gold">Partly</Key>
                <Key color="bg-ink">Not at all</Key>
              </ul>
              <p className="mt-3 max-w-[64ch] text-sm text-muted">
                Sampled by hand from r/USC, Nov 2026. The unanswered ones are what Call a Trojan routes to real Trojans, and every answer they approve closes a gap.
              </p>
            </div>
          );
        })()}

        <div className="mt-6">
          <GapReport initial={d.gap} />
        </div>
      </section>
      <Footer />
    </main>
  );
}
