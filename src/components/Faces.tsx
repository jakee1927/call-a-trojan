import { Avatar } from "./Avatar";
import type { FaceHelper } from "@/lib/home";

export function Faces({ helpers, online, typical }: { helpers: FaceHelper[]; online: number; typical: string }) {
  // Real Trojans first; demo profiles are labeled as such.
  const shown = [...helpers].sort((a, b) => Number(a.is_demo) - Number(b.is_demo) || Number(b.online) - Number(a.online)).slice(0, 7);
  const demo = helpers.filter((h) => h.is_demo).length;
  const real = helpers.length - demo;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex -space-x-3">
        {shown.length ? (
          shown.map((h) => <span key={h.id} title={h.is_demo ? `${h.name} (demo profile)` : h.name}>
              <Avatar name={h.name} url={h.avatar_url} size={52} online={h.online} ring />
            </span>)
        ) : (
          <span className="text-sm text-black/40">Trojans are signing up…</span>
        )}
      </div>
      <div className="text-sm">
        <div className="flex items-center gap-2 text-base font-extrabold">
          {online > 0 ? <span className="live-dot" /> : <span className="h-2 w-2 rounded-full bg-gold" />}
          {online > 0 ? `${online} Trojan${online === 1 ? "" : "s"} on shift now` : `${real} Trojan${real === 1 ? "" : "s"} signed up`}
          <span className="font-medium text-black/45">· typical reply {typical}</span>
        </div>
        {demo > 0 && (
          <div className="text-xs text-black/45">
            plus {demo} <span className="rounded bg-black/10 px-1 font-bold uppercase tracking-wide text-black/50">demo</span> profiles for the hackathon demo
          </div>
        )}
        <div className="mt-0.5 flex max-w-xl flex-wrap gap-1 text-xs text-black/55">
          {Array.from(new Set(shown.flatMap((h) => h.tags))).slice(0, 8).map((t) => (
            <span key={t} className="rounded-full bg-white/80 px-2 py-0.5 ring-1 ring-black/5">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
