-- Call a Trojan: initial schema. Paste into Supabase → SQL Editor → Run.
-- RLS is on everywhere. Anon may read only orgs, verified_answers, public_helpers and aggregate views.
-- All writes go through Next.js server routes using the service-role key.

create extension if not exists pgcrypto;

create table if not exists helpers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year text,
  major text,
  tags text[] not null default '{}',
  org_slug text,
  avatar_url text,
  phone text,                       -- private: never exposed to anon
  bio text,
  on_shift_until timestamptz,
  is_ai boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists orgs (
  slug text primary key,
  name text not null,
  info_md text not null default ''
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  asker_name text,
  audience text not null default 'current' check (audience in ('current','incoming','applicant')),
  org_slug text,
  mode text not null default 'type',
  route text check (route in ('ai','trojan','both')),
  confidence real,
  topics text[] not null default '{}',
  header jsonb,
  answer_md text,
  status text not null default 'answered',
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists handoffs (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  helper_id uuid references helpers(id) on delete set null,
  briefing jsonb,
  status text not null default 'open' check (status in ('open','claimed','closed','approved')),
  draft jsonb,
  verified_answer_id uuid,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  closed_at timestamptz
);
create index if not exists handoffs_status_idx on handoffs(status, created_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references handoffs(id) on delete cascade,
  sender text not null check (sender in ('student','helper','system')),
  sender_name text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_handoff_idx on messages(handoff_id, created_at);

create table if not exists verified_answers (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  helper_id uuid references helpers(id) on delete set null,
  helper_name text,
  helper_major text,
  helper_year text,
  audience text not null default 'current',
  topics text[] not null default '{}',
  handoff_id uuid,
  is_sample boolean not null default false,
  approved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '4 months'),
  uses int not null default 0,
  reports int not null default 0
);

create table if not exists usage_log (
  id bigserial primary key,
  route text not null,
  model text not null,
  input_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10,5) not null default 0,
  ms int,
  created_at timestamptz not null default now()
);

create table if not exists gap_reports (
  id uuid primary key default gen_random_uuid(),
  body_md text not null,
  handoff_count int not null default 0,
  created_at timestamptz not null default now()
);

-- RLS
alter table helpers enable row level security;
alter table orgs enable row level security;
alter table questions enable row level security;
alter table handoffs enable row level security;
alter table messages enable row level security;
alter table verified_answers enable row level security;
alter table usage_log enable row level security;
alter table gap_reports enable row level security;

drop policy if exists "anon read orgs" on orgs;
create policy "anon read orgs" on orgs for select using (true);
drop policy if exists "anon read verified" on verified_answers;
create policy "anon read verified" on verified_answers for select using (expires_at > now());
drop policy if exists "anon read gap reports" on gap_reports;
create policy "anon read gap reports" on gap_reports for select using (true);

-- Public helper view: no phone column. security_invoker=false so it bypasses helpers RLS by design.
create or replace view public_helpers as
  select id, name, year, major, tags, org_slug, avatar_url, bio, on_shift_until, is_ai, is_demo,
         (on_shift_until is not null and on_shift_until > now()) as online
  from helpers;
grant select on public_helpers to anon, authenticated;

-- Aggregate view for insights (no question text)
create or replace view insight_route_counts as
  select coalesce(route,'pending') as route, count(*)::int as n from questions group by 1;
grant select on insight_route_counts to anon, authenticated;
