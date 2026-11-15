import { AskExperience } from "@/components/AskExperience";
import { PhoneLine } from "@/components/PhoneLine";
import { Faces } from "@/components/Faces";
import { Hero } from "@/components/Hero";
import { Footer } from "@/components/Marquee";
import { FLAGS } from "@/lib/flags";
import { HOME_PICKS, homeData, pickSuggestions, typicalReply } from "@/lib/home";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { helpers, online, medianReplyMin } = await homeData();
  return (
    <main className="min-h-screen">
      <Hero active="ask" quiet="USC's website tells you the policy." loud="A Trojan tells you how it" hot="actually" after="works.">
        <p className="mt-5 max-w-[46ch] text-lg font-medium text-white/90 md:text-xl">
          Ask anything. The AI answers from official USC pages. When that isn&apos;t enough, it taps out and hands you to a student who has done it.
        </p>
      </Hero>
      <section className="relative z-10 mx-auto -mt-20 max-w-5xl px-5">
        <AskExperience suggestions={pickSuggestions(HOME_PICKS, "current")} flags={{ showme: FLAGS.showme, call: FLAGS.call }} />
        <div className="mt-12 flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <Faces helpers={helpers} online={online} typical={typicalReply(online, medianReplyMin)} />
          <PhoneLine />
        </div>
      </section>
      <Footer />
    </main>
  );
}
