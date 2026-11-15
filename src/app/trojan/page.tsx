import type { Metadata } from "next";
import { TrojanApp } from "@/components/trojan/TrojanApp";

export const metadata: Metadata = { title: "Trojan app · Call a Trojan" };

export default function TrojanPage() {
  return <TrojanApp />;
}
