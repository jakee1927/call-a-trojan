import { notFound } from "next/navigation";
import { AskExperience } from "@/components/AskExperience";
import { Faces } from "@/components/Faces";
import { Nav } from "@/components/Nav";
import { FLAGS } from "@/lib/flags";
import { FUTURE_PICKS, homeData, pickSuggestions, typicalReply } from "@/lib/home";

export const dynamic = "force-dynamic";
export const metadata = { title: "Future Trojans · Call a Trojan", description: "Applying to USC or just admitted? Ask a real Trojan, free." };

export default async function FuturePage() {
  if (!FLAGS.future) notFound();
  const { helpers, online, medianReplyMin } = await homeData();
  return (
    <main className="poster-bg min-h-screen pb-24">
      <Nav active="future" />
      <section className="mx-auto max-w-5xl px-4 pt-6 md:pt-10">
        <div className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1 text-xs font-bold uppercase tracking-wider text-gold">
          For future Trojans · applicants & admits
        </div>
        <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.02] tracking-tight md:text-6xl">
          A first-gen applicant who can&apos;t pay a consultant
          <span className="text-cardinal"> gets a real Trojan, free.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-black/60">
          Ask about deadlines, cost, transfer credit or what USC is really like. Our AI answers from official USC admissions pages with sources. For the
          rest, a USC student ambassador replies, usually within a day.
        </p>
        <div className="mt-6">
          <Faces helpers={helpers} online={online} typical={typicalReply(online, medianReplyMin)} />
        </div>
        <div className="mt-8">
          <AskExperience
            suggestions={pickSuggestions(FUTURE_PICKS, "applicant", "incoming-admissions")}
            initialAudience="applicant"
            flags={{ showme: false, call: FLAGS.call }}
            placeholder="Ask anything about applying to or starting at USC…"
          />
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            ["Official first", "Every fact comes from a usc.edu page, cited, so you can check it yourself."],
            ["Real Trojans next", "Student ambassadors answer what websites can't: what it's actually like."],
            ["Safe by design", "Replies are async, no contact details are exchanged, and Trojans coach but never write your essays."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl bg-white/80 p-5 ring-1 ring-black/5">
              <div className="font-black text-cardinal">{t}</div>
              <p className="mt-1 text-sm text-black/60">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-lg font-bold text-black/70">Applicant, incoming, current, helper. Next fall, you answer the question you asked.</p>
      </section>
    </main>
  );
}
