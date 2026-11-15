import { notFound } from "next/navigation";
import { AskExperience } from "@/components/AskExperience";
import { PhoneLine } from "@/components/PhoneLine";
import { Hero } from "@/components/Hero";
import { Footer } from "@/components/Marquee";
import { USG } from "@/lib/corpus";
import { FLAGS } from "@/lib/flags";
import { USG_PICKS, pickSuggestions } from "@/lib/home";

export const metadata = { title: "USG front desk · Call a Trojan" };

export default function UsgDesk() {
  if (!FLAGS.orgUsg || !USG || USG.rich_enough_for_desk === false) notFound();
  return (
    <main className="min-h-screen">
      <Hero active="usg" quiet="Funding, Senate, starting a club." loud="Ask" hot="USG.">
        <p className="mt-5 max-w-[48ch] text-lg font-medium text-white/90 md:text-xl">
          The {USG.name} front desk. Answers come from USG&apos;s official pages. What they don&apos;t cover goes to senators and org officers, and
          their answers are saved for the next student.
        </p>
      </Hero>
      <section className="relative z-10 mx-auto -mt-20 max-w-5xl px-5">
        <AskExperience suggestions={pickSuggestions(USG_PICKS, "current", "usg-orgs")} orgSlug="usg" lockAudience flags={{ showme: FLAGS.showme, call: FLAGS.call }} placeholder="Ask USG anything" />
        <div className="mt-12">
          <PhoneLine note="An AI Trojan picks up and connects you to USG." />
        </div>
      </section>
      <Footer />
    </main>
  );
}
