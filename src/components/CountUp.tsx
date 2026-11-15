"use client";
import { useEffect, useState } from "react";

/** Rolls a number up from zero. Anything that isn't a plain number ("—", "1 min") keeps its text around the digits. */
export function CountUp({ value }: { value: string }) {
  const m = value.match(/^(\D*)(\d+)(.*)$/);
  const target = m ? Number(m[2]) : 0;
  const [n, setN] = useState(m ? 0 : target);
  useEffect(() => {
    if (!m) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setN(target);
    const start = performance.now();
    const dur = 900 + Math.min(600, target * 8);
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  if (!m) return <>{value}</>;
  return (
    <>
      {m[1]}
      {n}
      {m[3]}
    </>
  );
}
