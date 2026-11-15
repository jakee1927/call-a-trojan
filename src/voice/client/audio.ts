"use client";

/** Mic constraints for every path: echo cancellation matters on stage (laptop speakers + phone mic). */
export const MIC: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

let ctx: AudioContext | null = null;
function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call this from a click handler (iOS needs a gesture before any sound). */
export function unlockAudio() {
  try {
    audioCtx();
  } catch {}
}

/**
 * Synthesized tones (no audio files):
 *  - "ringback": what the caller hears (US 440+480 Hz, 2s on / 4s off)
 *  - "ringtone": what the Trojan's phone page plays on an incoming call (brighter, 1s on / 1s off)
 */
/** ringback: what the caller hears while the phone rings. ringtone: incoming call. thinking: soft blip while the AI looks something up. */
export function startTone(kind: "ringback" | "ringtone" | "thinking"): () => void {
  let stopped = false;
  let osc: OscillatorNode[] = [];
  let gain: GainNode | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const [f1, f2, on, off, vol] =
    kind === "ringback" ? [440, 480, 2000, 4000, 0.08] : kind === "thinking" ? [660, 990, 90, 1300, 0.025] : [880, 1320, 900, 900, 0.18];
  const burst = () => {
    if (stopped) return;
    try {
      const c = audioCtx();
      gain = c.createGain();
      gain.gain.value = vol;
      gain.connect(c.destination);
      osc = [f1, f2].map((f) => {
        const o = c.createOscillator();
        o.frequency.value = f;
        o.connect(gain!);
        o.start();
        return o;
      });
      if (kind === "ringtone" && "vibrate" in navigator) navigator.vibrate?.([600, 300, 600]);
    } catch {}
    timer = setTimeout(() => {
      osc.forEach((o) => o.stop());
      osc = [];
      gain?.disconnect();
      timer = setTimeout(burst, off);
    }, on);
  };
  burst();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    osc.forEach((o) => {
      try {
        o.stop();
      } catch {}
    });
    gain?.disconnect();
  };
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export type Line = {
  id: string;
  role: "student" | "ai" | "trojan" | "system";
  text: string;
  done: boolean;
  at: string;
  sources?: { ref: string; url: string; title: string }[];
};

/** Fire-and-forget save that survives page unload. */
export function saveCall(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  try {
    if (payload.final && navigator.sendBeacon?.("/api/voice/end", new Blob([body], { type: "text/plain" }))) return;
  } catch {}
  void fetch("/api/voice/end", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
}
