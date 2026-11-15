#!/usr/bin/env node
/**
 * Text relay for the Call a Trojan phone line.
 *
 * US carriers block texts from our unregistered Twilio number (error 30034, until A2P 10DLC is approved), so the
 * phone line queues each text on its `calls` row (meta.text = { to, body, status: "pending" }) and this script,
 * running on a team member's Mac, sends it through the Messages app: as SMS through the paired iPhone when
 * "Text Message Forwarding" is on, else as iMessage.
 *
 * Run:  node src/voice/relay/text-relay.mjs [path/to/.env.local]
 * Env:  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; RELAY_SERVICE=auto|sms|imessage (default auto)
 * macOS asks once to let your terminal control Messages: click OK.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const envFile = process.argv[2] ?? path.resolve(".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const SERVICE = process.env.RELAY_SERVICE ?? "auto";
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const mask = (n) => `…${String(n).slice(-4)}`;
const lastSent = new Map(); // number → ms, at most one text per number per 10 minutes

// Message and number are passed as argv, never interpolated into the script.
const SCRIPT = `on run argv
  set theNumber to item 1 of argv
  set theText to item 2 of argv
  set wanted to item 3 of argv
  tell application "Messages"
    set svc to missing value
    if wanted is not "imessage" then
      try
        set svc to 1st account whose service type = SMS
      end try
    end if
    if svc is missing value then set svc to 1st account whose service type = iMessage
    send theText to participant theNumber of svc
  end tell
  return "ok"
end run`;

function send(to, body) {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", SCRIPT, to, body, SERVICE], { timeout: 20000 }, (err, stdout, stderr) =>
      resolve(err ? { ok: false, error: (stderr || err.message).trim().slice(0, 200) } : { ok: true }),
    );
  });
}

async function tick() {
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const q = `${URL_}/rest/v1/calls?select=id,meta&meta->text->>status=eq.pending&started_at=gt.${encodeURIComponent(since)}&order=started_at.asc&limit=5`;
  const res = await fetch(q, { headers });
  if (!res.ok) throw new Error(`supabase ${res.status}`);
  for (const row of await res.json()) {
    const text = row.meta?.text;
    if (!text?.to || !text?.body) continue;
    const recent = Date.now() - (lastSent.get(text.to) ?? 0) < 10 * 60_000;
    const r = recent ? { ok: false, error: "rate-limited (already texted this number in the last 10 min)" } : await send(text.to, text.body);
    if (r.ok) lastSent.set(text.to, Date.now());
    const meta = { ...row.meta, text: { ...text, status: r.ok ? "sent" : "failed", error: r.ok ? undefined : r.error, sent_at: new Date().toISOString(), via: "mac-messages" } };
    await fetch(`${URL_}/rest/v1/calls?id=eq.${row.id}`, { method: "PATCH", headers, body: JSON.stringify({ meta }) });
    console.log(new Date().toLocaleTimeString(), r.ok ? "sent" : `FAILED: ${r.error}`, "→", mask(text.to));
  }
}

console.log(`Text relay running (service: ${SERVICE}). Watching for queued texts every 3 s. Ctrl+C to stop.`);
for (;;) {
  try {
    await tick();
  } catch (e) {
    console.error("relay error:", String(e).slice(0, 200));
  }
  await new Promise((r) => setTimeout(r, 3000));
}
