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
    <div className="sticky top-0 z-50 bg-ink text-sm text-white">
      <div className="mx-auto flex max-w-4xl flex-wrap items-baseline gap-x-5 gap-y-1 px-5 py-2.5">
        <span className="display text-base text-gold">Judges, try it in 60 seconds</span>
        <span>1. Tap a suggested question and compare the two answers.</span>
        <span>2. Hit <b className="font-semibold">Ask a Trojan anyway</b>.</span>
        <span>3. Open <a className="underline underline-offset-2" href="/trojan" target="_blank">/trojan</a> in another tab (the passcode is shown on that page) to answer it.</span>
        <span>4. Ask a reworded version: the Trojan&apos;s answer comes back instantly.</span>
        <button onClick={() => { try { sessionStorage.removeItem("judge"); } catch {} setShow(false); }} className="ml-auto text-white/75 underline underline-offset-2 hover:text-white">Hide</button>
      </div>
    </div>
  );
}
