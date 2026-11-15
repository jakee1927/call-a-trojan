import type { Metadata } from "next";
import { TrojanApp } from "@/components/trojan/TrojanApp";

export const metadata: Metadata = { title: "Trojan app · Call a Trojan" };

// Read the passcode from the environment on each request, never at build time.
export const dynamic = "force-dynamic";

export default function TrojanPage() {
  // Demo only: the shared passcode is shown on the sign-in screen so judges can get in.
  return <TrojanApp demoPasscode={process.env.HELPER_PASSCODE?.trim() || null} />;
}
