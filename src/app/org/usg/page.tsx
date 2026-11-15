import { notFound } from "next/navigation";
import { AskExperience } from "@/components/AskExperience";
import { Nav } from "@/components/Nav";
import { USG } from "@/lib/corpus";
import { FLAGS } from "@/lib/flags";
import { USG_PICKS, pickSuggestions } from "@/lib/home";

export const metadata = { title: "USG front desk · Call a Trojan" };

export default function UsgDesk() {
  if (!FLAGS.orgUsg || !USG || USG.rich_enough_for_desk === false) notFound();
  return (
    <main className="poster-bg min-h-screen pb-24">
      <Nav active="usg" />
      <section className="mx-auto max-w-5xl px-4 pt-6 md:pt-10">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cardinal text-lg font-black text-gold">USG</span>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-cardinal">Front desk</div>
            <div className="text-lg font-black">{USG.name}</div>
          </div>
        </div>
        <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight md:text-5xl">
          Funding, Senate, starting a club. <span className="text-cardinal">Ask USG.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-black/60">
          Answers come from USG&apos;s official pages. What they don&apos;t cover goes to USG senators and org officers, and their answers are saved for the next student.
        </p>
        <div className="mt-8">
          <AskExperience suggestions={pickSuggestions(USG_PICKS, "current", "usg-orgs")} orgSlug="usg" flags={{ showme: FLAGS.showme, call: FLAGS.call }} placeholder="Ask USG anything…" />
        </div>
      </section>
    </main>
  );
}
