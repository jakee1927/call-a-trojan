import { db } from "@/lib/supabase-server";
import { getCall, isUuid } from "@/voice/server/calls";
import { say, twilioRequestOk, twiml } from "@/voice/server/phone";
import { readTicket } from "@/voice/server/pick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Played to the Trojan when they pick up a transferred call, before the caller is bridged. */
export async function POST(req: Request) {
  const params = Object.fromEntries(new URLSearchParams(await req.text()));
  if (!twilioRequestOk(req, params)) return new Response("forbidden", { status: 403 });
  const tk = readTicket(new URL(req.url).searchParams.get("t"));
  let question: string | null = null;
  if (tk?.mode === "phone") {
    const row = await getCall(tk.call_id);
    const qid = row?.meta?.handoff_question_id ?? row?.meta?.last_question_id;
    if (isUuid(qid)) {
      try {
        const { data } = await db().from("questions").select("text").eq("id", qid).maybeSingle();
        question = data?.text ?? null;
      } catch {}
    }
  }
  return twiml(
    say(
      question
        ? `Call a Trojan caller. They asked: ${question.slice(0, 200)}. The briefing is in your Trojan app. Connecting.`
        : "Call a Trojan caller. Connecting.",
    ),
  );
}
