-- Call a Trojan: voice calls (owned by the voice session). Paste into Supabase → SQL Editor → Run.
-- One row per call attempt: the AI Trojan stand-in (mode 'ai') or a real call to a human Trojan (mode 'human').
-- RLS on, no anon policy: read and written only by server routes with the service key.

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references questions(id) on delete set null,
  handoff_id uuid references handoffs(id) on delete set null,
  helper_id uuid references helpers(id) on delete set null,
  mode text not null check (mode in ('ai','human')),
  transport text,                          -- 'openai-webrtc' | 'twilio' | 'app-webrtc'
  status text not null default 'starting', -- starting | ringing | connected | ended | failed | no-answer
  audience text,
  prompt text,                             -- the question the student came in with, if any
  twilio_call_sid text,
  room text,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_s int,
  transcript jsonb not null default '[]'::jsonb,   -- [{role:'student'|'trojan'|'ai', text, at}]
  metrics jsonb not null default '{}'::jsonb,      -- latency measurements etc.
  meta jsonb not null default '{}'::jsonb
);
create index if not exists calls_started_idx on calls(started_at desc);

alter table calls enable row level security;
