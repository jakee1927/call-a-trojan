import { Avatar } from "./Avatar";
import type { FaceHelper } from "@/lib/home";

/** Who is around to answer. */
export function Faces({ helpers, online, typical }: { helpers: FaceHelper[]; online: number; typical: string }) {
  // Real Trojans first; demo profiles are said to be demo.
  const shown = [...helpers].sort((a, b) => Number(a.is_demo) - Number(b.is_demo) || Number(b.online) - Number(a.online)).slice(0, 6);
  const demo = helpers.filter((h) => h.is_demo).length;
  const real = helpers.length - demo;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      {shown.length > 0 && (
        <div className="flex -space-x-2.5">
          {shown.map((h) => (
            <span
              key={h.id}
              title={`${h.name}${h.is_demo ? " (demo profile)" : ""}`}
              className="relative rounded-full border-[2.5px] border-ink bg-white"
            >
              <Avatar name={h.name} url={h.avatar_url} size={48} />
            </span>
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
          Typical reply {typical}.
          {demo > 0 && ` (${demo} are demo profiles.)`}
        </span>
      </p>
    </div>
  );
}
