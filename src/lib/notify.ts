import "server-only";

export function siteUrl(req?: Request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (req) {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

/** Posts to the helpers' Discord channel with @here so phones buzz. Skips quietly if unset. */
export async function notifyDiscord(content: string) {
  const hook = process.env.DISCORD_WEBHOOK_URL;
  if (!hook) return;
  try {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: ["everyone"] } }),
    });
    if (!res.ok) console.error("[discord]", res.status);
  } catch (e) {
    console.error("[discord] error", e);
  }
}

export { replyPromise } from "./copy";
