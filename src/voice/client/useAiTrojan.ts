"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MIC, saveCall, type Line } from "./audio";

export type AiStatus = "idle" | "connecting" | "live" | "ended" | "error";

type Opts = { questionId?: string; handoffId?: string; audience?: string; prefill?: string };
type ServerEvent = { type: string; [k: string]: unknown };
type Pending = { responseId: string; name: string; output: unknown | null };

const GREETING =
  "Hey, I'm an AI Trojan stand-in. No human Trojan is on shift right now, but I'll answer from USC's official pages and what real Trojans have shared.";

const now = () => new Date().toISOString();
const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);

/**
 * The AI Trojan stand-in: OpenAI Realtime over WebRTC, straight from the browser with an ephemeral key.
 * Tool calls (lookup_usc, leave_for_trojan, end_call) are relayed to /api/voice/tool.
 */
export function useAiTrojan(opts: Opts) {
  const [status, setStatus] = useState<AiStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [speaking, setSpeaking] = useState<"student" | "ai" | null>(null);
  const [toolBusy, setToolBusy] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [maxSeconds, setMaxSeconds] = useState(300);
  const [micMuted, setMicMuted] = useState(false);
  const [handoff, setHandoff] = useState<{ handoff_id: string | null; question_id: string | null } | null>(null);
  const [lastQuestionId, setLastQuestionId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{ turnMs: number[]; toolMs: number[]; toolServerMs: number[]; connectMs: number | null }>({
    turnMs: [],
    toolMs: [],
    toolServerMs: [],
    connectMs: null,
  });

  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const ticket = useRef<string | null>(null);
  const linesRef = useRef<Line[]>([]);
  const metricsRef = useRef(metrics);
  const pending = useRef(new Map<string, Pending>());
  const doneResponses = useRef(new Set<string>());
  const speechStoppedAt = useRef<number | null>(null);
  const endAfterAudio = useRef(false);
  const aiAudioPlaying = useRef(false);
  const startedAt = useRef<number>(0);
  const wrapSent = useRef(false);
  const statusRef = useRef<AiStatus>("idle");
  const lastSourceRef = useRef<Line["sources"]>(undefined);

  const setStat = (s: AiStatus) => {
    statusRef.current = s;
    setStatus(s);
  };
  const commitLines = (fn: (prev: Line[]) => Line[]) => {
    linesRef.current = fn(linesRef.current);
    setLines(linesRef.current);
  };
  const upsert = (id: string, role: Line["role"], patch: (l: Line) => Partial<Line>) =>
    commitLines((prev) => {
      const i = prev.findIndex((l) => l.id === id);
      if (i === -1) {
        const base: Line = { id, role, text: "", done: false, at: now() };
        return [...prev, { ...base, ...patch(base) }];
      }
      const next = prev.slice();
      next[i] = { ...next[i], ...patch(next[i]) };
      return next;
    });
  const bumpMetrics = (fn: (m: typeof metrics) => typeof metrics) => {
    metricsRef.current = fn(metricsRef.current);
    setMetrics(metricsRef.current);
  };

  const send = (ev: Record<string, unknown>) => {
    if (dc.current?.readyState === "open") dc.current.send(JSON.stringify(ev));
  };

  const summary = () => {
    const m = metricsRef.current;
    return {
      turn_latency_ms: m.turnMs,
      turn_latency_median_ms: median(m.turnMs),
      tool_roundtrip_ms: m.toolMs,
      tool_roundtrip_median_ms: median(m.toolMs),
      tool_server_ms: m.toolServerMs,
      connect_ms: m.connectMs,
    };
  };
  const transcriptForSave = () =>
    linesRef.current.filter((l) => l.text.trim()).map((l) => ({ role: l.role, text: l.text, at: l.at }));

  const teardown = useCallback(() => {
    try {
      dc.current?.close();
    } catch {}
    try {
      pc.current?.getSenders().forEach((s) => s.track?.stop());
      pc.current?.close();
    } catch {}
    mic.current?.getTracks().forEach((t) => t.stop());
    if (audioEl.current) audioEl.current.srcObject = null;
    pc.current = null;
    dc.current = null;
    mic.current = null;
  }, []);

  const hangUp = useCallback(
    (reason = "hangup") => {
      if (statusRef.current === "ended" || statusRef.current === "idle") return;
      teardown();
      setStat("ended");
      setSpeaking(null);
      setToolBusy(null);
      if (ticket.current) saveCall({ ticket: ticket.current, final: true, transcript: transcriptForSave(), metrics: { ...summary(), end_reason: reason } });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teardown],
  );

  /** When every tool call of a finished response has its output, hand them back and ask for the next response. */
  const flush = () => {
    const byResp = new Map<string, [string, Pending][]>();
    pending.current.forEach((p, callId) => {
      const arr = byResp.get(p.responseId) ?? [];
      arr.push([callId, p]);
      byResp.set(p.responseId, arr);
    });
    byResp.forEach((items, respId) => {
      if (!doneResponses.current.has(respId)) return;
      if (items.some(([, p]) => p.output === null)) return;
      let needResponse = false;
      for (const [callId, p] of items) {
        send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(p.output) } });
        pending.current.delete(callId);
        if (p.name !== "end_call") needResponse = true;
      }
      if (needResponse) send({ type: "response.create" });
    });
  };

  const runTool = async (callId: string, name: string, args: string, responseId: string) => {
    pending.current.set(callId, { responseId, name, output: null });
    if (name === "end_call") {
      endAfterAudio.current = true;
      pending.current.get(callId)!.output = { ok: true };
      flush();
      // Hang up once the goodbye finishes playing (or after a short grace period).
      setTimeout(() => {
        if (endAfterAudio.current && !aiAudioPlaying.current) hangUp("ai_end_call");
      }, 1200);
      setTimeout(() => hangUp("ai_end_call"), 8000);
      return;
    }
    setToolBusy(name === "lookup_usc" ? "Checking USC's official pages…" : "Leaving it for a real Trojan…");
    const t0 = performance.now();
    let output: unknown = { error: "lookup failed" };
    try {
      const res = await fetch("/api/voice/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: ticket.current, name, arguments: args }),
      });
      const j = await res.json();
      output = j.output ?? output;
      const rt = Math.round(performance.now() - t0);
      if (name === "lookup_usc") {
        bumpMetrics((m) => ({ ...m, toolMs: [...m.toolMs, rt], toolServerMs: typeof j.ms === "number" ? [...m.toolServerMs, j.ms] : m.toolServerMs }));
        if (j.sources?.length) lastSourceRef.current = j.sources;
        if (j.question_id) setLastQuestionId(j.question_id);
      }
      if (name === "leave_for_trojan") {
        setHandoff({ handoff_id: j.handoff_id ?? null, question_id: j.question_id ?? null });
        commitLines((prev) => [...prev, { id: `sys-${callId}`, role: "system", text: "Saved for a real Trojan. Their reply will show up on your question.", done: true, at: now() }]);
      }
    } catch (e) {
      console.error("[ai-trojan] tool", e);
    }
    setToolBusy(null);
    const p = pending.current.get(callId);
    if (p) p.output = output;
    flush();
  };

  const onEvent = (ev: ServerEvent) => {
    switch (ev.type) {
      case "input_audio_buffer.speech_started": {
        setSpeaking("student");
        speechStoppedAt.current = null;
        const id = String(ev.item_id ?? `u-${Date.now()}`);
        upsert(id, "student", () => ({}));
        break;
      }
      case "input_audio_buffer.speech_stopped":
        speechStoppedAt.current = performance.now();
        setSpeaking(null);
        break;
      case "conversation.item.input_audio_transcription.delta": {
        const id = String(ev.item_id);
        upsert(id, "student", (l) => ({ text: l.text + String(ev.delta ?? "") }));
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const id = String(ev.item_id);
        upsert(id, "student", () => ({ text: String(ev.transcript ?? "").trim(), done: true }));
        break;
      }
      case "output_audio_buffer.started":
        aiAudioPlaying.current = true;
        setSpeaking("ai");
        if (speechStoppedAt.current !== null) {
          const ms = Math.round(performance.now() - speechStoppedAt.current);
          speechStoppedAt.current = null;
          bumpMetrics((m) => ({ ...m, turnMs: [...m.turnMs, ms] }));
        }
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        aiAudioPlaying.current = false;
        setSpeaking((s) => (s === "ai" ? null : s));
        if (endAfterAudio.current) setTimeout(() => hangUp("ai_end_call"), 400);
        break;
      case "response.output_audio_transcript.delta": {
        const id = String(ev.item_id);
        upsert(id, "ai", (l) => ({ text: l.text + String(ev.delta ?? ""), sources: l.sources ?? lastSourceRef.current }));
        break;
      }
      case "response.output_audio_transcript.done": {
        const id = String(ev.item_id);
        upsert(id, "ai", () => ({ text: String(ev.transcript ?? ""), done: true }));
        lastSourceRef.current = undefined;
        break;
      }
      case "response.function_call_arguments.done":
        void runTool(String(ev.call_id), String(ev.name), String(ev.arguments ?? "{}"), String(ev.response_id ?? ""));
        break;
      case "response.done": {
        const r = ev.response as { id?: string } | undefined;
        if (r?.id) doneResponses.current.add(r.id);
        flush();
        break;
      }
      case "error": {
        const err = ev.error as { message?: string; code?: string } | undefined;
        console.warn("[ai-trojan] server error", err);
        // "active response" races are harmless; anything else is worth surfacing in dev tools only.
        break;
      }
    }
  };

  const start = useCallback(async () => {
    if (statusRef.current === "connecting" || statusRef.current === "live") return;
    setError(null);
    setStat("connecting");
    linesRef.current = [];
    setLines([]);
    pending.current.clear();
    doneResponses.current.clear();
    endAfterAudio.current = false;
    wrapSent.current = false;
    const t0 = performance.now();
    try {
      const [stream, sessRes] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ audio: MIC }),
        fetch("/api/voice/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(opts),
        }),
      ]);
      mic.current = stream;
      const sess = await sessRes.json();
      if (!sessRes.ok) throw new Error(sess.message || "Couldn't start the AI Trojan.");
      ticket.current = sess.ticket;
      setMaxSeconds(sess.max_seconds ?? 300);

      const peer = new RTCPeerConnection();
      pc.current = peer;
      if (!audioEl.current) {
        audioEl.current = new Audio();
        audioEl.current.autoplay = true;
      }
      peer.ontrack = (e) => {
        audioEl.current!.srcObject = e.streams[0];
        void audioEl.current!.play().catch(() => setError("Tap anywhere to hear the AI Trojan."));
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
          if (statusRef.current === "live") hangUp("connection_" + peer.connectionState);
        }
      };
      stream.getTracks().forEach((t) => peer.addTrack(t, stream));
      const channel = peer.createDataChannel("oai-events");
      dc.current = channel;
      channel.onmessage = (m) => {
        try {
          onEvent(JSON.parse(m.data));
        } catch {}
      };
      channel.onopen = () => {
        bumpMetrics((m) => ({ ...m, connectMs: Math.round(performance.now() - t0) }));
        startedAt.current = Date.now();
        setStat("live");
        if (ticket.current) saveCall({ ticket: ticket.current, final: false, status: "connected", answered: true });
        const follow = sess.question
          ? ` Then say, briefly, that you see they asked about "${String(sess.question).slice(0, 160)}" and ask if they want you to dig into that.`
          : " Then ask what they need help with.";
        send({
          type: "response.create",
          response: {
            instructions: `Say this first, warmly and naturally, word for word: "${GREETING}"${follow} Keep it short. Don't call any tools yet.`,
          },
        });
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const sdpRes = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(sess.model)}`, {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${sess.client_secret}`, "Content-Type": "application/sdp" },
      });
      if (!sdpRes.ok) throw new Error(`Realtime connect failed (${sdpRes.status})`);
      await peer.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });
    } catch (e) {
      console.error("[ai-trojan] start", e);
      teardown();
      const msg = e instanceof Error ? e.message : String(e);
      setError(/Permission|NotAllowed/i.test(msg) ? "Microphone access is blocked. Allow the mic and try again." : msg);
      setStat("error");
      if (ticket.current) saveCall({ ticket: ticket.current, final: true, status: "failed", metrics: { error: msg.slice(0, 200) } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.questionId, opts.handoffId, opts.audience, opts.prefill, teardown, hangUp]);

  // Clock, 5-minute cap and periodic transcript checkpoint.
  useEffect(() => {
    if (status !== "live") return;
    const iv = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(s);
      if (s >= maxSeconds - 25 && !wrapSent.current) {
        wrapSent.current = true;
        send({
          type: "response.create",
          response: {
            instructions:
              "We're almost out of time on this call. In one or two short sentences: say so, offer to leave the question for a real Trojan if it's still open, and say goodbye.",
          },
        });
      }
      if (s >= maxSeconds) hangUp("time_cap");
      if (s > 0 && s % 20 === 0 && ticket.current) saveCall({ ticket: ticket.current, final: false, transcript: transcriptForSave(), metrics: summary() });
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, maxSeconds, hangUp]);

  // Save on tab close.
  useEffect(() => {
    const onUnload = () => hangUp("tab_closed");
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
    };
  }, [hangUp]);

  useEffect(() => () => teardown(), [teardown]);

  const setMuted = (m: boolean) => {
    mic.current?.getAudioTracks().forEach((t) => (t.enabled = !m));
    setMicMuted(m);
  };
  const resumeAudio = () => void audioEl.current?.play().then(() => setError(null)).catch(() => {});

  return { status, error, lines, speaking, toolBusy, elapsed, maxSeconds, metrics, micMuted, setMuted, start, hangUp, handoff, lastQuestionId, resumeAudio };
}
