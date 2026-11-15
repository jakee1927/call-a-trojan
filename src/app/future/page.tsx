import { notFound } from "next/navigation";
import { AskExperience } from "@/components/AskExperience";
import { PhoneLine } from "@/components/PhoneLine";
import { Faces } from "@/components/Faces";
import { Hero } from "@/components/Hero";
import { Footer } from "@/components/Marquee";
import { FLAGS } from "@/lib/flags";
import { FUTURE_PICKS, homeData, pickSuggestions, typicalReply } from "@/lib/home";

export const dynamic = "force-dynamic";
export const metadata = { title: "Future Trojans · Call a Trojan", description: "Applying to USC or just admitted? Ask a real Trojan, free." };

export default async function FuturePage() {
  if (!FLAGS.future) notFound();
  const { helpers, online, medianReplyMin } = await homeData();
  return (
    <main className="min-h-screen">
      <Hero active="future" quiet="Applying to USC, or just got in?" loud="Ask a real Trojan," hot="free.">
        <p className="mt-5 max-w-[48ch] text-lg font-medium text-white/90 md:text-xl">
          Deadlines, cost, transfer credit, what USC is really like. The AI answers from official admissions pages. For the rest, a student ambassador
          replies, usually within a day.
        </p>
      </Hero>
      <section className="relative z-10 mx-auto -mt-20 max-w-5xl px-5">
        <AskExperience
          suggestions={pickSuggestions(FUTURE_PICKS, "applicant", "incoming-admissions")}
          initialAudience="applicant"
          flags={{ showme: false, call: FLAGS.call }}
          placeholder="Ask anything about applying to or starting at USC"
        />
        <div className="mt-12 flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <Faces helpers={helpers} online={online} typical={typicalReply(online, medianReplyMin)} />
          <PhoneLine note="An AI Trojan picks up, and a student ambassador gets back to you." />
        </div>

        <h2 className="display mt-20 text-4xl">How it works</h2>
        <ol className="mt-6 grid gap-6 md:grid-cols-3">
          {[
            ["1", "Official first", "Every fact comes from a usc.edu page, cited, so you can check it yourself.", "tilt-l"],
            ["2", "Real Trojans next", "Student ambassadors answer what websites can't: what it's actually like.", "sticker-gold tilt-r"],
            ["3", "Safe by design", "Replies are async, no contact details are exchanged, and Trojans coach but never write your essays.", "sticker-cardinal tilt-l"],
          ].map(([n, t, d, cls]) => (
            <li key={t} className={`sticker grab p-5 ${cls}`}>
              <span className="display text-5xl">{n}</span>
              <h3 className="display mt-1 text-2xl">{t}</h3>
              <p className="mt-2 font-medium">{d}</p>
            </li>
          ))}
        </ol>
        <p className="display mt-14 max-w-[26ch] text-3xl">
          Applicant, incoming, current, helper. <span className="text-cardinal">Next fall, you answer the question you asked.</span>
        </p>
      </section>
      <Footer />
    </main>
  );
}
