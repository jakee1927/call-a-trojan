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
    <div>
      {!img && (
        <>
          <button
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files?.[0]);
            }}
            className="group block w-full rounded-2xl border-[3px] border-dashed border-ink bg-gold-tint px-5 py-9 text-center transition-colors hover:bg-gold"
          >
            <span aria-hidden className="bob block text-5xl group-hover:[animation-duration:0.5s]">📸</span>
            <span className="display mt-2 block text-2xl">Drop a screenshot here, or tap to pick one</span>
            <span className="mt-1 block text-sm font-medium">myUSC, Web Registration, OASIS, Workday. Crop out grades, student IDs and anything personal first.</span>
          </button>
          <p className="mt-4 text-[15px] font-medium">
            Or try a sample:{" "}
            <button onClick={() => sample("/demo/myusc-home.png", "Why can't I register for classes?")} className="link">
              myUSC, why can&apos;t I register?
            </button>
            {" · "}
            <button onClick={() => sample("/demo/oasis.png", "Where do I check my degree progress now?")} className="link">
              OASIS, where&apos;s my degree progress?
            </button>
            {" · "}
            <button onClick={() => sample("/demo/webreg-home.png", "How do I get to my course bin to register?")} className="link">
              Web Registration
            </button>
          </p>
        </>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {img && (
        <div className="space-y-4">
          <div className="pop relative w-full overflow-hidden rounded-2xl border-[2.5px] border-ink">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt="Your screenshot" className="block w-full" />
            {res?.result.steps.map((s) =>
              s.box ? (
                <div
                  key={s.n}
                  onMouseEnter={() => setActive(s.n)}
                  className={`pop absolute rounded-lg border-[3px] transition-colors ${active === null || active === s.n ? "border-cardinal bg-gold/30" : "border-cardinal/30"}`}
                  style={{
                    left: `${Math.max(0, s.box.x) * 100}%`,
                    top: `${Math.max(0, s.box.y) * 100}%`,
                    width: `${Math.min(1, s.box.w) * 100}%`,
                    height: `${Math.min(1, s.box.h) * 100}%`,
                  }}
                >
                  <span className="absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-cardinal text-xs font-semibold tabular-nums text-white">{s.n}</span>
                </div>
              ) : null,
            )}
          </div>
          {!res && (
            <div className="flex flex-wrap gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What are you trying to do here?" aria-label="What are you trying to do here?" className="field flex-1" />
              <button onClick={go} disabled={busy} data-fx="boom" className="btn btn-primary">
                {busy ? "Looking…" : "Show me"}
              </button>
              <button onClick={() => { setImg(null); setRes(null); }} className="btn text-muted hover:text-ink">
                Remove
              </button>
            </div>
          )}
          {err && <p className="text-sm text-[#b42318]">{err}</p>}
          {res && (
            <div className="space-y-4">
              {res.result.sensitive_warning && <p className="text-[15px] font-semibold text-[#b42318]">{res.result.sensitive_warning}</p>}
              <p>
                <span className="font-semibold">{res.result.answer}</span> <span className="text-muted">({res.result.what_is_this})</span>
              </p>
              <ol className="space-y-1">
                {res.result.steps.map((s) => (
                  <li
                    key={s.n}
                    onMouseEnter={() => setActive(s.n)}
                    onMouseLeave={() => setActive(null)}
                    className={`-mx-2 flex gap-3 rounded-md px-2 py-1.5 ${active === s.n ? "bg-gold-tint" : ""}`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cardinal text-xs font-semibold tabular-nums text-white">{s.n}</span>
                    <span>{s.text}</span>
                  </li>
                ))}
              </ol>
              {res.question_id && (
                <HandoffBox questionId={res.question_id} audience={audience} question={q || "Screenshot question"} needsTrojan={res.result.needs_trojan} orgSlug={orgSlug} />
              )}
              <p>
                <button onClick={() => { setImg(null); setRes(null); setQ(""); }} className="link text-[15px]">
                  Try another screenshot
                </button>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
