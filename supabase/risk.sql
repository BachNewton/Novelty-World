-- Risk online play: one row per game, holding who sits where and the whole
-- game state, hidden information included (good faith: a screen shows each
-- seat only its own view). Idempotent: safe to re-run.

create table if not exists public.risk_games (
  -- The game's code, as players type it to join.
  id text primary key,
  -- Raised by every write. The route (/api/risk) writes with
  -- `update ... where version = <the version it read>` and re-reads when
  -- another write got there first.
  version integer not null default 0,
  -- 'lobby' while players gather, 'playing', then 'over'.
  status text not null default 'lobby',
  -- The seats in order: each a human (with their profile) or a bot.
  seats jsonb not null default '[]'::jsonb,
  -- The game once started (src/projects/risk/online/game.ts): the engine's
  -- state, the pending decision's id, the latest write's events and the
  -- latest answers. Null in the lobby.
  game jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.risk_games
  drop constraint if exists risk_games_status_check;
alter table public.risk_games
  add constraint risk_games_status_check check (status in ('lobby', 'playing', 'over'));

alter table public.risk_games enable row level security;

-- Clients read and subscribe; every write goes through the route with the
-- service role, which bypasses RLS. No insert, update or delete policy exists,
-- so those are denied to everyone else.
drop policy if exists "risk_games read" on public.risk_games;
create policy "risk_games read"
  on public.risk_games for select
  using (true);

-- Postgres-changes subscriptions only fire for tables in this publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'risk_games'
  ) then
    alter publication supabase_realtime add table public.risk_games;
  end if;
end $$;
