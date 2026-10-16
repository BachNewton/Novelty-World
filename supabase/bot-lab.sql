-- Bot Lab: one row per bot-measuring run (a gauntlet, a ratings ladder, a
-- determinism check), written live by the run's CLI so the Bot Lab page can
-- show it as it plays (src/shared/lib/bot-lab/live.ts). Idempotent: safe to
-- re-run.

create table if not exists public.bot_lab_runs (
  id uuid primary key,
  -- The game measured: 'risk', 'monopoly'.
  game text not null,
  -- The CLI that ran, such as 'risk:gauntlet'.
  tool text not null,
  bots jsonb not null default '[]'::jsonb,
  args jsonb not null default '[]'::jsonb,
  -- The seed stream, such as 'train' or 'holdout'.
  seeds text not null,
  workers integer not null,
  status text not null default 'running',
  started_at timestamptz not null,
  -- Set by the database on every write, the heartbeat's among them, so a
  -- running row whose writes have stopped shows as lost.
  updated_at timestamptz not null default now(),
  -- Games, speed, overall progress and the run's steps (live-row.ts).
  progress jsonb not null default '{}'::jsonb,
  -- The game's result and the run-log record, once the run has ended.
  result jsonb
);

alter table public.bot_lab_runs
  drop constraint if exists bot_lab_runs_status_check;
alter table public.bot_lab_runs
  add constraint bot_lab_runs_status_check check (status in ('running', 'done', 'stopped', 'failed'));

create index if not exists bot_lab_runs_started_at on public.bot_lab_runs (started_at desc);

create or replace function public.bot_lab_runs_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists bot_lab_runs_touch on public.bot_lab_runs;
create trigger bot_lab_runs_touch
  before insert or update on public.bot_lab_runs
  for each row execute function public.bot_lab_runs_touch();

alter table public.bot_lab_runs enable row level security;

-- Everyone reads and subscribes; only the measuring CLIs write, with the
-- service role, which bypasses RLS. No insert, update or delete policy exists,
-- so those are denied to everyone else.
drop policy if exists "bot_lab_runs read" on public.bot_lab_runs;
create policy "bot_lab_runs read"
  on public.bot_lab_runs for select
  using (true);

-- Postgres-changes subscriptions only fire for tables in this publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bot_lab_runs'
  ) then
    alter publication supabase_realtime add table public.bot_lab_runs;
  end if;
end $$;
