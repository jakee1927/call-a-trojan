"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type JSX } from "react";

type Props = {
  questionId?: string;
  handoffId?: string;
  audience?: "current" | "incoming" | "applicant";
  prefill?: string;
};

/** ?call= and ?stage= are remembered on this browser (see /call/stage), so they survive ask → answer card → Call navigation. */
function demoParam(k: "call" | "stage"): string | null {
  const v = new URLSearchParams(window.location.search).get(k);
  try {
    if (v === "auto" || v === "0") localStorage.removeItem(`ct_${k}`);
    else if (v) localStorage.setItem(`ct_${k}`, v);
    return v && v !== "auto" && v !== "0" ? v : localStorage.getItem(`ct_${k}`);
  } catch {
    return v;
  }
}

type Which = { mode: "human"; helper: { name: string } } | { mode: "ai" };

/**
 * "Call" — rings an on-shift human Trojan if one matches, otherwise connects the disclosed AI Trojan stand-in.
 * Demo overrides carried over from the current URL: ?call=human | ?call=ai, and ?stage=1 (listen-only on pickup).
 */
export function CallButton(props: Props): JSX.Element | null {
  const router = useRouter();
  const [which, setWhich] = useState<Which | null>(null);
  const enabled = process.env.NEXT_PUBLIC_FEATURE_CALL !== "0" && process.env.NEXT_PUBLIC_FEATURE_CALL !== "false";

  useEffect(() => {
    if (!enabled) return;
    const q = new URLSearchParams();
    if (props.questionId) q.set("questionId", props.questionId);
    if (props.handoffId) q.set("handoffId", props.handoffId);
    const force = demoParam("call");
    if (force) q.set("call", force);
    demoParam("stage");
    fetch(`/api/voice/which?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setWhich(j))
      .catch(() => {});
  }, [enabled, props.questionId, props.handoffId]);

  if (!enabled) return null;

  const go = () => {
    const q = new URLSearchParams();
    if (props.questionId) q.set("questionId", props.questionId);
    if (props.handoffId) q.set("handoffId", props.handoffId);
    if (props.audience) q.set("audience", props.audience);
    if (props.prefill && !props.questionId) q.set("prefill", props.prefill.slice(0, 400));
    for (const k of ["call", "stage"]) {
      const v = demoParam(k as "call" | "stage");
      if (v) q.set(k, v);
    }
    router.push(`/call?${q}`);
  };

  const human = which?.mode === "human";
  const label = human ? `Call ${which.helper.name.split(" ")[0]}` : which ? "Call a Trojan" : "Call";
  const sub = human ? "Live now" : which ? "AI stand-in on now" : null;

  return (
    <button
      type="button"
      onClick={go}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white shadow-sm transition ${
        human ? "bg-green-600 hover:bg-green-700" : "bg-cardinal hover:bg-cardinal-dark"
      }`}
    >
      <span aria-hidden>📞</span>
      {label}
      {sub && (
        <span className="ml-1 flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
          {human && <span className="live-dot" style={{ width: 6, height: 6 }} />}
          {sub}
        </span>
      )}
    </button>
  );
}

export default CallButton;
