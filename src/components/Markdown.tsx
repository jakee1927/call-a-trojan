"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Source } from "@/lib/types";

/** Renders model Markdown, turning [S#] into source chips and [T#] into Trojan chips. */
export function Markdown({ text, sources, streaming }: { text: string; sources: Source[]; streaming?: boolean }) {
  const linked = text.replace(/\[(S\d+|T\d+)\](?!\()/g, (_m, r) => `[${r}](#ref-${r})`);
  const byRef = new Map(sources.map((s) => [s.ref, s]));
  return (
    <div className={`md text-[15px] leading-relaxed ${streaming ? "caret" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("#ref-S")) {
              const s = byRef.get(href.slice(5));
              return (
                <a
                  href={s?.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  title={s?.title}
                  className="!no-underline mx-0.5 inline-flex -translate-y-0.5 items-center rounded-md bg-cardinal/10 px-1.5 py-0 align-middle text-[11px] font-bold !text-cardinal hover:bg-cardinal hover:!text-white"
                >
                  {href.slice(6)}
                </a>
              );
            }
            if (href?.startsWith("#ref-T")) {
              return (
                <span className="mx-0.5 inline-flex -translate-y-0.5 items-center rounded-md bg-gold/40 px-1.5 align-middle text-[11px] font-bold text-ink">
                  ✓{href.slice(6)}
                </span>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
          h1: ({ children }) => <p className="font-bold">{children}</p>,
          h2: ({ children }) => <p className="font-bold">{children}</p>,
          h3: ({ children }) => <p className="font-bold">{children}</p>,
        }}
      >
        {linked}
      </ReactMarkdown>
    </div>
  );
}

export function citedSources(text: string, sources: Source[]): Source[] {
  const refs = new Set(Array.from(text.matchAll(/\[S(\d+)\]/g)).map((m) => `S${m[1]}`));
  return sources.filter((s) => refs.has(s.ref));
}
