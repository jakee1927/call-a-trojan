import type { Metadata } from "next";
import CallScreen from "@/voice/CallScreen";

export const metadata: Metadata = { title: "Call a Trojan · Call" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CallPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  if (process.env.NEXT_PUBLIC_FEATURE_CALL === "0" || process.env.NEXT_PUBLIC_FEATURE_CALL === "false") {
    return <main className="flex min-h-screen items-center justify-center p-6 text-center text-muted">Calling is turned off right now. Type your question instead.</main>;
  }
  const aud = one(sp.audience);
  const call = one(sp.call);
  return (
    <CallScreen
      questionId={one(sp.questionId) ?? one(sp.q)}
      handoffId={one(sp.handoffId)}
      audience={aud === "incoming" || aud === "applicant" ? aud : "current"}
      prefill={one(sp.prefill)?.slice(0, 500)}
      call={call === "ai" || call === "human" ? call : "auto"}
      stage={one(sp.stage) === "1"}
      autostart={one(sp.autostart) !== "0"}
    />
  );
}
