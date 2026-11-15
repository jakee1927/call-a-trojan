import Link from "next/link";
export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-cardinal px-5 text-center text-white">
      <span aria-hidden className="absolute bottom-10 left-0 text-7xl" style={{ animation: "gallop 3.5s linear infinite" }}>
        🐎
      </span>
      <p className="display slam text-[7rem] leading-none text-gold md:text-[11rem]">404</p>
      <h1 className="display text-4xl md:text-5xl">Not here, Trojan.</h1>
      <p className="max-w-[36ch] text-lg font-medium text-white/90">Traveler ran off with this page. He does that.</p>
      <Link href="/" data-fx="rain" className="btn btn-gold btn-lg">
        Back to Call a Trojan ✌️
      </Link>
    </main>
  );
}
