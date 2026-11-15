"use client";
import type { JSX } from "react";
// PLACEHOLDER owned by the build session. The voice branch replaces this file on merge.
// Interface is fixed by BUILD-SPEC.md.

export function CallButton(props: {
  questionId?: string;
  handoffId?: string;
  audience?: "current" | "incoming" | "applicant";
  prefill?: string;
}): JSX.Element {
  void props;
  return (
    <button
      type="button"
      disabled
      className="inline-flex items-center gap-2 rounded-full bg-black/10 px-4 py-2 text-sm font-semibold text-black/50 cursor-not-allowed"
    >
      <span aria-hidden>📞</span> Call (coming soon)
    </button>
  );
}

export default CallButton;
