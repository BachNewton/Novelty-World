-- Monopoly AI seats: the review data a live game produces. Idempotent: safe to
-- re-run. Like monopoly_games, every table here is written only by the
-- /api/monopoly route with the service role; clients may read (RLS select
-- only) and nothing else.
--
-- A decision is referred to by where it sits in its game's log: event
-- `event_index` of the turn group numbered `turn` (src/projects/monopoly/types.ts
-- `AiDecisionRef`). The log only grows, so that place is stable, and it joins a
-- call, its reveals and its flags. No foreign keys to monopoly_games: a game
-- deleted from the lobby keeps its review data.

-- One row per model call from a live game, kept in full: `record` is the shared
-- call record (bots/ai/eval/record.ts `AiCallRecord`: the server as it described
-- itself, the exact prompt, schema and sampling sent, the raw thinking and
-- answer, timings and tokens, and what the settle step made of it). The other
-- columns are what a review queries by.
create table if not exists public.monopoly_ai_calls (
  id bigint generated always as identity primary key,
  game_id text not null,
  seat text not null,
  decision text not null,
  version text not null,
  model text,
  -- Where the decision's note or failure landed in the log; null when it left
  -- none (overtaken by the game, or held during a pause).
  turn integer,
  event_index integer,
  -- commit | stale | fail | held
  outcome text not null,
  outcome_reason text,
  ms integer,
  record jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists monopoly_ai_calls_decision
  on public.monopoly_ai_calls (game_id, turn, event_index);

-- Every time a player opens an AI decision to review it, flagged or not.
create table if not exists public.monopoly_ai_reveals (
  id bigint generated always as identity primary key,
  game_id text not null,
  turn integer not null,
  event_index integer not null,
  seat text,
  viewer_id text not null,
  viewer_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists monopoly_ai_reveals_decision
  on public.monopoly_ai_reveals (game_id, turn, event_index);

-- A player's verdict on one AI decision: categories from a fixed set, their own
-- words, and a snapshot of what the review dialog showed them (read from the
-- game by the route, never taken from the client).
create table if not exists public.monopoly_ai_flags (
  id bigint generated always as identity primary key,
  game_id text not null,
  turn integer not null,
  event_index integer not null,
  seat text not null,
  decision text,
  version text,
  model text,
  -- The call that made the decision, when it was recorded.
  call_id bigint references public.monopoly_ai_calls (id) on delete set null,
  flagger_id text not null,
  flagger_name text not null,
  categories text[] not null default '{}',
  note text not null default '',
  shown jsonb not null,
  created_at timestamptz not null default now(),
  constraint monopoly_ai_flags_says_something check (
    cardinality(categories) > 0 or note <> ''
  )
);

-- Mirrors AI_FLAG_CATEGORIES in src/projects/monopoly/bots/ai/review.ts.
-- Dropped and re-added so a changed list reaches an existing table.
alter table public.monopoly_ai_flags
  drop constraint if exists monopoly_ai_flags_categories;
alter table public.monopoly_ai_flags
  add constraint monopoly_ai_flags_categories check (
    categories <@ array[
      'misread-board', 'invented-rule', 'bad-strategy', 'leaked-info',
      'exploitable', 'broke-plan', 'too-slow', 'good-move',
      'trade-bad-for-bot', 'trade-no-human-would-take', 'trade-misread',
      'trade-fair', 'trade-tempting'
    ]::text[]
  );

create index if not exists monopoly_ai_flags_decision
  on public.monopoly_ai_flags (game_id, turn, event_index);

alter table public.monopoly_ai_calls enable row level security;
alter table public.monopoly_ai_reveals enable row level security;
alter table public.monopoly_ai_flags enable row level security;

-- Read-only for clients; no insert/update/delete policies, so only the
-- service-role route can write.
drop policy if exists "monopoly_ai_calls read" on public.monopoly_ai_calls;
create policy "monopoly_ai_calls read"
  on public.monopoly_ai_calls for select
  using (true);

drop policy if exists "monopoly_ai_reveals read" on public.monopoly_ai_reveals;
create policy "monopoly_ai_reveals read"
  on public.monopoly_ai_reveals for select
  using (true);

drop policy if exists "monopoly_ai_flags read" on public.monopoly_ai_flags;
create policy "monopoly_ai_flags read"
  on public.monopoly_ai_flags for select
  using (true);
