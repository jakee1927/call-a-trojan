"use client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { browserDb } from "@/lib/supabase-browser";
import { AudioPeer, joinRoom, signal } from "./client/appRtc";
import { MIC, mmss, startTone, unlockAudio } from "./client/audio";

type Ring = { call_id: string; room: string; question: string | null; audience: string; at: number };
type State = "loading" | "signed_out" | "arming" | "waiting" | "incoming" | "connecting" | "connected" | "ended";

/**
 * The Trojan's phone, no-Twilio fallback: keep this page open (screen on) and it rings when a student calls.
 * With Twilio set up, the Trojan's real phone rings instead and this page isn't needed.
 */
export default function AnswerScreen() {
  const [state, setState] = useState<State>("loading");
  const [me, setMe] = useState<{ name: string; on_shift: boolean } | null>(null);
  const [ring, setRing] = useState<Ring | null>(null);
  const [since, setSince] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const channelName = useRef<string | null>(null);
  const ringCh = useRef<RealtimeChannel | null>(null);
  const room = useRef<RealtimeChannel | null>(null);
  const peer = useRef<AudioPeer | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const stopTone = useRef<(() => void) | null>(null);
  const stateRef = useRef<State>("loading");
  const set = (s: State) => {
    stateRef.current = s;
    setState(s);
  };

  useEffect(() => {
    fetch("/api/voice/answer", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) return set("signed_out");
        const j = await r.json();
        channelName.current = j.channel;
        setMe(j.helper);
        set("arming");
      })
      .catch(() => setErr("Couldn't reach the server."));
    return () => {
      stopTone.current?.();
      void ringCh.current?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (state !== "connected" || !since) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - since) / 1000)), 500);
    return () => clearInterval(iv);
  }, [state, since]);

  const arm = async () => {
    unlockAudio();
    if (!audioEl.current) {
      audioEl.current = new Audio();
      audioEl.current.autoplay = true;
    }
    try {
      // Keep the screen awake so the page can ring.
      await (navigator as unknown as { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request("screen");
    } catch {}
    const ch = browserDb().channel(channelName.current!, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "ring" }, (msg) => {
      const r = msg.payload as Ring;
      if (stateRef.current !== "waiting") return;
      if (Date.now() - (r.at ?? 0) > 45000) return;
      setRing(r);
      set("incoming");
      stopTone.current = startTone("ringtone");
      // Stop ringing if nobody picks up.
      setTimeout(() => {
        if (stateRef.current === "incoming") {
          stopTone.current?.();
          set("waiting");
        }
      }, 40000);
    });
    ch.subscribe((s) => {
      if (s === "SUBSCRIBED") set("waiting");
    });
    ringCh.current = ch;
  };

  const report = (status: string, callId: string) =>
    fetch("/api/voice/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ call_id: callId, status }) }).catch(() => {});

  const accept = async () => {
    if (!ring) return;
    stopTone.current?.();
    set("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC });
      mic.current = stream;
      const ch = await joinRoom(ring.room, async ({ event, payload }) => {
        if (event === "offer") {
          const p = new AudioPeer(
            ch,
            stream,
            (remote) => {
              audioEl.current!.srcObject = remote;
              void audioEl.current!.play().catch(() => {});
            },
            (cs) => {
              if (cs === "connected" && stateRef.current !== "connected") {
                set("connected");
                setSince(Date.now());
                void report("connected", ring.call_id);
              }
              if (cs === "failed") {
                setErr("Audio couldn't connect on this network. Try switching Wi-Fi/cellular.");
                hangUp();
              }
            },
          );
          peer.current = p;
          await p.onOffer(String(payload.sdp));
        } else if (event === "ice") await peer.current?.onIce(payload.c as RTCIceCandidateInit);
        else if (event === "bye") hangUp(false);
      });
      room.current = ch;
      await signal(ch, "accept");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      hangUp();
    }
  };

  const decline = async () => {
    stopTone.current?.();
    if (ring) {
      void report("declined", ring.call_id);
      try {
        const ch = await joinRoom(ring.room, () => {});
        await signal(ch, "decline");
        void ch.unsubscribe();
      } catch {}
    }
    set("waiting");
    setRing(null);
  };

  const hangUp = (notify = true) => {
    stopTone.current?.();
    if (room.current) {
      if (notify) void signal(room.current, "bye").catch(() => {});
      void room.current.unsubscribe();
      room.current = null;
    }
    peer.current?.close();
    peer.current = null;
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
    if (ring) void report("ended", ring.call_id);
    set("ended");
    setTimeout(() => {
      if (stateRef.current === "ended") {
        setRing(null);
        set("waiting");
      }
    }, 2500);
  };

  const toggleMute = () => {
    const m = !muted;
    mic.current?.getAudioTracks().forEach((t) => (t.enabled = !m));
    setMuted(m);
  };

  return (
    <main className={`flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center ${state === "incoming" ? "bg-cardinal text-white" : "text-ink"}`}>
      {state === "loading" && <p className="text-muted">Loading…</p>}
      {state === "signed_out" && (
        <p>
          Sign in as a Trojan first.{" "}
          <Link href="/trojan" className="link font-semibold">
            Open the Trojan app
          </Link>
        </p>
      )}
      {state === "arming" && (
        <>
          <h1 className="display text-4xl">Take calls{me ? `, ${me.name.split(" ")[0]}` : ""}</h1>
          {me && !me.on_shift && <p className="text-[15px] font-semibold text-cardinal">You&apos;re off shift. Go on shift in the Trojan app so students can call you.</p>}
          <button onClick={arm} data-fx="boom" className="btn btn-go btn-lg">
            Turn on ringing
          </button>
          <p className="max-w-xs text-[15px] text-muted">Keep this page open with the screen on. Phones only ring a web page while it&apos;s in front.</p>
        </>
      )}
      {state === "waiting" && (
        <>
          <h1 className="display text-3xl">
            <span className="live-dot mr-2.5 -translate-y-0.5" />
            Waiting for calls
          </h1>
          <p className="text-[15px] text-muted">On shift as {me?.name}. This page rings when a student calls.</p>
        </>
      )}
      {state === "incoming" && ring && (
        <>
          <p className="display text-2xl text-gold"><span aria-hidden className="ringing mr-2">📞</span>Incoming call</p>
          <h1 className="display slam text-[2.6rem] leading-none">A {ring.audience === "applicant" ? "future" : ring.audience === "incoming" ? "incoming" : ""} Trojan needs you</h1>
          {ring.question && <p className="max-w-sm text-lg text-white/85">“{ring.question}”</p>}
          <div className="mt-4 flex w-full max-w-sm gap-3">
            <button onClick={decline} className="btn btn-stop btn-lg flex-1">
              Decline
            </button>
            <button onClick={accept} data-fx="rain" className="btn btn-go btn-lg flex-1" style={{ animation: "hop 0.8s ease-in-out infinite" }}>
              Answer
            </button>
          </div>
        </>
      )}
      {(state === "connecting" || state === "connected") && (
        <>
          <p className="text-xl font-semibold tabular-nums">{state === "connected" ? `Connected · ${mmss(elapsed)}` : "Connecting…"}</p>
          {ring?.question && <p className="max-w-sm text-muted">“{ring.question}”</p>}
          <div className="flex gap-3">
            <button onClick={toggleMute} className={`btn btn-lg ${muted ? "btn-dark" : "btn-line"}`}>
              {muted ? "Unmute" : "Mute"}
            </button>
            <button onClick={() => hangUp()} className="btn btn-stop btn-lg">
              Hang up
            </button>
          </div>
        </>
      )}
      {state === "ended" && <p className="text-xl font-semibold">Call ended</p>}
      {err && <p className="max-w-sm text-sm font-semibold text-[#b42318]">{err}</p>}
    </main>
  );
}
