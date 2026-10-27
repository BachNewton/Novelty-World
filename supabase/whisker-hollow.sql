-- Whisker Hollow: the shared garden, one row per world (production plays the
-- one world 'garden'; tests and dev may name others). The row holds every baby
-- there is: where it is, and its name once it has one. The game's host writes
-- it through /api/whisker-hollow after every change. Idempotent: safe to re-run.

create table if not exists public.whisker_hollow_worlds (
  id text primary key,
  world jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.whisker_hollow_worlds enable row level security;

-- Every read and write goes through the route with the service role, which
-- bypasses RLS. No policy exists, so the table is closed to everyone else.
