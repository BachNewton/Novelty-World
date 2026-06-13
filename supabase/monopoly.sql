-- Monopoly project: one row per game, holding the authoritative GameState.
-- Run this once in the Supabase SQL editor.

create table if not exists public.monopoly_games (
  -- Game id. For now a hardcoded dev row ("dev"); a lobby will mint real
  -- ids later.
  id text primary key,
  -- The serialized GameState (see src/projects/monopoly/types.ts). The host
  -- is the only writer; all clients subscribe to changes via Realtime.
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.monopoly_games enable row level security;

-- Open read/write for v1, matching family_tree. The single-writer model is
-- enforced client-side (only the seated host persists); tighten with auth +
-- per-game membership once the lobby lands.
drop policy if exists "monopoly_games read" on public.monopoly_games;
create policy "monopoly_games read"
  on public.monopoly_games for select
  using (true);

drop policy if exists "monopoly_games write" on public.monopoly_games;
create policy "monopoly_games write"
  on public.monopoly_games for insert
  with check (true);

drop policy if exists "monopoly_games update" on public.monopoly_games;
create policy "monopoly_games update"
  on public.monopoly_games for update
  using (true) with check (true);

-- Postgres-changes subscriptions only fire for tables in this publication.
-- Guarded so re-running the migration doesn't error if it's already added.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'monopoly_games'
  ) then
    alter publication supabase_realtime add table public.monopoly_games;
  end if;
end $$;
