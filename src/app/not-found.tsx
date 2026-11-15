import Link from "next/link";
export default function NotFound() {
  return (
    <main className="poster-bg flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-black">Not here, Trojan.</h1>
      <Link href="/" className="font-bold text-cardinal underline">Back to Call a Trojan</Link>
    </main>
  );
}
