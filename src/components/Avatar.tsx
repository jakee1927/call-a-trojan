const COLORS = ["#990000", "#8a6d00", "#7a1f1f", "#a33b00", "#5c0a0a", "#6b5a2e"];

export function Avatar({ name, url, size = 40, online, ring }: { name: string; url?: string | null; size?: number; online?: boolean; ring?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const color = COLORS[Math.abs([...name].reduce((a, c) => a + c.charCodeAt(0), 0)) % COLORS.length];
  return (
    <span className="relative inline-block shrink-0 align-middle" style={{ width: size, height: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className={`h-full w-full rounded-full object-cover ${ring ? "ring-2 ring-white" : ""}`} />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center rounded-full font-semibold leading-none text-white ${ring ? "ring-2 ring-white" : ""}`}
          style={{ background: color, fontSize: Math.max(11, size * 0.36) }}
        >
          {initials}
        </span>
      )}
      {online && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-ok ring-2 ring-white" />}
    </span>
  );
}
