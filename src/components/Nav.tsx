import Link from "next/link";
import { FLAGS } from "@/lib/flags";

export function Nav({ active }: { active?: "ask" | "future" | "usg" | "insights" }) {
  const item = (href: string, label: string, key: string) => (
    <Link href={href} className={`rounded-full px-3 py-1.5 text-sm font-bold ${active === key ? "bg-ink text-gold" : "text-black/60 hover:text-ink"}`}>
      {label}
    </Link>
  );
  return (
    <header className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-4">
      <Link href="/" className="mr-auto flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cardinal font-black text-gold">T</span>
        <span className="text-lg font-black tracking-tight">
          Call a <span className="text-cardinal">Trojan</span>
        </span>
      </Link>
      <nav className="hidden items-center gap-1 sm:flex">
        {item("/", "Ask", "ask")}
        {FLAGS.future && item("/future", "Future Trojans", "future")}
        {FLAGS.orgUsg && item("/org/usg", "USG desk", "usg")}
        {item("/insights", "Insights", "insights")}
      </nav>
      <Link href="/trojan" className="rounded-full bg-cardinal px-3.5 py-1.5 text-sm font-bold text-white">
        I&apos;m a Trojan
      </Link>
    </header>
  );
}
