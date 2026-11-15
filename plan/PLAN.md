# Call a Trojan: build plan (final, v4)

> Ready to build. Fable 5.2's final review: about 7.4/10 as a plan, a top-3 contender if the core loop is flawless and the evidence lands. **Run the three first-hour tests before writing features. Obey the cut rules by the clock.**

## One-liner
USC's website tells you what the policy is. A Trojan tells you how it actually works. **Call a Trojan** answers from official sources, and when that isn't enough it **stops and hands you to a Trojan who's done it**. Every answer that Trojan gives is saved, so the next student gets it instantly.

**"Type it, show it, or say it. Every path ends at a Trojan."**

## Story and persona
Tell it in the present tense. **Maya** is an incoming transfer who starts at USC in January, and her registration opens Thursday. She doesn't know a single Trojan yet. USC's site tells her what D-clearance is, not how to actually get it. That makes her a *future* Trojan, so the future-Trojans angle is the main story with no flashback. **Daniel** (transferred from SMC last year) is the helper who answers and signs the verified badge.

## Who answers (the cold-start answer)
- **Org officers**, through each org's front desk. Answering is recruiting.
- **Peer advisors, RAs, orientation leaders, USG senators** answer students already. This gives them a log and a shared answer bank.
- **Any Trojan** with "ask me about" tags. Helper sign-up uses a shared passcode for the demo; the roadmap uses USC SSO.
- **Async first, live when possible.** The default is "a Trojan will reply, usually within 2 hours." After 1 AM it says "replies by 9 AM." When a helper with a match is on shift, the student can chat live or open a video room.
- Helpers get a **real phone buzz**: each handoff posts to a Discord channel with an **`@here` mention** and a deep link to the briefing card. Without the mention, phones on default settings stay silent.
- **Book people by name, by 7:30 PM:** one helper for the finalist pitch's audience moment, two for the 11 AM–2 PM judging window and one overnight. You are solo, so these are friends or HackSC organizers.

## The core loop (must be real and flawless)
1. **Home is faces first.** "**N Trojans online · typical reply 1 min**" with avatars and tags. Below it is one ask box with three input modes: **Type · Show me · Call**. The three suggested questions each exercise a different route: one AI answers, one needs a Trojan, one does both.
2. **Ask.** One streaming Claude call classifies and answers. The answer card has two lanes:
   - **USC says**: an answer from the official sources, with `[S#]` citations linked to usc.edu pages.
   - **Trojans say**: matching verified answers with "✓ Maya · CS '27 · Nov 2026", labeled as experience, expiring after a semester, with a report flag. **A Trojan answer never overrides an official fact.**
   - If the AI should hand off: "**This one needs a Trojan**", with the top 2–3 matched helpers and why each one matched.
   - Every card has an **"Ask a Trojan anyway"** button.
3. **Handoff.** Claude writes a briefing card: what was asked, what the AI said, what's still open and the attached screenshot, if any. It's posted to Discord and the helper inbox. The helper claims it, and they chat in realtime. "Start video" opens that helper's pre-made Daily room.
4. **Flywheel.** At close, Claude drafts a de-identified Q&A. The helper taps **Approve** or edits it, and it becomes a verified answer.
5. **Payoff.** In another browser, a *reworded* question returns that answer in the Trojans-say lane. **Every non-expired verified answer is injected after the cache breakpoint, and Claude does the matching**, so paraphrases work. This is fine for up to a few hundred answers; pgvector is on the roadmap.

## Input modes (all feed the same route → card → handoff)
- **Type**: the default.
- **Show me**: attach a screenshot, or grab one frame of a shared tab. Claude vision returns numbered steps plus normalized boxes, drawn as overlays on the card, and the image goes with the briefing.
  - Test three screenshots in 20 minutes before relying on boxes. If they're inaccurate, show steps with a highlighted crop.
  - Show a warning not to share grades or IDs.
- **Call**: push-to-talk, then Web Speech speech-to-text in Chrome fills the ask box, then a streaming answer, then TTS. **Start with the browser's `speechSynthesis`, speaking each sentence as it completes**; upgrade to ElevenLabs only if there's time left. On a Trojan route, it says "Let me get you a Trojan who's done this," plays a ring and opens the handoff, joining the Daily room if the helper is live.
  - If speech fails, it falls back to Type.

## Audiences
- **Current Trojans**: everything above.
- **Future Trojans**: a toggle on the ask box with two kinds of future Trojan.
  1. **Incoming Trojans** (admitted transfers, spring admits, admitted freshmen): the same features, with transfer and orientation sources added. This is Maya's backstory in the video.
  2. **Applicants**: AI answers from the admissions and student-life sources, plus async replies from USC's existing **student ambassadors**. **Frame it as access, not restrictions:** *"A first-gen applicant who can't pay a consultant gets a real Trojan, free."* The safety rules (async only, no contact details exchanged, coach never ghostwrite) live in the product and in Q&A answers, not in the pitch.
- **Lifecycle close:** *"Applicant, incoming, current, helper. Next fall, Maya answers the question she asked."*
- **Advertising to high schoolers:** a shareable `/future` landing page and a QR code that link straight into applicant mode.
- **No CallJake link or mention inside the product.** It appears only in the Devpost prior-work line.

## Org front desks
- `/org/[slug]` is the ask page filtered to one org, using the org's info plus its officers' answers. Misses route to that org's officers. Each desk has a printable QR code.
- **First desk: "Ask HackSC"**, tonight, for Wi-Fi, food, deadlines and judging questions. Organizers answer these on repeat, so usage is guaranteed and some judges will have used it. Ask a HackSC organizer to be a helper.
- Then one or two real student orgs, with at most 30 minutes spent recruiting them.

## USG insights (`/insights`)
- Questions asked, the share answered by AI / Trojans / still open, top topics and median time-to-answer.
- An **auto-generated gap report**, "Questions USC's websites can't answer," written by Claude from the handoff log.
- Seeded trend data is labeled "sample."

## Evidence to collect (the difference between top 10 and winning)
1. **Real usage.** QR codes around Ginsburg Hall plus the Ask HackSC desk, **up by 7:30 PM at the latest**. Post in the hackathon Slack.
2. **A named USG yes.** At about 6 PM, find the USG reps on site. Ask what they field most and whether a senator would pilot this at spring transfer orientation. Quote them only with permission.
3. **Measured accuracy.** At 6:30 AM, an agent runs 40 real questions and counts answered with citations, handed off, and invented policies (checked by hand). This goes on a slide.
4. **Real cost** per question from the token logs, for the runbook slide.
5. **Honest fallback:** with fewer than about 30 real questions, move the count off the hook and lead with the USG quote.

## USG runbook slide
- **Owner:** USG Academic Affairs or Student Life.
- **Moderation:** report button, one-semester expiry, approval for first-time helpers.
- **Cost:** $/question from logs × projected volume.
- **Spring pilot:** transfer and spring-admit orientation plus 20 orgs. Targets: median reply under 2 hours and 200 verified answers by week 6.
- **Privacy:** no student records, de-identified summaries and consent before saving.

## Tech stack
- **Next.js 15 (App Router, TS) on Vercel**, deployed in hour one. AI routes use the Node runtime with `maxDuration` set.
- **Claude** via `@anthropic-ai/sdk` with `claude-opus-5-5`, adaptive thinking and streaming.
  - `effort: "low"` for ask, `medium` for vision, briefing and the gap report.
  - `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`), with a 10-minute cap on getting it working.
  - Log `usage` per request to compute cost.
- **Prompt layout:**
  1. `[system + 25–40 official USC pages ≈ 60–100k tokens]` behind a `cache_control` breakpoint;
  2. `[org info + all verified answers + audience persona]`;
  3. the question and image.
  - The model emits a JSON header line `{"route","confidence","topics","helper_tags","used_answers"}`, then Markdown with `[S#]`/`[T#]` refs that the app maps to links.
  - A keep-warm ping runs every 4 minutes during judging windows.
- **Supabase** with Postgres and Realtime.
  - **RLS is on.** Anon can select only the public tables: `helpers`, `orgs`, `verified_answers`, and aggregate views for insights.
  - **`messages`, `handoffs` and `questions` have no anon policy.** Chat runs over a Realtime *broadcast* channel keyed by the handoff's UUID, and history loads through a server route.
  - Every write goes through server routes using the service key.
  - Tables are exported to JSON before sleeping.
- **Daily** prebuilt rooms per helper, in an iframe.
- **Discord webhook** for helper alerts.
- **Auth:** the asker gives a name only; helpers use a passcode.
- **Secrets** live only in Vercel env vars. Nothing is copied from the CollegeConnect repo.

## Data model
`helpers` (name, year, major, tags[], org_slug, avatar, on_shift_until) · `orgs` (slug, name, info_md) · `questions` (text, audience, org_slug, route, confidence, topics[], status, image_url, created_at) · `handoffs` (question_id, helper_id, briefing, status, claimed_at, closed_at) · `messages` · `verified_answers` (question, answer, helper_id, audience, topics[], approved_at, expires_at, uses, reports) · `usage_log`

## First-hour tests (10 minutes each, before any feature work)
1. **Cached streaming call.** About 80k tokens of USC pages behind the breakpoint, `claude-opus-5-5` at `effort: "low"`, run ten times.
   - Pass: `cache_read_input_tokens` is above 0 from the second call, first text arrives in under about 3 s, and the JSON header parses 10 out of 10.
   - Fail: cut pages, or move the header behind a delimiter.
2. **Realtime with RLS on the deployed link.** Insert through a server route with the service key, and watch a broadcast in a second browser on both hall Wi-Fi and a phone hotspot.
   - Pass: it arrives in under 1 s.
   - Common miss: the table isn't in the `supabase_realtime` publication.
3. **Vision boxes.** Run the two demo screenshots plus one messy one, and draw the returned boxes.
   - Pass: every box covers its target.
   - Fail: design Show me as steps plus a highlighted crop from the start.
4. **Bonus:** say the three demo questions into Chrome's speech recognition in the hall. Watch "D-clearance."

## Timeline (Sat 2 PM → Sun 11 AM), with cut rules at fixed clock times however late you start
| Time | Work |
|---|---|
| 2:00–3:00 | Scaffold, Vercel deploy, Supabase schema and RLS, Daily rooms, Discord webhook, **the first-hour tests**. In parallel, an agent scrapes the 25–40 sources |
| 3:00–6:30 | Core loop end to end on the deployed link |
| **6:30 rule** | If the loop isn't end to end, drop the video button; the dashboard becomes one SQL query |
| 6:30–7:30 | Ask HackSC desk, QR codes printed and posted, helpers recruited, USG conversation |
| 7:30–9:00 | Insights + gap report, judge strip, faces-first polish, two-lane design |
| **9:00** | Record core-loop footage. Tag the deployment as the rollback point |
| 9:00–11:30 | Show me, then Call (with `speechSynthesis` first) |
| **11:30 rule** | A mode that doesn't work on the deployed link gets flagged off and stays out of the video |
| 11:30–12:30 | Future Trojans toggle (a source swap plus a persona) and the `/future` landing page with its QR code |
| 12:30–1:00 | Write the voiceover script and deck outline. An agent drafts the deck. Export the DB |
| **1:00** | **Feature freeze.** After-hours copy switches to "replies by 9 AM" |
| 1:00–6:30 | Sleep |
| 6:30–8:00 | Accuracy run (40 questions), real numbers, bug fixes, remaining footage |
| 8:00–10:15 | Edit video, finish deck, write Devpost description (with the prior-work line), images |
| 10:15–11:00 | Submit (buffer) |
| Sun 11–2 | Staff the helper inbox live ("Live now · typical reply 1 min") while judges review |

## Video (≤ 3:00)
| Time | Segment |
|---|---|
| 0–6 s | Registrar page: "Maya starts at USC in January. Her registration opens Thursday. She doesn't know a single Trojan yet. USC's website tells her what D-clearance is. It doesn't tell her how to get it." |
| 6–12 s | She asks; the card shows *USC says* and then *This one needs a Trojan*: "So our AI does what no chatbot does. It stops." |
| 12–20 s | A phone buzzes and the briefing card appears: "Ninety seconds later Daniel, who transferred from SMC last year, answers. His answer now belongs to every transfer who asks after her." |
| 20–60 s | Chat, approve, then a reworded question returns the verified answer |
| 60–90 s | "Type it, show it, or say it," shown inside Maya's story |
| 90–115 s | Ask HackSC org desk with real numbers |
| 115–150 s | USG insights and gap report, plus the accuracy result |
| 150–175 s | Applicant mode: "A first-gen applicant who can't pay a consultant gets a real Trojan, free." Then "Applicant, incoming, current, helper. Next fall, Maya answers the question she asked." Then the runbook and the USG quote |

**Live pitch.** Open with: "Raise your hand if an upperclassman ever gave you a better answer than usc.edu." A judge asks something, the teammate's phone in the audience buzzes, and they answer from their seat. Then: "That answer now belongs to every Trojan who asks after her." Everything else comes from the video.

## Review log
- **v1 → v2 (Fable round 1, about 5.5/10):**
  - Added async-first, helpers with a motive, org desk, gap report, judge mode, faces-first, two lanes, real usage, the runbook.
  - Cut magic links and LiveKit, and shrank the source set.
  - Voice, screen and future Trojans were kept at the user's request.
- **v2 → v3 (Fable round 2, about 6.9/10):**
  - Verified answers are matched by Claude, not full-text search, so paraphrases work.
  - RLS select-only, server-side writes and a helper passcode.
  - Show me and Call became input modes of one ask box.
  - Discord alerts, "Ask a Trojan anyway," and suggested questions that each exercise a different route.
  - Future Trojans split into incoming and applicants, with incoming as Maya's backstory.
  - The Ask HackSC desk, a named USG yes, an accuracy slide, cost from logs.
  - Cut rules at 6:30, 9:00 and 11:00, plus a story-led video script.
- **v3 → v4 final (Fable round 3, about 7.4/10, "ready to build"):**
  - Maya's story is in the present tense: she's an incoming Trojan now, and Daniel signs the badge.
  - Applicants are framed as free access to a real Trojan, with a lifecycle close.
  - Show me and Call get 9:00–11:30, and the toggle gets 11:30–12:30.
  - `speechSynthesis` comes first for Call.
  - Named helpers are booked by 7:30, and Discord alerts use `@here`.
  - Chats are private: broadcast channels, with no anon policy on `messages`, `handoffs` or `questions`.
  - Three first-hour tests were added.
