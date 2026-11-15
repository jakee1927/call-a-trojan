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
    <a
      href={`tel:${tel}`}
      className="group mt-4 flex w-full items-center gap-3 rounded-2xl border border-cardinal/15 bg-white/80 px-4 py-3 shadow-sm transition hover:border-cardinal/40 hover:bg-white md:w-auto md:inline-flex"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cardinal text-lg text-white shadow-md shadow-cardinal/30" aria-hidden>
        ☎
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-black leading-tight text-ink">
          Or just call <span className="whitespace-nowrap text-cardinal underline decoration-cardinal/30 underline-offset-4 group-hover:decoration-cardinal">{formatPhone(raw)}</span>
        </span>
        <span className="block text-xs text-black/55">{note}</span>
      </span>
    </a>
  );
}
