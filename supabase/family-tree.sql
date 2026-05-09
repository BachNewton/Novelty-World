-- Family Tree project: single-row global tree storage.
-- Run this once in the Supabase SQL editor.

create table if not exists public.family_tree (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

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
