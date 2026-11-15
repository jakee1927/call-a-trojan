# Call a Trojan: build plan (v2)

## One-liner
Every other team built an AI that answers. Ours knows when to stop and **hand you to a Trojan who's done it**, and every answer that Trojan gives makes the AI smarter for the next student.

## The problem
- USC's official pages explain policy, not how things actually work. The real answers live in upperclassmen's heads. Transfers, spring admits, first-gen and international students are least likely to know the right person.
- Student orgs can't reach the students who would join, and those students can't find the orgs. Officers answer the same five DMs every semester.
- USG has no data on what students are confused about this week.

**Demo persona:** Maya-the-asker is a **spring-admit transfer**: new in January, no friends from freshman year, registration opens in days.

## Who the helpers are (the cold-start answer)
People who already have a reason to answer:
- **Org officers.** Answering is recruiting. "Ask [our org]" puts them in front of students who want to join.
- **Peer advisors, RAs, orientation leaders and USG senators.** Answering students is already their job, and this gives them a log and a shared answer bank.
- **Any Trojan** can sign up with "ask me about" tags.

**Async first, live when possible.** The default handoff is "A Trojan will reply. Usually within 2 hours, and we'll notify you." When a matching helper is on shift, the student can chat live now or open a video room. This makes it work at 11 PM with zero helpers online, which is the first question USG will ask.

## The core loop (must be real and flawless)
1. **Home screen is faces first.** At the top: "**N Trojans online now**" with avatars, years and "ask me about" tags. Below that is the ask box, with three suggested questions for the transfer persona.
2. **Ask** (text). Claude answers in **one streaming call** that also classifies the question. The answer card has two lanes:
   - **USC says**: an answer from the official sources, with numbered citations linking to usc.edu pages.
   - **Trojans say**: matching **Trojan-verified answers**, labeled as experience, not policy. Each shows "✓ Verified by Maya · CS '27 · Nov 2026", expires after one semester and has a report flag. **A Trojan answer can never override an official fact.**
   - If the question needs lived experience or Claude isn't confident: "**This one needs a Trojan.**" It shows the top 2–3 matched helpers with the reason for each match ("transferred from SMC, did CS D-clearance").
3. **Hand off.** Claude writes a **briefing card** for the helper: what the student asked, what the AI already said and what's still open. The helper gets it in the **helper inbox** (a realtime list), claims it and replies. The chat is realtime, with a "Start video" button that opens a pre-made Daily room.
4. **Flywheel.** When the chat ends, Claude drafts a de-identified Q&A. The helper taps **Approve** (or edits it), and it becomes a verified answer.
5. **Payoff.** In another browser, the student asks a reworded version of the question and gets the verified answer in the "Trojans say" lane instantly.

## Tier 1: build first (by about 9 PM)
- The core loop above, for **current Trojans**
- **Org front desk.** Each org gets an `/org/[slug]` page with an "Ask [org]" box and a QR code. The AI answers from the org's info and its officers' verified answers, and routes misses to that org's officers. Seed it with three real orgs whose officers agree today.
- **USG dashboard (`/insights`).** Questions asked, % answered by AI / Trojans / still open, top topics, and an **auto-generated gap report**: "Questions USC's websites can't answer", produced by Claude from the unanswered and Trojan-answered log. Seeded trend data is labeled "sample."
- **Judge mode.** A strip on home: "Judging? Open the helper view in a second tab and answer your own question." Real people will also staff it from 11 AM to 2 PM Sunday.

## Tier 2: build second (9 PM to midnight), each behind its own flag
- **"Show me" (screen-aware help).** The student uploads a screenshot or captures a tab with a single getDisplayMedia frame grab. Claude vision returns numbered steps with normalized boxes, drawn as numbered overlays. **Test 3 screenshots in 20 minutes before committing.** If the boxes are off, ship steps-only with a highlighted crop. Warn users not to upload screens that show grades or IDs. Two demo screenshots are pre-tested: a public registration help page and the housing portal login page, with no personal data.
- **Voice "Call".** A big Call button with **push-to-talk** (no open mic, which fails in a loud hall). Speech-to-text uses the Web Speech API in Chrome, then the streaming Claude answer, then a TTS that **starts speaking after the first sentence**. When the router says a Trojan is needed, the voice says "Let me get you a Trojan who's done this," plays a short ring and opens the handoff. If a helper is live, the student joins their Daily room; otherwise the request is queued. If voice fails, the button falls back to text, so nothing in the core depends on it.

## Tier 3: midnight to 1 AM, if Tier 2 is done
- **Future Trojans mode.** An audience toggle that swaps in the applicant source set (admissions, majors, student life) and a persona that coaches and never writes for the student. **Applicants get AI answers plus async replies from student ambassadors only.** No live chat or video with minors, and no contact info shared. In the pitch it's one slide and one line: "the same engine helps future Trojans meet real ones."
- "Why USC?" specificity check: pitch-only unless there's time.

## Feature freeze: 1 AM. After that, only bug fixes, seeding, video and deck.

## Real usage tonight (the strongest Impact/Feasibility evidence)
- At about 6 PM, once the core works on the deployed link, put **QR codes around Ginsburg Hall** ("Stuck on something at USC? Ask a Trojan") and post in the hackathon Slack and two or three group chats. Recruit 5–10 friends and org officers as helpers.
- **Talk to the USG reps on site** today: ask what questions they field most, and quote one by name (with permission) in the pitch.
- The pitch opens with real numbers: "Since 6 PM last night: X questions, Y% answered by AI, Z verified by Trojans."

## USG runbook slide (Feasibility)
- **Owner:** the USG Academic Affairs or Student Life committee.
- **Moderation:** report button, one-semester expiry on Trojan answers, and admin approval for first-time helpers.
- **Cost:** roughly $X/month at Y questions/day, computed from real token logs (prompt caching keeps it low).
- **Spring pilot:** transfer and spring-admit orientation plus 20 orgs. Success means a median time-to-answer under 2 hours and 200 verified answers by week 6.
- **Privacy:** no student records, de-identified summaries and consent before any summary is saved.

## Tech stack
- **Next.js 15 (App Router, TS), deployed on Vercel** in the first hour. Use the Node runtime for AI routes and set `maxDuration`.
- **Claude**: `@anthropic-ai/sdk`, `claude-opus-5-5`, adaptive thinking, **`effort: "low"`** for ask/route (with a single streaming call) and `medium` for vision and the gap report. Add `fallbacks: "default"` (beta header `server-side-fallback-2026-07-01`) but budget only 10 minutes for it.
- **Knowledge**: **25–40 curated USC pages** (registrar, transfer and spring admit, D-clearance, housing, financial aid, career center, Engage/orgs, health, and transportation) scraped to Markdown, about 60–100k tokens. Prompt order:
  1. the system prompt plus official sources, behind a `cache_control` breakpoint (stable);
  2. the top-k verified answers and org info, picked by Postgres full-text search, *after* the breakpoint (volatile).
  - The model cites source IDs like `[S12]`, which the app maps to URLs. Don't use the API's citations feature, because it conflicts with structured output.
  - A keep-warm ping every 4 minutes during demo windows.
- **Answer format**: the stream starts with a one-line JSON header `{"route":"answer|trojan|both","confidence":0-1,"topics":[],"helper_tags":[]}`, then Markdown. The app parses the first line.
- **Supabase**: Postgres plus Realtime (broadcast and postgres_changes) for the helper inbox, chat and presence. RLS is off for the demo; it's on in the roadmap.
- **Video**: Daily prebuilt rooms made ahead of time, one per helper, opened in an iframe. No token server, and LiveKit is dropped.
- **Auth**: name only, stored in localStorage. USC SSO is on the roadmap slide.
- **Secrets**: only in Vercel env vars. Don't copy anything from the CollegeConnect repo.

## Data model
- `helpers` (id, name, year, major, tags[], org_slug, bio, avatar, on_shift_until)
- `orgs` (slug, name, blurb, info_md)
- `questions` (id, text, audience, org_slug, route, confidence, topics[], status open|answered_ai|answered_trojan, created_at)
- `handoffs` (id, question_id, helper_id, briefing, status, claimed_at, closed_at)
- `messages` (handoff_id, sender, body, created_at)
- `verified_answers` (id, question, answer, helper_id, topics[], tsv, approved_at, expires_at, uses, reports)

## Demo video (≤ 3 min) and live pitch
- **Video:** hook (10 s) → transfer persona asks a question, sees the two-lane answer and gets "this needs a Trojan" (35 s) → helper phone buzzes, briefing card, live chat (35 s) → approve → reworded question returns the verified answer (20 s) → Show me (15 s) → voice Call with handoff (20 s) → org front desk + QR (15 s) → USG dashboard, gap report and real numbers (20 s) → future Trojans (5 s) → runbook and ask (10 s).
- **Live pitch:** one live moment. A judge asks a question, a teammate's phone in the audience buzzes, they answer from their seat, and then: "That answer now belongs to every Trojan who asks after her." Everything else comes from the video.
- **Backup:** record each feature's footage as soon as it works.
- **Prior work:** one Devpost line: "Inspired by Jake's earlier CallJake (paid applicant coaching); all code here was written Nov 14–15."

## Timeline (now 2 PM Sat → 11 AM Sun)
| Time | Work |
|---|---|
| 2:00–3:00 | Scaffold, deploy to Vercel, Supabase schema, Daily rooms; an agent scrapes the 25–40 sources in parallel |
| 3:00–6:00 | Core loop: ask + two-lane card + routing → inbox → chat → approve → verified retrieval |
| 6:00–6:30 | QR codes up, helpers recruited, talk to USG reps |
| 6:30–9:00 | Org front desk, USG dashboard + gap report, judge mode, faces-first home, polish |
| 9:00–12:00 | Tier 2: Show me (start with the 20-minute test), then voice |
| 12:00–1:00 | Tier 3: future Trojans toggle |
| 1:00 | **Feature freeze.** An agent drafts the deck from this plan in parallel |
| 1:00–6:30 | Sleep |
| 6:30–8:00 | Bug fixes, real numbers, record remaining footage |
| 8:00–10:15 | Edit video, finish deck, write Devpost description, images |
| 10:15–11:00 | Submit (buffer) |

## Review log
- **v1 → v2 (Fable round 1, about 5.5/10):**
  - Added async-first handoffs, helpers who already have a motive, org front desk and the gap report in Tier 1, judge mode, faces-first home, two-lane answers with expiry and reporting, real usage tonight and a USG runbook.
  - Cut magic-link auth and LiveKit, and shrank the source set.
  - Fable recommended cutting voice, screen help and future Trojans. The user wants them, so they move to Tiers 2–3 behind flags and fallbacks.
