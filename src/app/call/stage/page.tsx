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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-5">
      <h1 className="display text-4xl">Stage mode is {on === null ? "…" : on ? "on" : "off"}</h1>
      <p className="text-muted">
        {on
          ? "On this browser, Call rings the on-shift human Trojan, and the laptop mic starts muted (listen only)."
          : "Call is back to normal: a human Trojan if one is on shift, otherwise the AI stand-in."}
      </p>
      <div className="flex gap-2">
        <Link href="/" className="btn btn-primary">
          Go to the app
        </Link>
        <Link href={on ? "/call/stage?off=1" : "/call/stage"} className="btn btn-line">
          Turn {on ? "off" : "on"}
        </Link>
      </div>
    </main>
  );
}
