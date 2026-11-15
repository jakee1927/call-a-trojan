import { Nav } from "./Nav";

/** Splits a line into words you can poke. */
export function Words({ text, className = "" }: { text: string; className?: string }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i} className={`word ${className}`}>
          {w}
          {"\u00A0"}
        </span>
      ))}
    </>
  );
}

/** The cardinal top of a page: nav, a shouted headline, and a few things floating around. */
export function Hero({
  active,
  quiet,
  loud,
  hot,
  after,
  children,
  small,
}: {
  active?: "ask" | "future" | "usg" | "insights";
  /** First part of the headline, in white. */
  quiet?: string;
  /** Second part, in gold. */
  loud: string;
  /** One word of the gold part that gets scribbled under. */
  hot?: string;
  /** Rest of the gold part, after the hot word. */
  after?: string;
  children?: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div className="relative overflow-hidden bg-cardinal text-white">
      <Nav active={active} />
      {/* Floating bits. Decorative, but the big SC is a button: press it. */}
      <button
        data-fx="rain"
        aria-label="Fight on"
        className="bob absolute -right-6 top-24 hidden opacity-95 transition-transform duration-300 hover:scale-110 active:scale-90 md:block"
        style={{ "--r": "9deg" } as React.CSSProperties}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/usc/sc.svg" alt="" width={150} height={223} className="h-56 w-auto drop-shadow-[8px_8px_0_rgba(29,10,10,0.9)]" />
      </button>
      <span aria-hidden className="bob absolute right-[22%] top-[4.5rem] hidden text-5xl md:block" style={{ "--i": 2, "--r": "-12deg" } as React.CSSProperties}>
        ✌️
      </span>
      <section className={`relative mx-auto max-w-5xl px-5 ${small ? "pb-12 pt-8 md:pt-12" : "pb-28 pt-8 md:pb-32 md:pt-14"}`}>
        <h1 className={`display max-w-[15ch] ${small ? "text-[2.4rem] md:text-[3.6rem]" : "text-[2.7rem] md:text-[4.4rem]"}`}>
          {quiet && <Words text={quiet} />}
          <span className={`text-gold ${quiet ? "block" : ""}`}>
            <Words text={loud} />
            {hot && (
              <span className="word relative rotate-[-3deg]">
                {hot}
                <svg aria-hidden viewBox="0 0 200 20" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3 w-full overflow-visible">
                  <path d="M3 12 C 40 2, 70 20, 100 9 S 160 3, 197 12" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeDasharray="320" style={{ animation: "scribble 0.9s 0.5s ease-out both" }} />
                </svg>
                {"\u00A0"}
              </span>
            )}
            {after && <Words text={after} />}
          </span>
        </h1>
        {children}
      </section>
    </div>
  );
}
