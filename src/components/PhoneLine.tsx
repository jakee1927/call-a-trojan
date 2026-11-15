import { FLAGS } from "@/lib/flags";

/** "+12135551234" -> "(213) 555-1234"; other shapes are shown as given. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const us = d.length === 11 && d.startsWith("1") ? d.slice(1) : d.length === 10 ? d : null;
  return us ? `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}` : raw;
}

/** "Or just call (213) xxx-xxxx" under the ask box. Hidden when there's no number or the flag is off. */
export function PhoneLine({ note = "An AI Trojan picks up and connects you to a real Trojan." }: { note?: string }) {
  const raw = (process.env.NEXT_PUBLIC_PHONE_NUMBER ?? "").trim();
  if (!FLAGS.phone || !raw) return null;
  const tel = "+" + raw.replace(/\D/g, "").replace(/^(?=\d{10}$)/, "1");
  return (
    <a href={`tel:${tel}`} data-fx="boom" className="sticker sticker-cardinal grab tilt-l inline-flex items-center gap-3 px-4 py-3">
      <span aria-hidden className="ringing text-4xl">📞</span>
      <span className="leading-tight">
        <span className="block text-sm font-extrabold text-gold">Or just call</span>
        <span className="display block whitespace-nowrap text-[1.7rem] text-white">{formatPhone(raw)}</span>
        <span className="block max-w-[30ch] text-sm text-white/85">{note}</span>
      </span>
    </a>
  );
}
