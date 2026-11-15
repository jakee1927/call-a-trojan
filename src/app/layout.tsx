import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Libre_Franklin } from "next/font/google";
import { Suspense } from "react";
import JudgeStrip from "@/components/JudgeStrip";
import { FxLayer } from "@/components/Fx";
import "./globals.css";

// Franklin for reading, Bricolage Grotesque (extra bold, slightly condensed) for shouting.
const franklin = Libre_Franklin({ variable: "--font-franklin", subsets: ["latin"], display: "swap" });
const shout = Bricolage_Grotesque({ variable: "--font-shout", subsets: ["latin"], axes: ["opsz", "wdth"], display: "swap" });

export const metadata: Metadata = {
  title: "Call a Trojan",
  description: "USC's website tells you the policy. A Trojan tells you how it actually works.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Call a Trojan", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#990000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${franklin.variable} ${shout.variable} antialiased min-h-screen`}>
        <Suspense fallback={null}>
          <JudgeStrip />
        </Suspense>
        {children}
        <FxLayer />
      </body>
    </html>
  );
}
