import { Avatar } from "./Avatar";
import type { FaceHelper } from "@/lib/home";

export function Faces({ helpers, online, typical }: { helpers: FaceHelper[]; online: number; typical: string }) {
  const shown = helpers.slice(0, 7);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex -space-x-3">
        {shown.length ? (
          shown.map((h) => <Avatar key={h.id} name={h.name} url={h.avatar_url} size={52} online={h.online} ring />)
        ) : (
          <span className="text-sm text-black/40">Trojans are signing up…</span>
        )}
      </div>
      <div className="text-sm">
        <div className="flex items-center gap-2 text-base font-extrabold">
          {online > 0 ? <span className="live-dot" /> : <span className="h-2 w-2 rounded-full bg-gold" />}
          {online > 0 ? `${online} Trojan${online === 1 ? "" : "s"} online` : `${helpers.length} Trojans ready to help`}
          <span className="font-medium text-black/45">· typical reply {typical}</span>
        </div>
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
