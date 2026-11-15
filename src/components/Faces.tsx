"use client";
import { useState } from "react";
import { Avatar } from "./Avatar";
import type { FaceHelper } from "@/lib/home";

const LINES = ["Fight on! ✌️", "No dumb questions.", "Been there. Ask me.", "I got you.", "Hi hi hi 👋"];

/** Who is around to answer. The faces bob, and each one says something when you poke it. */
export function Faces({ helpers, online, typical }: { helpers: FaceHelper[]; online: number; typical: string }) {
  const [said, setSaid] = useState<{ id: string; text: string; n: number } | null>(null);
  // Real Trojans first; demo profiles are said to be demo.
  const shown = [...helpers].sort((a, b) => Number(a.is_demo) - Number(b.is_demo) || Number(b.online) - Number(a.online)).slice(0, 6);
  const demo = helpers.filter((h) => h.is_demo).length;
  const real = helpers.length - demo;

  function poke(h: FaceHelper) {
    const tag = h.tags?.[Math.floor(Math.random() * (h.tags?.length ?? 0))];
    const text = tag && Math.random() < 0.6 ? `Ask me about ${tag}!` : LINES[Math.floor(Math.random() * LINES.length)];
    setSaid((cur) => ({ id: h.id, text, n: (cur?.n ?? 0) + 1 }));
  }

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      {shown.length > 0 && (
        <div className="flex -space-x-2.5">
          {shown.map((h, i) => (
            <button
              key={h.id}
              onClick={() => poke(h)}
              aria-label={`Say hi to ${h.name}${h.is_demo ? " (demo profile)" : ""}`}
              className={`bob relative rounded-full border-[2.5px] border-ink bg-white ${said?.id === h.id ? "z-10" : ""}`}
              style={{ "--i": i, "--r": i % 2 ? "5deg" : "-5deg" } as React.CSSProperties}
            >
              <span key={said?.id === h.id ? said.n : 0} className={`block rounded-full ${said?.id === h.id ? "spin-once" : ""}`}>
                <Avatar name={h.name} url={h.avatar_url} size={48} />
              </span>
              {said?.id === h.id && (
                <span key={said.n} className="pop sticker absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap !rounded-xl px-2.5 py-1 text-sm font-extrabold !shadow-[3px_3px_0_var(--ink)]">
                  {h.name.split(" ")[0]}: {said.text}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <p className="leading-snug">
        <span className="display block text-xl">
          {online > 0 && <span className="live-dot mr-2 -translate-y-0.5" />}
          {shown.length === 0
            ? "Trojans are signing up"
            : online > 0
              ? `${online} Trojan${online === 1 ? "" : "s"} on shift right now`
              : `${real} Trojan${real === 1 ? "" : "s"} signed up`}
        </span>
        <span className="block text-[15px] font-medium text-muted">
          Typical reply {typical}. Poke a face.
          {demo > 0 && ` (${demo} are demo profiles.)`}
        </span>
      </p>
    </div>
  );
}
