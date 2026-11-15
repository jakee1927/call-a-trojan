import "server-only";
import crypto from "node:crypto";

/**
 * Minimal Twilio client (no SDK dependency): access-token JWTs for the browser Voice SDK,
 * REST calls to dial / poll / hang up the PSTN leg, and webhook signature validation.
 */

export type TwilioEnv = {
  accountSid: string;
  authToken: string;
  keySid: string;
  keySecret: string;
  appSid: string;
  from: string;
};

export function twilioEnv(): TwilioEnv | null {
  const e = {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    keySid: process.env.TWILIO_API_KEY_SID ?? "",
    keySecret: process.env.TWILIO_API_KEY_SECRET ?? "",
    appSid: process.env.TWILIO_TWIML_APP_SID ?? "",
    from: process.env.TWILIO_FROM_NUMBER ?? "",
  };
  if (!e.accountSid || !e.keySid || !e.keySecret || !e.appSid || !e.from) return null;
  return e;
}

/** Which Twilio env vars are missing (names only, never values). */
export function twilioMissing(): string[] {
  return [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_API_KEY_SID",
    "TWILIO_API_KEY_SECRET",
    "TWILIO_TWIML_APP_SID",
    "TWILIO_FROM_NUMBER",
  ].filter((k) => !process.env[k]);
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Voice SDK access token (Twilio "fpa" JWT) with an outgoing grant to our TwiML app. */
export function voiceAccessToken(env: TwilioEnv, identity: string, ttlSeconds = 600): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" };
  const payload = {
    jti: `${env.keySid}-${now}`,
    iss: env.keySid,
    sub: env.accountSid,
    iat: now,
    exp: now + ttlSeconds,
    grants: { identity, voice: { outgoing: { application_sid: env.appSid } } },
  };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.createHmac("sha256", env.keySecret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

async function rest(env: TwilioEnv, path: string, form?: Record<string, string>) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}${path}`;
  const auth = Buffer.from(`${env.keySid}:${env.keySecret}`).toString("base64");
  const res = await fetch(url, {
    method: form ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = `${res.status} ${json.code ?? ""} ${json.message ?? ""}`.trim();
    throw new Error(`twilio ${path}: ${msg}`);
  }
  return json;
}

let accountType: Promise<string | null> | null = null;
/** "Trial" or "Full" (cached). Trial calls play a preamble and wait for a keypress on the callee's phone. */
export function twilioAccountType(env: TwilioEnv): Promise<string | null> {
  if (!accountType) {
    accountType = fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}.json`, {
      // Standard API keys can't read the Account resource (401), so this one request uses the auth token.
      headers: {
        Authorization: `Basic ${Buffer.from(env.authToken ? `${env.accountSid}:${env.authToken}` : `${env.keySid}:${env.keySecret}`).toString("base64")}`,
      },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.type ? String(j.type) : null))
      .catch(() => null);
    void accountType.then((t) => {
      if (!t) accountType = null; // retry next time
    });
  }
  return accountType;
}

export async function createCall(env: TwilioEnv, to: string, twiml: string, timeoutSec = 30) {
  const r = await rest(env, "/Calls.json", { To: to, From: env.from, Twiml: twiml, Timeout: String(timeoutSec) });
  return { sid: String(r.sid), status: String(r.status) };
}

export async function fetchCall(env: TwilioEnv, sid: string) {
  const r = await rest(env, `/Calls/${encodeURIComponent(sid)}.json`);
  return { status: String(r.status), duration: r.duration ? Number(r.duration) : null };
}

export async function hangUp(env: TwilioEnv, sid: string) {
  try {
    await rest(env, `/Calls/${encodeURIComponent(sid)}.json`, { Status: "completed" });
  } catch {
    // still ringing/queued calls need "canceled"
    await rest(env, `/Calls/${encodeURIComponent(sid)}.json`, { Status: "canceled" }).catch(() => {});
  }
}

/** X-Twilio-Signature check. Tries each candidate URL (proxies can rewrite host/proto). */
export function validTwilioSignature(
  authToken: string,
  signature: string | null,
  urls: string[],
  params: Record<string, string>,
): boolean {
  if (!signature || !authToken) return false;
  const tail = Object.keys(params)
    .sort()
    .map((k) => k + params[k])
    .join("");
  return urls.some((u) => {
    const want = crypto.createHmac("sha1", authToken).update(u + tail).digest("base64");
    return want.length === signature.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(signature));
  });
}

export function xmlEscape(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

/** TwiML that drops a leg into the call's private conference room. */
export function conferenceTwiml(room: string, opts: { say?: string } = {}) {
  const say = opts.say ? `<Say>${xmlEscape(opts.say)}</Say>` : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>${say}<Dial>` +
    `<Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl="">${xmlEscape(room)}</Conference>` +
    `</Dial></Response>`
  );
}
