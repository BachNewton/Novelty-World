-- AI Compass: the results people chose to share, one row per person: sharing
-- again replaces their earlier result. The point is scored on the server from
-- the answers, which are kept so a result can be rescored if the statements
-- change. Every read and write goes through /api/ai-compass with the service
-- role. Idempotent: safe to re-run.

create table if not exists public.ai_compass_results (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null,
  name text not null,
  scope real not null,
  ownership real not null,
  answers jsonb not null,
  background jsonb not null default '{}'::jsonb
);

-- Results once kept the date they were taken, for trails of a person's
-- results over time; the map shows one point per person now.
alter table public.ai_compass_results drop column if exists taken_at;

-- Where the person sits on the low, mid and high stakes scenes alone, kept as
-- scored when shared, like the point itself.
alter table public.ai_compass_results add column if not exists by_stakes jsonb;
alter table public.ai_compass_results alter column by_stakes set not null;

drop index if exists public.ai_compass_results_profile_id;
create unique index if not exists ai_compass_results_one_per_profile on public.ai_compass_results (profile_id);

-- The route uses the service role, which bypasses RLS. No policy exists, so
-- the table is closed to everyone else, and profile ids never leave the server.
alter table public.ai_compass_results enable row level security;
