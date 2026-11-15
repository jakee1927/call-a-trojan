/** A ticker strip. Purely decorative, so it is hidden from screen readers; hover pauses it. */
export function Marquee({ items, tone = "gold" }: { items: string[]; tone?: "gold" | "ink" | "cardinal" }) {
  const cls = tone === "gold" ? "bg-gold text-ink" : tone === "ink" ? "bg-ink text-gold" : "bg-cardinal text-gold";
  const run = [...items, ...items, ...items, ...items];
  return (
    <div aria-hidden className={`relative z-10 -mx-2 overflow-hidden border-y-[2.5px] border-ink py-2 ${cls} rotate-[-1deg]`}>
      <div className="marquee">
        {[0, 1].map((k) => (
          <div key={k} className="flex shrink-0">
            {run.map((t, i) => (
              <span key={i} className="display mx-5 whitespace-nowrap text-xl">
                {t}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Says plainly what this is: a student project using USC's marks, not a USC site. */
export function Footer() {
  return (
    <footer className="mt-20 bg-ink text-white">
      <Marquee tone="cardinal" items={["FIGHT ON ✌️", "ASK ANYTHING", "REAL TROJANS", "NO DUMB QUESTIONS", "FREE FOREVER", "BEAT THE BRUINS 🐻"]} />
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/usc/sc.svg" alt="" width={34} height={50} className="wiggle-hover h-12 w-auto" />
        <p className="max-w-[60ch] text-sm text-white/80">
          <span className="display block text-lg text-gold">Built by Trojans at the AI@USC hackathon.</span>
          A student project, not an official USC website. USC marks belong to the University of Southern California.
        </p>
      </div>
    </footer>
  );
}
