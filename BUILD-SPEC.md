# Call a Trojan: build spec (the contract every session builds to)

Written Sat Nov 14, 2026, 6:15 PM PT. **Deadline: Sun Nov 15, 11:00 AM PT on Devpost.**
`plan/PLAN.md` is the product plan and `plan/RUBRIC.md` is the judging rubric. **Where they differ, this file wins.**

## What changed since PLAN.md (decided by Jake at 6 PM)
- **No QR codes. No "Ask HackSC" desk.** The only org front desk is **USG** at `/org/usg`, and only if the scraped USG data is rich enough. Otherwise skip it.
- **AI Trojan stand-in (voice).** When no human Trojan is on shift (for example judges trying the live link Sunday morning before the pitches), "Call" connects to an **AI Trojan** built on OpenAI's realtime voice API. Its first sentence always says it's an AI Trojan stand-in. It answers only from our grounded sources.
- **Live pitch = a real call.** On stage, Jake asks a question on his laptop (as a student) and the app **rings Jake's phone**. He answers and holds the phone to his ear, and his voice plays through the laptop to the auditorium.
- **Daily video is cut.** The voice call replaces it. Chat stays.
- **Two apps in one Next.js codebase:** the **Ask app** at `/` (students and future Trojans) and the **Trojan app** at `/trojan` (helpers). One deploy, one database.
- **Data comes from Haiku scrape agents** writing to `data/` (see below). No local Qwen.

## Repo layout and ownership (so parallel sessions don't collide)
This folder is the git repo. The Next.js app lives at the repo root.

| Path | Owner |
|---|---|
| `src/voice/**`, `src/app/api/voice/**`, `src/app/call/**` | **Voice session (Opus)**, on its own branch, merged later |
| `data/**` | **Scrape agents (Haiku)**, run by the lead session |
| Everything else (`src/app/**`, `src/lib/**`, `supabase/**`, config) | **Build session (Fable)** |
| `BUILD-SPEC.md`, `plan/**` | Lead session. Others may append to the "Open questions" section only |

- The build session may create **one placeholder file**, `src/voice/CallButton.tsx`, matching the interface below. On merge, the voice branch's version wins.
- Commit often with specific paths. Never commit `.env*` files or keys.

## Routes
**Ask app (students, future Trojans)**
- `/`: faces-first home ("N Trojans online · typical reply X"), one ask box with three modes: **Type · Show me · Call**, an audience toggle (Current · Incoming · Applicant) and three suggested questions that exercise different routes.
- `/q/[id]`: the answer card (two lanes: **USC says** with `[S#]` citations, **Trojans say** with verified answers) plus the handoff status and chat.
- `/future`: the landing page for high-school applicants and admitted students, which opens the ask box in applicant mode.
- `/org/usg`: the ask page scoped to USG (only if the data supports it).
- `/insights`: the USG dashboard plus the auto-generated gap report "Questions USC's websites can't answer."

**Trojan app (helpers)**
- `/trojan`: passcode sign-in, then a profile (name, year, major, "ask me about" tags, phone for calls), an on-shift toggle and a live inbox of handoffs with briefing cards.
- `/trojan/h/[id]`: claim, chat, end, then **Approve or edit** the Claude-drafted de-identified Q&A, which becomes a verified answer.

**API (build session)**
- `POST /api/ask`: streaming. The first line is a JSON header `{"route":"ai"|"trojan"|"both","confidence":0-1,"topics":[],"helper_tags":[],"used_answers":[]}`, then Markdown with `[S#]` and `[T#]` refs.
- `POST /api/ask/text`: **the same, non-streaming**, returning
  `{ route, confidence, answer_markdown, sources:[{ref,url,title}], used_answers:[{ref,id,helper_name}], helpers:[{id,name,why}] }`.
  The voice session calls this as its grounding tool. Keep the shape stable.
- `POST /api/handoff` creates a handoff, writes the briefing and notifies helpers. Plus claim, close, approve and message routes as needed.

**API and UI (voice session)**
- `POST /api/voice/session`: mints a short-lived OpenAI realtime client secret. The real `OPENAI_API_KEY` never reaches the browser.
- `POST /api/voice/tool`: the server side of the AI Trojan's tool calls (it calls `/api/ask/text` logic).
- `POST /api/voice/ring`: starts a call to a human Trojan.
- `/call`: the call screen.
- Component: `export function CallButton(props: { questionId?: string; handoffId?: string; audience?: "current"|"incoming"|"applicant"; prefill?: string }): JSX.Element` from `src/voice/CallButton.tsx`.
  - If a human Trojan who matches is on shift, it rings them.
  - Otherwise it connects the AI Trojan stand-in.

## Data model (Supabase Postgres, RLS on)
- `helpers`: id, name, year, major, tags[], org_slug, avatar_url, phone (**private**), on_shift_until, is_ai bool
- `orgs`: slug, name, info_md
- `questions`: id, text, audience, org_slug, route, confidence, topics[], status, image_url, created_at
- `handoffs`: id, question_id, helper_id, briefing, status, claimed_at, closed_at
- `messages`: id, handoff_id, sender, body, created_at
- `verified_answers`: id, question, answer, helper_id, audience, topics[], approved_at, expires_at, uses, reports
- `calls`: id, question_id, handoff_id, mode ('ai'|'human'), status, started_at, ended_at, transcript (**owned by the voice session**; it may add this table in its own migration file)
- `usage_log`: route, model, input_tokens, cache_read_tokens, output_tokens, cost_usd, created_at

**Access**
- Anon may select only `orgs`, `verified_answers`, and a `public_helpers` view (no phone column) plus aggregate views.
- Everything else is written and read through server routes with the service key.
- Chat uses Realtime broadcast channels keyed by the handoff UUID.

## Environment variables (names are fixed; values only in `.env.local` and Vercel)
```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
HELPER_PASSCODE=
DISCORD_WEBHOOK_URL=
# voice session adds its own (e.g. TWILIO_*) to .env.example
NEXT_PUBLIC_FEATURE_SHOWME=1
NEXT_PUBLIC_FEATURE_CALL=1
NEXT_PUBLIC_FEATURE_FUTURE=1
NEXT_PUBLIC_FEATURE_ORG_USG=1
```
**Secrets rule:** never print, echo, log or commit a key. Ask Jake to paste keys into `.env.local` himself and to run `vercel env add` (or do it from `.env.local` without displaying values). Don't copy anything from `~/Documents/CollegeConnect`. Under the originality rule, all code is written fresh this weekend.

## AI (Claude) rules
- Use `@anthropic-ai/sdk` with model `claude-opus-5-5`, `thinking: {type: "adaptive"}` and streaming.
  - `effort: "low"` for ask.
  - `effort: "medium"` for vision, briefing, the approve draft and the gap report.
- Prompt layout:
  1. system prompt plus all `data/pages/*.json` text behind one `cache_control` breakpoint;
  2. the USG org info, all non-expired verified answers and the audience persona;
  3. the question and any image.
- Use our own `[S#]` refs. Do not use the API citations feature.
- Log `usage` to `usage_log` on every call.
- **A Trojan answer never overrides an official fact.** The applicant persona doesn't ghostwrite essays and never shares contact details.

## Data contract (written by the scrape agents into `data/`)
- `data/pages/<area>--<slug>.json`:
  ```json
  { "id": "<area>--<slug>", "url": "https://...", "title": "...", "area": "academics|incoming-admissions|student-life|usg-orgs",
    "audiences": ["current","incoming","applicant"], "topics": ["registration","d-clearance"],
    "fetched_at": "2026-11-14T18:30:00-08:00", "text": "cleaned factual content, <= ~16,000 chars" }
  ```
- `data/seed-questions/<area>.json` holds `[{ "question": "...", "audience": "current|incoming|applicant", "expected_route": "ai|trojan|both", "why": "...", "source_ids": ["..."] }]`. These are used for suggested questions and the 40-question accuracy run.
- `data/orgs/usg.json` holds `{ "slug": "usg", "name": "Undergraduate Student Government", "info_md": "...", "source_ids": [...] }`.
- `data/REPORT-<area>.md` covers what was fetched, what failed and the gaps.
- The total text across all pages should land around 60–100k tokens. If it's larger, the build session picks the best pages.

## Clock (cut rules are fixed times, however behind we are)
| Time (PT) | Milestone |
|---|---|
| 6:15–7:30 PM | Scaffold, Supabase schema + RLS, Vercel deploy, first-hour tests. Data lands in `data/` |
| 7:30–10:30 | Core loop end to end on the deployed link: ask, then the two-lane card, then the handoff, then the Trojan app inbox, then chat, then approve, then a reworded question returns the verified answer |
| **10:30 rule** | If the core loop isn't end to end on the deployed link, everything else stops until it is |
| 10:30–11:30 | Insights + gap report, Show me, `/future`, USG desk. **Voice branch merged by 11:30** |
| **11:30 rule** | A mode that doesn't work on the deployed link gets its feature flag set to 0 |
| 11:30 PM–1:30 AM | Polish, record footage, rollback tag |
| **1:30 AM** | **Feature freeze** |
| 7:00–11:00 AM | Accuracy run, video, deck, Devpost, submit by 10:30 |

## Open questions (append here)
- 
