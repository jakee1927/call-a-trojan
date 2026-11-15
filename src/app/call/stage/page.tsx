"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Pitch setup for THIS browser: /call/stage turns stage mode on (Call always rings the human Trojan,
 * laptop mic starts muted so only the phone talks). /call/stage?off=1 turns it back off.
 */
export default function StagePage() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    const off = new URLSearchParams(window.location.search).get("off") === "1";
    try {
      if (off) {
        localStorage.removeItem("ct_stage");
        localStorage.removeItem("ct_call");
      } else {
        localStorage.setItem("ct_stage", "1");
        localStorage.setItem("ct_call", "human");
      }
    } catch {}
    setOn(!off);
  }, []);
  return (
    <main className="poster-bg flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-black text-ink">Stage mode {on === null ? "…" : on ? "ON" : "OFF"}</h1>
      <p className="max-w-md text-ink/70">
        {on
          ? "On this browser, Call rings the on-shift human Trojan, and the laptop mic starts muted (listen only)."
          : "Call is back to normal: a human Trojan if one is on shift, otherwise the AI stand-in."}
      </p>
      <div className="flex gap-3">
        <Link href="/" className="rounded-full bg-cardinal px-5 py-3 font-bold text-white">
          Go to the app
        </Link>
        <Link href={on ? "/call/stage?off=1" : "/call/stage"} className="rounded-full bg-white/80 px-5 py-3 font-bold text-ink">
          Turn {on ? "off" : "on"}
        </Link>
      </div>
    </main>
  );
}
