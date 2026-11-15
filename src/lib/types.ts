export type Audience = "current" | "incoming" | "applicant";
export type Route = "ai" | "trojan" | "both";

export type Source = { ref: string; url: string; title: string };

export type UsedAnswer = {
  ref: string;
  id: string;
  helper_name: string;
  helper_major?: string | null;
  helper_year?: string | null;
  question: string;
  answer: string;
  approved_at: string;
  is_sample: boolean;
};

export type MatchedHelper = {
  id: string;
  name: string;
  why: string;
  year?: string | null;
  major?: string | null;
  tags?: string[];
  avatar_url?: string | null;
  online?: boolean;
  is_demo?: boolean;
};

/** First line of the /api/ask stream (model header enriched by the server). */
export type AskHeader = {
  route: Route;
  confidence: number;
  topics: string[];
  helper_tags: string[];
  used_answers: UsedAnswer[];
  helpers: MatchedHelper[];
  sources: Source[];
  question_id: string;
};

/** Shape of POST /api/ask/text (contract with the voice session; keep stable). */
export type AskTextResult = {
  route: Route;
  confidence: number;
  answer_markdown: string;
  sources: { ref: string; url: string; title: string }[];
  used_answers: { ref: string; id: string; helper_name: string }[];
  helpers: { id: string; name: string; why: string }[];
  question_id?: string;
};

export type Briefing = {
  title: string;
  asked: string;
  ai_said: string;
  still_open: string;
  tags: string[];
  audience: Audience;
};

export type QADraft = { question: string; answer: string; topics: string[] };
