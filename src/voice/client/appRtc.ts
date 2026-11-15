"use client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { browserDb } from "@/lib/supabase-browser";

/**
 * No-Twilio fallback: browser-to-browser audio between the student's laptop and the Trojan's phone,
 * signaled over a Supabase Realtime broadcast channel keyed by the call's random room id.
 * Events: "accept" (trojan→student), "offer" (student→trojan), "answer", "ice", "bye".
 */

function iceServers(): RTCIceServer[] {
  try {
    const extra = process.env.NEXT_PUBLIC_ICE_SERVERS ? (JSON.parse(process.env.NEXT_PUBLIC_ICE_SERVERS) as RTCIceServer[]) : [];
    return [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }, ...extra];
  } catch {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
}

export type Signal = { event: string; payload: Record<string, unknown> };

export function joinRoom(room: string, onSignal: (s: Signal) => void): Promise<RealtimeChannel> {
  const ch = browserDb().channel(`call_${room}`, { config: { broadcast: { self: false } } });
  for (const ev of ["accept", "offer", "answer", "ice", "bye", "decline"]) {
    ch.on("broadcast", { event: ev }, (msg) => onSignal({ event: ev, payload: (msg.payload ?? {}) as Record<string, unknown> }));
  }
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("Realtime channel timed out")), 8000);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(to);
        resolve(ch);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(to);
        reject(new Error(`Realtime ${status}`));
      }
    });
  });
}

export const signal = (ch: RealtimeChannel, event: string, payload: Record<string, unknown> = {}) =>
  ch.send({ type: "broadcast", event, payload });

export class AudioPeer {
  pc: RTCPeerConnection;
  private queued: RTCIceCandidateInit[] = [];
  private haveRemote = false;

  constructor(
    private ch: RealtimeChannel,
    stream: MediaStream,
    onRemote: (s: MediaStream) => void,
    onState: (s: RTCPeerConnectionState) => void,
  ) {
    this.pc = new RTCPeerConnection({ iceServers: iceServers() });
    stream.getTracks().forEach((t) => this.pc.addTrack(t, stream));
    this.pc.onicecandidate = (e) => {
      if (e.candidate) void signal(ch, "ice", { c: e.candidate.toJSON() });
    };
    this.pc.ontrack = (e) => onRemote(e.streams[0]);
    this.pc.onconnectionstatechange = () => onState(this.pc.connectionState);
  }

  async offer() {
    const o = await this.pc.createOffer();
    await this.pc.setLocalDescription(o);
    await signal(this.ch, "offer", { sdp: o.sdp });
  }

  async onOffer(sdp: string) {
    await this.pc.setRemoteDescription({ type: "offer", sdp });
    await this.drain();
    const a = await this.pc.createAnswer();
    await this.pc.setLocalDescription(a);
    await signal(this.ch, "answer", { sdp: a.sdp });
  }

  async onAnswer(sdp: string) {
    await this.pc.setRemoteDescription({ type: "answer", sdp });
    await this.drain();
  }

  async onIce(c: RTCIceCandidateInit) {
    if (!this.haveRemote) this.queued.push(c);
    else await this.pc.addIceCandidate(c).catch(() => {});
  }

  private async drain() {
    this.haveRemote = true;
    for (const c of this.queued.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
  }

  close() {
    try {
      this.pc.getSenders().forEach((s) => s.track?.stop());
      this.pc.close();
    } catch {}
  }
}
