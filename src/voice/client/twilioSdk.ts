"use client";

/** Minimal typing of the Twilio Voice JS SDK surface we use. Loaded from the CDN (pinned) to avoid a new npm dep. */
export type TwilioCall = {
  on(ev: "accept" | "disconnect" | "cancel" | "reject" | "ringing", fn: (...a: unknown[]) => void): void;
  on(ev: "error", fn: (e: { code?: number; message?: string }) => void): void;
  mute(m?: boolean): void;
  disconnect(): void;
  status(): string;
};
export type TwilioDevice = {
  connect(o: { params?: Record<string, string>; rtcConstraints?: MediaStreamConstraints }): Promise<TwilioCall>;
  destroy(): void;
  on(ev: string, fn: (...a: unknown[]) => void): void;
};
type TwilioGlobal = { Device: new (token: string, opts?: Record<string, unknown>) => TwilioDevice };

const SDK_URL = "https://cdn.jsdelivr.net/npm/@twilio/voice-sdk@2.18.5/dist/twilio.min.js";
let loading: Promise<TwilioGlobal> | null = null;

export function loadTwilio(): Promise<TwilioGlobal> {
  const w = window as unknown as { Twilio?: TwilioGlobal };
  if (w.Twilio?.Device) return Promise.resolve(w.Twilio);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SDK_URL;
      s.async = true;
      s.crossOrigin = "anonymous";
      s.onload = () => (w.Twilio?.Device ? resolve(w.Twilio) : reject(new Error("Twilio SDK missing")));
      s.onerror = () => {
        loading = null;
        reject(new Error("Couldn't load the calling SDK"));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}
