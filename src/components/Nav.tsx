import Link from "next/link";
import { FLAGS } from "@/lib/flags";

export function Nav({ active }: { active?: "ask" | "future" | "usg" | "insights" }) {
  const item = (href: string, label: string, key: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={`whitespace-nowrap rounded-full border-2 px-2.5 py-1 text-sm font-extrabold sm:px-3 sm:text-[15px] transition-transform duration-200 hover:-translate-y-0.5 hover:rotate-[-3deg] active:scale-90 ${
        active === key ? "rotate-[-2deg] border-ink bg-gold text-ink shadow-[3px_3px_0_var(--ink)]" : "border-transparent text-white hover:border-gold hover:text-gold"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <header className="relative z-20 bg-cardinal text-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
        <Link href="/" data-fx="rain" className="group mr-auto flex items-center gap-2.5" aria-label="Call a Trojan, home">
          {/* Official interlocking SC mark (USC Athletics), from Wikimedia Commons. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/usc/sc.svg" alt="USC" width={27} height={40} className="h-10 w-auto transition-transform duration-300 group-hover:rotate-[-14deg] group-hover:scale-125 group-active:rotate-[20deg]" />
          <span className="display text-[1.55rem] text-gold">Call a Trojan</span>
        </Link>
        <nav className="order-3 -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-0.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] sm:order-none sm:mx-0 sm:w-auto sm:gap-1 sm:overflow-visible">
          {item("/", "Ask", "ask")}
          {FLAGS.future && item("/future", "Future Trojans", "future")}
        </nav>
        <Link href="/trojan" className="btn btn-gold !py-1.5">
          I&apos;m a Trojan
        </Link>
      </div>
    </header>
  );
}
