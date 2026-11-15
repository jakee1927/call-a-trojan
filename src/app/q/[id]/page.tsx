import Link from "next/link";
import { notFound } from "next/navigation";
import { Conversation } from "@/components/Conversation";
import { Nav } from "@/components/Nav";
import { SOURCES } from "@/lib/corpus";
import { db } from "@/lib/supabase-server";
import type { AskHeader, Audience } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supa = db();
  const { data: q } = await supa
    .from("questions")
    .select("id,text,audience,org_slug,route,confidence,topics,header,answer_md,status")
    .eq("id", id)
    .single();
  if (!q) notFound();
  const { data: h } = await supa.from("handoffs").select("id,status").eq("question_id", id).maybeSingle();
  const stored = (q.header ?? {}) as Partial<AskHeader>;
  const header: AskHeader = {
    route: (q.route ?? "ai") as AskHeader["route"],
    confidence: q.confidence ?? 0.5,
    topics: q.topics ?? [],
    helper_tags: stored.helper_tags ?? [],
    used_answers: stored.used_answers ?? [],
    helpers: stored.helpers ?? [],
    sources: SOURCES,
    question_id: q.id,
  };
  return (
    <main className="poster-bg min-h-screen pb-24">
      <Nav />
      <section className="mx-auto max-w-5xl px-4 pt-6">
        <Conversation
          question={q.text}
          audience={q.audience as Audience}
          header={header}
          markdown={q.answer_md ?? "_Still answering… refresh in a moment._"}
          initialHandoff={h ?? null}
          orgSlug={q.org_slug}
        />
        <div className="mt-8 text-center">
          <Link href="/" className="font-bold text-cardinal underline">Ask another question</Link>
        </div>
      </section>
    </main>
  );
}
