import { AskExperience } from "@/components/AskExperience";
import { Faces } from "@/components/Faces";
import { Nav } from "@/components/Nav";
import { FLAGS } from "@/lib/flags";
import { homeData, suggestions, typicalReply } from "@/lib/home";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { helpers, online, medianReplyMin } = await homeData();
  return (
    <main className="poster-bg min-h-screen pb-24">
      <Nav active="ask" />
      <section className="mx-auto max-w-5xl px-4 pt-6 md:pt-12">
        <Faces helpers={helpers} online={online} typical={typicalReply(online, medianReplyMin)} />
        <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.02] tracking-tight md:text-6xl">
          USC&apos;s website tells you the policy.
          <br />
          <span className="text-cardinal">A Trojan tells you how it actually works.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-black/60">
          Ask anything. Our AI answers from official USC pages with sources, and when that isn&apos;t enough it stops and hands you to a real Trojan
          who&apos;s done it. <span className="font-semibold text-ink">Type it, show it, or say it.</span>
        </p>
        <div className="mt-8">
          <AskExperience suggestions={suggestions("current")} flags={{ showme: FLAGS.showme, call: FLAGS.call }} />
        </div>
      </section>
    </main>
  );
}
