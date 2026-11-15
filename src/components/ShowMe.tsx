"use client";
import { useRef, useState } from "react";
import type { Audience } from "@/lib/types";
import { HandoffBox } from "./AnswerCard";

type Step = { n: number; text: string; box: { x: number; y: number; w: number; h: number } | null };
type Result = { what_is_this: string; answer: string; steps: Step[]; needs_trojan: boolean; sensitive_warning: string | null };

async function downscale(file: File): Promise<{ data: string; type: string; w: number; h: number; url: string }> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
  const max = 1568;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  const dataUrl = c.toDataURL("image/jpeg", 0.88);
  return { data: dataUrl.split(",")[1], type: "image/jpeg", w, h, url: dataUrl };
}

export function ShowMe({ audience, orgSlug }: { audience: Audience; orgSlug?: string | null }) {
  const [img, setImg] = useState<{ data: string; type: string; w: number; h: number; url: string } | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ question_id: string | null; result: Result } | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    setErr(null);
    setRes(null);
    try {
      setImg(await downscale(f));
    } catch {
      setErr("Couldn't open that image.");
    }
  }

  async function sample(path: string, question: string) {
    setErr(null);
    setRes(null);
    const blob = await fetch(path).then((r) => r.blob());
    setImg(await downscale(new File([blob], path.split("/").pop() ?? "sample.png", { type: blob.type })));
    setQ(question);
  }

  async function go() {
    if (!img) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/showme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: img.data, media_type: img.type, width: img.w, height: img.h, question: q, audience, org_slug: orgSlug }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Something went wrong");
      setRes(d);
      setActive(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
      <p className="mb-2 rounded-lg bg-gold/20 px-3 py-2 text-xs text-black/70">
        🔒 Crop out grades, student IDs and anything personal before you share a screenshot.
      </p>
      {!img ? (
        <button
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0]);
          }}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-black/15 py-10 text-black/50 hover:border-cardinal/40 hover:text-cardinal"
        >
          <span className="text-3xl">🖼️</span>
          <span className="font-bold">Drop a screenshot or tap to upload</span>
          <span className="text-xs">myUSC, Web Registration, OASIS, Workday…</span>
        </button>
      ) : null}
      {!img && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-black/45">Or try a sample:</span>
          <button onClick={() => sample("/demo/myusc-home.png", "Why can't I register for classes?")} className="rounded-full bg-black/5 px-3 py-1 font-semibold hover:bg-gold/40">myUSC: why can&apos;t I register?</button>
          <button onClick={() => sample("/demo/oasis.png", "Where do I check my degree progress now?")} className="rounded-full bg-black/5 px-3 py-1 font-semibold hover:bg-gold/40">OASIS: where&apos;s my degree progress?</button>
          <button onClick={() => sample("/demo/webreg-home.png", "How do I get to my course bin to register?")} className="rounded-full bg-black/5 px-3 py-1 font-semibold hover:bg-gold/40">Web Registration</button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {img && (
        <div className="space-y-3">
          <div className="relative w-full overflow-hidden rounded-xl ring-1 ring-black/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt="Your screenshot" className="block w-full" />
            {res?.result.steps.map((s) =>
              s.box ? (
                <div
                  key={s.n}
                  onMouseEnter={() => setActive(s.n)}
                  className={`absolute rounded-md border-[3px] transition ${active === null || active === s.n ? "border-cardinal bg-gold/20" : "border-cardinal/30"}`}
                  style={{
                    left: `${Math.max(0, s.box.x) * 100}%`,
                    top: `${Math.max(0, s.box.y) * 100}%`,
                    width: `${Math.min(1, s.box.w) * 100}%`,
                    height: `${Math.min(1, s.box.h) * 100}%`,
                  }}
                >
                  <span className="absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-cardinal text-xs font-black text-white shadow">{s.n}</span>
                </div>
              ) : null,
            )}
          </div>
          {!res && (
            <div className="flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="What are you trying to do here?"
                className="min-w-0 flex-1 rounded-xl bg-black/5 px-3 py-2.5 outline-none"
              />
              <button onClick={go} disabled={busy} className="rounded-xl bg-cardinal px-5 font-black text-white disabled:opacity-50">
                {busy ? "Looking…" : "Show me"}
              </button>
              <button onClick={() => { setImg(null); setRes(null); }} className="px-2 text-sm text-black/45">✕</button>
            </div>
          )}
          {err && <p className="text-sm text-red-700">{err}</p>}
          {res && (
            <div className="space-y-3">
              {res.result.sensitive_warning && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">⚠️ {res.result.sensitive_warning}</p>}
              <p className="text-[15px]"><span className="font-bold">{res.result.answer}</span> <span className="text-black/45">({res.result.what_is_this})</span></p>
              <ol className="space-y-1.5">
                {res.result.steps.map((s) => (
                  <li
                    key={s.n}
                    onMouseEnter={() => setActive(s.n)}
                    onMouseLeave={() => setActive(null)}
                    className={`flex gap-3 rounded-lg p-2 ${active === s.n ? "bg-gold/20" : ""}`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cardinal text-xs font-black text-white">{s.n}</span>
                    <span className="text-[15px]">{s.text}</span>
                  </li>
                ))}
              </ol>
              {res.question_id && (
                <HandoffBox questionId={res.question_id} audience={audience} question={q || "Screenshot question"} needsTrojan={res.result.needs_trojan} orgSlug={orgSlug} />
              )}
              <button onClick={() => { setImg(null); setRes(null); setQ(""); }} className="text-sm text-black/50 underline">Try another screenshot</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
