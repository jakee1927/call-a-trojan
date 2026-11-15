"use client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioPeer, joinRoom, signal } from "./appRtc";
import { MIC, saveCall, startTone } from "./audio";
import { loadTwilio, type TwilioCall, type TwilioDevice } from "./twilioSdk";

export type HumanState = "idle" | "dialing" | "ringing" | "connected" | "ended" | "error";
export type Trojan = { id: string; name: string; year: string | null; major: string | null; avatar_url: string | null; tags: string[] };

type Opts = { questionId?: string; handoffId?: string; audience?: string; prefill?: string; call?: string };

/**
 * A real call to an on-shift human Trojan.
 *  - twilio: the Trojan's actual phone rings (PSTN); this laptop joins the same private conference via the Voice SDK.
 *  - app: the Trojan's open /call/answer page rings; audio is browser-to-browser WebRTC.
 */
export function useHumanCall(opts: Opts) {
  const [state, setState] = useState<HumanState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [helper, setHelper] = useState<Trojan | null>(null);
  const [transport, setTransport] = useState<"twilio" | "app" | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [listenOnly, setListenOnlyState] = useState(false);
  const [endReason, setEndReason] = useState<string | null>(null);
  const [trial, setTrial] = useState(false);

  const stateRef = useRef<HumanState>("idle");
  const ticket = useRef<string | null>(null);
  const device = useRef<TwilioDevice | null>(null);
  const tcall = useRef<TwilioCall | null>(null);
  const ch = useRef<RealtimeChannel | null>(null);
  const peer = useRef<AudioPeer | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const stopTone = useRef<(() => void) | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const listenRef = useRef(false);
  const dialedAt = useRef(0);

  const set = (s: HumanState) => {
    stateRef.current = s;
    setState(s);
  };
  const tone = (on: boolean) => {
    stopTone.current?.();
    stopTone.current = on ? startTone("ringback") : null;
  };

  const cleanup = useCallback(() => {
    tone(false);
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
    try {
      tcall.current?.disconnect();
    } catch {}
    try {
      device.current?.destroy();
    } catch {}
    tcall.current = null;
    device.current = null;
    if (ch.current) {
      void signal(ch.current, "bye").catch(() => {});
      void ch.current.unsubscribe();
      ch.current = null;
    }
    peer.current?.close();
    peer.current = null;
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
  }, []);

  const end = useCallback(
    (reason = "hangup") => {
      if (stateRef.current === "ended" || stateRef.current === "idle") return;
      const wasConnected = stateRef.current === "connected";
      set("ended"); // before cleanup: the SDK's own "disconnect" event must not re-enter
      cleanup();
      setEndReason(reason);
      if (ticket.current) saveCall({ ticket: ticket.current, final: true, status: wasConnected ? "ended" : reason === "no-answer" ? "no-answer" : "ended", metrics: { end_reason: reason } });
    },
    [cleanup],
  );

  const markConnected = () => {
    if (stateRef.current === "connected") return;
    tone(false);
    set("connected");
    setConnectedAt(Date.now());
    if (ticket.current) saveCall({ ticket: ticket.current, final: false, status: "connected", answered: true, metrics: { ring_ms: Date.now() - dialedAt.current } });
  };

  const applyListenOnly = (on: boolean) => {
    listenRef.current = on;
    setListenOnlyState(on);
    try {
      tcall.current?.mute(on);
    } catch {}
    mic.current?.getAudioTracks().forEach((t) => (t.enabled = !on));
  };

  const start = useCallback(
    async (o?: { listenOnly?: boolean }) => {
      if (stateRef.current === "dialing" || stateRef.current === "ringing" || stateRef.current === "connected") return;
      setError(null);
      setEndReason(null);
      setConnectedAt(null);
      setElapsed(0);
      listenRef.current = !!o?.listenOnly;
      setListenOnlyState(listenRef.current);
      set("dialing");
      try {
        // Ask for the mic first so we never ring a Trojan we can't talk to.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC });
        const res = await fetch("/api/voice/ring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(opts),
        });
        const j = await res.json();
        if (!res.ok) {
          stream.getTracks().forEach((t) => t.stop());
          throw new Error(j.message || "Couldn't reach a Trojan.");
        }
        dialedAt.current = Date.now();
        ticket.current = j.ticket;
        setHelper(j.helper);
        setTransport(j.transport);
        setTrial(!!j.trial);
        set("ringing");
        tone(true);

        if (j.transport === "twilio") {
          stream.getTracks().forEach((t) => t.stop()); // the SDK opens its own mic stream
          const Twilio = await loadTwilio();
          const dev = new Twilio.Device(j.token, { codecPreferences: ["opus", "pcmu"], closeProtection: false, logLevel: "warn" });
          device.current = dev;
          dev.on("error", (e: unknown) => {
            console.error("[human-call] device", e);
            const m = (e as { message?: string })?.message;
            setError(m ? `Calling error: ${m}` : "Calling error");
          });
          const call = await dev.connect({ params: { room: j.room }, rtcConstraints: { audio: MIC } });
          tcall.current = call;
          call.on("accept", () => {
            if (listenRef.current) call.mute(true);
          });
          call.on("disconnect", () => end(stateRef.current === "connected" ? "trojan_hung_up" : "no-answer"));
          call.on("cancel", () => end("cancelled"));
          call.on("error", (e) => {
            console.error("[human-call] twilio", e);
            setError(e?.message ?? "Call error");
          });
          // The PSTN leg's real state (ringing → in-progress → completed) comes from Twilio's REST API.
          poll.current = setInterval(async () => {
            try {
              const r = await fetch(`/api/voice/status?ticket=${encodeURIComponent(ticket.current ?? "")}`, { cache: "no-store" });
              const s = await r.json();
              if (s.state === "connected") markConnected();
              else if (s.state === "ended") end(stateRef.current === "connected" ? "trojan_hung_up" : s.reason || "no-answer");
            } catch {}
          }, 1000);
        } else {
          mic.current = stream;
          if (listenRef.current) stream.getAudioTracks().forEach((t) => (t.enabled = false));
          if (!audioEl.current) {
            audioEl.current = new Audio();
            audioEl.current.autoplay = true;
          }
          const room = await joinRoom(j.room, async ({ event, payload }) => {
            if (event === "accept") {
              const p = new AudioPeer(
                room,
                stream,
                (remote) => {
                  audioEl.current!.srcObject = remote;
                  void audioEl.current!.play().catch(() => setError("Tap anywhere to hear the Trojan."));
                },
                (cs) => {
                  if (cs === "connected") markConnected();
                  if (cs === "failed") {
                    setError("Audio couldn't connect on this network (no TURN server). Try a phone hotspot.");
                    end("ice_failed");
                  }
                },
              );
              peer.current = p;
              await p.offer();
            } else if (event === "answer") await peer.current?.onAnswer(String(payload.sdp));
            else if (event === "ice") await peer.current?.onIce(payload.c as RTCIceCandidateInit);
            else if (event === "decline") end("declined");
            else if (event === "bye") end("trojan_hung_up");
          });
          ch.current = room;
        }
        // Give up ringing after 40s.
        setTimeout(() => {
          if (stateRef.current === "ringing") end("no-answer");
        }, 40000);
      } catch (e) {
        console.error("[human-call] start", e);
        cleanup();
        const msg = e instanceof Error ? e.message : String(e);
        setError(/Permission|NotAllowed/i.test(msg) ? "Microphone access is blocked. Allow the mic and try again." : msg);
        set("error");
        if (ticket.current) saveCall({ ticket: ticket.current, final: true, status: "failed", metrics: { error: msg.slice(0, 200) } });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts.questionId, opts.handoffId, opts.audience, opts.prefill, opts.call, cleanup, end],
  );

  useEffect(() => {
    if (state !== "connected" || !connectedAt) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - connectedAt) / 1000)), 500);
    return () => clearInterval(iv);
  }, [state, connectedAt]);

  useEffect(() => {
    const onHide = () => end("tab_closed");
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [end]);
  useEffect(() => () => cleanup(), [cleanup]);

  const resumeAudio = () => void audioEl.current?.play().then(() => setError(null)).catch(() => {});

  return { state, error, helper, transport, trial, elapsed, listenOnly, setListenOnly: applyListenOnly, start, end, endReason, resumeAudio };
}
