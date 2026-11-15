import { decide, parseOverride } from "@/voice/server/pick";
import { twilioMissing } from "@/voice/server/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which path will "Call" take right now? Never returns phone numbers. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const { plan, ctx } = await decide({
    questionId: u.searchParams.get("questionId"),
    handoffId: u.searchParams.get("handoffId"),
    override: parseOverride(u.searchParams.get("call")),
  });
  return Response.json({
    ...plan,
    question: ctx.question,
    ai_ready: !!process.env.OPENAI_API_KEY,
    twilio_ready: twilioMissing().length === 0,
  });
}
