import type { Metadata } from "next";
import AnswerScreen from "@/voice/AnswerScreen";

export const metadata: Metadata = { title: "Call a Trojan · Take calls" };
export const dynamic = "force-dynamic";

export default function AnswerPage() {
  return <AnswerScreen />;
}
