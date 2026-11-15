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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <div className="sticker pop tilt-l p-6">
      <h1 className="display text-3xl">Thanks for calling Call a Trojan</h1>
      <p className="mt-3 text-muted">
        We couldn&apos;t find a saved question for code <span className="font-semibold tabular-nums text-ink">{code}</span>. Ask it here and a real Trojan will reply.
      </p>
      <p className="mt-6">
        <Link href="/" className="btn btn-primary">
          Ask a question ✌️
        </Link>
      </p>
      </div>
    </main>
  );
}
