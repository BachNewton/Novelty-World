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

-- The move log: every accepted answer of every game, written in the same
-- transaction as the game row's update (risk_commit_answer below), so the
-- log and the row never disagree. With the seed in the row's game, it
-- replays any game. Bots and gauntlets never touch it.
create table if not exists public.risk_moves (
  game_id text not null references public.risk_games (id) on delete cascade,
  -- The decision the answer answered: 0, 1, 2... in the order taken.
  decision integer not null,
  seat integer not null,
  -- Who answered: {"kind":"human","profile":{...}} or {"kind":"bot","bot":"<id>"}.
  controller jsonb not null,
  move jsonb not null,
  created_at timestamptz not null default now(),
  primary key (game_id, decision)
);

alter table public.risk_moves enable row level security;

drop policy if exists "risk_moves read" on public.risk_moves;
create policy "risk_moves read"
  on public.risk_moves for select
  using (true);

-- Writes the row only if its version is unchanged, and logs the answer that
-- write takes, in one transaction. Returns the row as written, or null when
-- another write got there first (the route then reads again).
create or replace function public.risk_commit_answer(
  p_id text,
  p_from_version integer,
  p_status text,
  p_seats jsonb,
  p_game jsonb,
  p_decision integer,
  p_seat integer,
  p_controller jsonb,
  p_move jsonb
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  written public.risk_games;
begin
  update public.risk_games
    set version = p_from_version + 1, status = p_status, seats = p_seats, game = p_game, updated_at = now()
    where id = p_id and version = p_from_version
    returning * into written;
  if not found then
    return null;
  end if;
  insert into public.risk_moves (game_id, decision, seat, controller, move)
    values (p_id, p_decision, p_seat, p_controller, p_move);
  return jsonb_build_object(
    'id', written.id,
    'version', written.version,
    'status', written.status,
    'seats', written.seats,
    'game', written.game
  );
end;
$$;

-- Only the route's service role may call it.
revoke all on function public.risk_commit_answer(text, integer, text, jsonb, jsonb, integer, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.risk_commit_answer(text, integer, text, jsonb, jsonb, integer, integer, jsonb, jsonb) to service_role;
