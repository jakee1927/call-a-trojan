# Call a Trojan: build plan (v1)

## One-liner
Ask anything about USC and get an answer from AI that has learned from real Trojans. When the AI isn't sure, or the question needs lived experience, it puts you through to a Trojan who has done exactly that, live.

For current Trojans (students) and future Trojans (applicants).

## The problem
- USC information is spread across hundreds of pages (registrar, OASIS, housing, Viterbi and Dornsife advising, 1,000+ orgs on Engage). Official pages explain the policy, not how things actually work ("the D-clearance trick", "which housing is worth the waitlist").
- The best answers live in upperclassmen's heads and get passed down only if you know the right person. Transfers, first-gen and international students are the least likely to know that person.
- Student orgs struggle to reach students who would want to join, and those students don't know the orgs exist.
- Applicants (future Trojans) rely on Reddit and paid consultants. They rarely talk to an actual Trojan.

## Core features (all four in scope)

### 1. AI router and "Trojan Match" (the AI routes, not just answers)
- The student asks a question by text or voice.
- Claude classifies it as one of three kinds:
  - a **fact**, answered from official sources with citations;
  - **lived experience** ("is it worth it", "what's it actually like", "how did you…"), which needs a Trojan;
  - **unknown**, where Claude can't answer confidently.
- It answers what it can, with citations and a confidence level, then matches the student to the best helpers by their "ask me about" tags (major, year, transfer/international/first-gen, orgs, experiences). It shows "Maya ('27, switched Bio→CS) is online. Talk to her?"
- On handoff, it writes a **briefing card** for the helper: what the student asked, what the AI already told them, and what's still open.

### 2. Trojan-verified answers (the knowledge flywheel)
- After a human conversation, with both sides' consent, Claude writes a de-identified Q&A summary. The helper approves or edits it in one tap.
- The approved answer goes into the knowledge base labeled "✓ Verified by a Trojan · CS '27 · Nov 2026".
- The next student with the same question gets the verified answer instantly, ranked above generic sources.
- Pitch line: **"Our AI learns from Trojans, not from the internet."**

### 3. Screen-aware help ("Show me")
- The student shares a browser tab (getDisplayMedia) or uploads a screenshot, for example of the OASIS/Workday registration screen, the housing portal, a D-clearance form or the Common App.
- Claude vision returns step-by-step guidance plus bounding boxes, which the app draws as numbered overlays on the screenshot ("1. Click here").
- During a human call, the helper sees the same screenshot with the annotations.

### 4. Voice: "Call" the AI
- The student taps a big Call button and talks.
- Speech-to-text, then Claude (streaming), then TTS.
- Mid-call, the AI can say "Let me get you a Trojan who's done this." It plays a hold tone, connects the student to a helper, and shows the helper the briefing card. This is the "warm transfer."

## Extra pieces
- **USG insights dashboard**: anonymized topic clusters ("spring housing ↑ 40 this week"), questions the AI couldn't answer, and the share answered by AI vs. Trojans vs. unanswered. It gives USG something it can act on.
- **Org demand feed**: "23 students asked about consulting clubs this week." An org can claim a topic and become the helper for it, which doubles as recruiting.
- **Future Trojans mode**: the same engine with an applicant persona and its own sources (admissions, programs). A "Why USC?" specificity check flags generic lines and suggests real programs, never writing for the student. Minors get AI plus text chat with vetted ambassadors, not open video.
- **Unanswered question bounty**: questions the AI can't answer get posted to helpers. The first good answer becomes a verified answer.

## Tech stack
- **Next.js (App Router, TypeScript) on Vercel.** It gives a working prototype link in minutes.
- **Claude API** via `@anthropic-ai/sdk`, using `claude-opus-5-5` with adaptive thinking. Effort is `low` for routing and chat and `medium` for vision. Responses stream. Server-side `fallbacks: "default"` handles refusals.
- **Knowledge base**: about 100 to 200 curated public USC pages scraped today into Markdown. They go into one cached system prompt (prompt caching) instead of a vector DB, because 1M context makes that simpler and faster to build. Verified answers are stored in a database and injected ahead of the official sources.
- **Database and realtime**: Supabase (Postgres plus realtime channels) for helpers, presence (online/offline), call requests, chat messages and verified answers.
- **Live human connection**: in-app realtime chat plus optional video through LiveKit Cloud free tier, or Daily.co if LiveKit setup is slow.
- **Voice**: browser Web Speech API for speech-to-text and ElevenLabs TTS. As a fallback, browser speechSynthesis.
- **Vision**: Claude image input, prompted to return JSON `{steps:[{text, box:[x,y,w,h] normalized}]}` through structured outputs.
- **Auth**: a magic link or just a name for the demo. USC email restriction for helpers is pitched, not built.

## Data model (Supabase)
- `helpers`: id, name, year, major, tags[], bio, online_until
- `questions`: id, text, audience (current|future), category, confidence, answered_by (ai|trojan|none), created_at
- `conversations`: id, question_id, helper_id, status, briefing, transcript (temporary)
- `verified_answers`: id, question_pattern, answer, helper_label, approved_at, uses
- `events`: for the dashboard

## Demo script (3 minutes)
1. Hook (15 s): "Every Trojan has a question only another Trojan can answer."
2. Text question → AI answer with citations, plus a verified-answer badge (30 s).
3. Screenshot of a registration screen → numbered overlays (30 s).
4. Voice call → AI answers → "this needs a Trojan" → warm transfer to a live helper on a second laptop, who sees the briefing (45 s).
5. After the call → one-tap verified answer → asking the same question again returns it instantly (20 s).
6. USG dashboard + future Trojans mode (25 s).
7. Close: adoption path with USG (15 s).

## Build timeline (Sat 2 PM → Sun 11 AM)
| Time | Work |
|---|---|
| 2:00–3:30 PM | Scaffold Next.js app, deploy to Vercel, set up Supabase schema, scrape the USC sources |
| 3:30–6:00 PM | Feature 1: router + cached-knowledge answers + helper matching + briefing |
| 6:00–8:00 PM | Feature 2: helper app, live chat handoff, verified answer flow |
| 8:00–10:00 PM | Feature 3: screen share/screenshot + vision overlays |
| 10:00 PM–12:30 AM | Feature 4: voice call + warm transfer |
| 12:30–1:30 AM | Dashboard, future Trojans mode, seed data |
| 1:30–6:30 AM | Sleep |
| 6:30–8:30 AM | Polish, bug fixes, seed real helpers (friends) |
| 8:30–10:30 AM | Record video, deck, Devpost write-up, images |
| 10:30–11:00 AM | Submit |

## Risks
- Four features in 12 hours of build time is ambitious.
- Live demo fragility with voice, realtime and video.
- Accuracy of USC-specific answers, and hallucinated policies.
- Privacy and safety: minors, and consent to summarize conversations.
- Cold start: no helpers on day one.
