-- Family Tree project: single-row global tree storage. Idempotent: re-run it
-- after any change.
--
-- The browser app is a read-only viewer. The tree-editing CLI is the only
-- writer, through the service-role key, which bypasses RLS.

create table if not exists public.family_tree (
  id text primary key,
  data jsonb not null,
  -- The exactly optimized layout for `data`, plus the `topologyHash` of the
  -- tree it was solved for. The viewer renders it as-is and shows an error
  -- when the hash doesn't match the tree.
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
-- instead of overwriting.
alter table public.family_tree add column if not exists version integer not null default 0;

-- Enforce the rule for every writer, the service role included (triggers run
-- whatever RLS allows): a write that changes `data` without moving `version`
-- up by exactly one is rejected rather than allowed to overwrite a newer tree.
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

-- Read-only for the anon key: a select policy and no write policy.
drop policy if exists "family_tree read" on public.family_tree;
create policy "family_tree read"
  on public.family_tree for select
  using (true);

drop policy if exists "family_tree write" on public.family_tree;
drop policy if exists "family_tree update" on public.family_tree;
