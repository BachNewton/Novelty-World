-- Family Tree project: single-row global tree storage.
-- Run this once in the Supabase SQL editor.

create table if not exists public.family_tree (
  id text primary key,
  data jsonb not null,
  -- Cached optimal layout for `data`'s current topology, plus the hash that
  -- identifies which tree topology it was solved against. Clients render the
  -- cached layout directly when the current tree's `topologyHash` matches
  -- `layout_tree_hash`, skipping the seconds-long HiGHS IP solve. Otherwise
  -- they show a fast local-shift layout and prompt the user to click
  -- "Optimize", which spawns the solver in a worker and writes the result
  -- back here (conditional on the hash still matching to avoid trampling
  -- another contributor's edit).
  layout jsonb,
  layout_tree_hash text,
  updated_at timestamptz not null default now()
);

-- Existing rows from before the layout columns existed: add them in-place.
alter table public.family_tree add column if not exists layout jsonb;
alter table public.family_tree add column if not exists layout_tree_hash text;

-- Lost-edit protection. `version` counts writes of `data`. Writers save with
-- `update ... set data = <new>, version = <loaded> + 1 where version = <loaded>`;
-- no row back means someone else saved first, and the writer must reload
-- instead of overwriting. Layout-cache writes leave `data` and `version` alone.
alter table public.family_tree add column if not exists version integer not null default 0;

-- Enforce the rule for every writer, including browser tabs still running a
-- build from before `version` existed: a write that changes `data` without
-- moving `version` up by exactly one is rejected rather than allowed to
-- overwrite a newer tree.
create or replace function public.family_tree_require_version_bump()
returns trigger
language plpgsql
as $$
begin
  if new.data is distinct from old.data and new.version is distinct from old.version + 1 then
    raise exception 'family_tree: stale tree write (stored version %, write carried version %)',
      old.version, new.version
      using errcode = 'serialization_failure';
  end if;
  return new;
end;
$$;

drop trigger if exists family_tree_require_version_bump on public.family_tree;
create trigger family_tree_require_version_bump
  before update on public.family_tree
  for each row execute function public.family_tree_require_version_bump();

alter table public.family_tree enable row level security;

-- Open read/write for v1 (wiki-style). Tighten later if vandalism becomes an issue.
drop policy if exists "family_tree read" on public.family_tree;
create policy "family_tree read"
  on public.family_tree for select
  using (true);

drop policy if exists "family_tree write" on public.family_tree;
create policy "family_tree write"
  on public.family_tree for insert
  with check (true);

drop policy if exists "family_tree update" on public.family_tree;
create policy "family_tree update"
  on public.family_tree for update
  using (true) with check (true);
