"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** Shows a short "how to try it" banner when ?judge=1 is set (remembered for the tab). */
export default function JudgeStrip() {
  const params = useSearchParams();
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (params.get("judge") === "1") sessionStorage.setItem("judge", "1");
      if (params.get("judge") === "0") sessionStorage.removeItem("judge");
      setShow(sessionStorage.getItem("judge") === "1");
    } catch {
      setShow(params.get("judge") === "1");
    }
  }, [params]);
  if (!show) return null;
  return (
    <div className="sticky top-0 z-50 bg-ink text-white text-sm">
      <div className="mx-auto max-w-5xl px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-bold text-gold">Judges, try it in 60 seconds:</span>
        <span>1. Tap a suggested question and watch the two lanes.</span>
        <span>2. Hit <b>Ask a Trojan anyway</b>.</span>
        <span>3. Open <a className="underline" href="/trojan" target="_blank">/trojan</a> in another tab (passcode on the Devpost page) to answer it.</span>
        <span>4. Ask a reworded version: the Trojan&apos;s answer comes back instantly.</span>
        <button onClick={() => { try { sessionStorage.removeItem("judge"); } catch {} setShow(false); }} className="ml-auto opacity-70 hover:opacity-100">✕</button>
      </div>
    </div>
  );
}
