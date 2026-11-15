import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import JudgeStrip from "@/components/JudgeStrip";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"] });

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
      <body className={`${inter.variable} antialiased min-h-screen`}>
        <Suspense fallback={null}>
          <JudgeStrip />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
