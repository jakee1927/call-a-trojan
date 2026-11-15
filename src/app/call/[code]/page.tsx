import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/voice/server/calls";
import { CODE_RE, findCallByCode } from "@/voice/server/phone";

export const dynamic = "force-dynamic";

/**
 * Wait page from the phone line: call-a-trojan.vercel.app/call/4K7Q (spoken by the AI and texted).
 * Sends the caller to their saved question, where the Trojan's reply shows up.
 */
export default async function WaitPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  if (!CODE_RE.test(code)) notFound();
  const row = await findCallByCode(code);
  if (!row) notFound();
  const qid = row.meta?.handoff_question_id ?? row.question_id ?? row.meta?.last_question_id;
  if (isUuid(qid)) redirect(`/q/${qid}`);

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Thanks for calling Call a Trojan</h1>
      <p className="mt-3 text-gray-600">
        We couldn&apos;t find a saved question for code <span className="font-mono font-semibold">{code}</span>. Ask it here and a real Trojan will reply.
      </p>
      <Link href="/" className="mt-6 inline-block rounded-full bg-cardinal px-5 py-2.5 font-bold text-white">
        Ask a question
      </Link>
    </main>
  );
}
