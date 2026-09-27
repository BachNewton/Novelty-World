-- Family Tree project: the public tree row the viewer reads, and the private
-- research data behind it. Idempotent: re-run it after any change.
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

-- ---------------------------------------------------------------------------
-- Private research data (ideas/claims-and-private-data.md). The research
-- document is the tree's source of truth; the `family_tree` row above holds
-- its public projection. Nothing below is readable by the anon key: each
-- private table is locked three ways, by RLS with no policy, by revoking the
-- grants Supabase gives `anon` and `authenticated` by default, and by the
-- CLI's `verify`, which probes each with the anon key and fails loudly if
-- anything comes back.

-- The research document, one row (`global`), at the same version as the
-- public row. The same trigger guards it against stale writes.
create table if not exists public.family_tree_private (
  id text primary key,
  data jsonb not null,
  version integer not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists family_tree_private_require_version_bump on public.family_tree_private;
create trigger family_tree_private_require_version_bump
  before update on public.family_tree_private
  for each row execute function public.family_tree_require_version_bump();

-- One row per change file: the ops as submitted, the version they were
-- checked against, the change list printed at apply, and the version the
-- apply produced. `imported` rows are change files from before this table,
-- whose versions are known only when a replay proved them.
create table if not exists public.family_tree_change (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  round text not null,
  status text not null check (status in ('draft', 'applied', 'withdrawn', 'imported')),
  ops jsonb not null,
  checked_version integer,
  changes text[],
  applied_version integer,
  applied_at timestamptz,
  note text not null default '',
  check (
    status <> 'applied'
    or (checked_version is not null and changes is not null
        and applied_version is not null and applied_at is not null)
  )
);

create unique index if not exists family_tree_change_applied_version
  on public.family_tree_change (applied_version) where status = 'applied';

-- One row per tree version: the research document as saved. `data` is
-- cleared once a version is more than 200 versions old, unless it is the
-- last version of its calendar week (UTC); the row itself stays.
create table if not exists public.family_tree_history (
  version integer primary key,
  saved_at timestamptz not null,
  change_id uuid references public.family_tree_change (id),
  data jsonb,
  has_document boolean generated always as (data is not null) stored
);

alter table public.family_tree_private enable row level security;
alter table public.family_tree_change enable row level security;
alter table public.family_tree_history enable row level security;

revoke all on table public.family_tree_private from anon, authenticated;
revoke all on table public.family_tree_change from anon, authenticated;
revoke all on table public.family_tree_history from anon, authenticated;
grant all on table public.family_tree_private to service_role;
grant all on table public.family_tree_change to service_role;
grant all on table public.family_tree_history to service_role;

-- The one tree write: in one transaction, the research document and its
-- projection move from `p_expected_version` to the next version (a stale
-- version raises serialization_failure, so nothing lands), the change
-- record and the history snapshot are inserted, and old snapshots are
-- thinned. `p_layout` and `p_layout_tree_hash` are given together when the
-- topology changed, and otherwise both null, keeping the stored layout.
-- Returns the new version.
create or replace function public.family_tree_commit(
  p_expected_version integer,
  p_document jsonb,
  p_projection jsonb,
  p_layout jsonb,
  p_layout_tree_hash text,
  p_round text,
  p_ops jsonb,
  p_changes text[],
  p_note text
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  new_version integer := p_expected_version + 1;
  new_change_id uuid;
begin
  if (p_layout is null) <> (p_layout_tree_hash is null) then
    raise exception 'family_tree_commit: a layout and its tree hash go together';
  end if;

  update public.family_tree_private
    set data = p_document, version = new_version, updated_at = now()
    where id = 'global' and version = p_expected_version;
  if not found then
    raise exception 'family_tree_commit: the research document is no longer at version %', p_expected_version
      using errcode = 'serialization_failure';
  end if;

  update public.family_tree
    set data = p_projection,
        version = new_version,
        layout = coalesce(p_layout, layout),
        layout_tree_hash = coalesce(p_layout_tree_hash, layout_tree_hash),
        updated_at = now()
    where id = 'global' and version = p_expected_version;
  if not found then
    raise exception 'family_tree_commit: the public row is no longer at version %', p_expected_version
      using errcode = 'serialization_failure';
  end if;

  insert into public.family_tree_change
      (round, status, ops, checked_version, changes, applied_version, applied_at, note)
    values
      (p_round, 'applied', p_ops, p_expected_version, p_changes, new_version, now(), p_note)
    returning id into new_change_id;

  insert into public.family_tree_history (version, saved_at, change_id, data)
    values (new_version, now(), new_change_id, p_document);

  update public.family_tree_history h
    set data = null
    where h.data is not null
      and h.version <= new_version - 200
      and h.version <> (
        select max(w.version) from public.family_tree_history w
        where date_trunc('week', w.saved_at at time zone 'UTC')
            = date_trunc('week', h.saved_at at time zone 'UTC')
      );

  return new_version;
end;
$$;

revoke all on function public.family_tree_commit(integer, jsonb, jsonb, jsonb, text, text, jsonb, text[], text)
  from public, anon, authenticated;
grant execute on function public.family_tree_commit(integer, jsonb, jsonb, jsonb, text, text, jsonb, text[], text)
  to service_role;

notify pgrst, 'reload schema';
