import "server-only";
import corpus from "@/generated/corpus.json";

export type Page = {
  id: string;
  url: string;
  title: string;
  area: string;
  audiences: string[];
  topics: string[];
  fetched_at: string | null;
  text: string;
};
export type SeedQuestion = {
  question: string;
  audience: "current" | "incoming" | "applicant";
  expected_route: "ai" | "trojan" | "both";
  why?: string;
  source_ids?: string[];
  area?: string;
};
export type OrgData = { slug: string; name: string; info_md: string; source_ids?: string[]; rich_enough_for_desk?: boolean };

const data = corpus as unknown as { pages: Page[]; seedQuestions: SeedQuestion[]; usg: OrgData | null };

export const PAGES: Page[] = data.pages;
export const SEED_QUESTIONS: SeedQuestion[] = data.seedQuestions;
export const USG: OrgData | null = data.usg;

/** S-ref → page. S1 is PAGES[0]; order is deterministic (sorted file names). */
export const SOURCES = PAGES.map((p, i) => ({ ref: `S${i + 1}`, url: p.url, title: p.title }));
