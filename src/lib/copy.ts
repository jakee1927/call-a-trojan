/** Async-first reply copy: from 1 AM to 9 AM Pacific, promise a morning reply. */
export function replyPromise(now = new Date()): string {
  const h = Number(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false }));
  if (h >= 1 && h < 9) return "A Trojan will reply by 9 AM.";
  return "A Trojan will reply, usually within 2 hours.";
}
