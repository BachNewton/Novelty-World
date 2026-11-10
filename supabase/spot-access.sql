-- Spot Access: when a friend's GPU machine takes SSH connections, recorded as
-- windows of one state each. Every minute pg_cron has pg_net call the check
-- route (src/app/api/spot-access/check/route.ts), which tests whether the
-- machine's SSH port opens and writes the result here. Idempotent: safe to
-- re-run.
--
-- The cron reads the route's address and its shared secret from Supabase Vault,
-- so neither lives in this file. Until both secrets exist the job does nothing:
--
--   select vault.create_secret('https://<site>/api/spot-access/check', 'spot_check_url');
--   select vault.create_secret('<the SPOT_CHECK_SECRET set in Vercel>', 'spot_check_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- One row per stretch of one state. The newest row is the current window: each
-- check that sees the same state moves its ended_at forward, so the newest
-- ended_at is when the machine was last checked. A new row is written only when
-- the state flips, or when checks stopped long enough that the stretch between
-- is unknown (src/projects/spot-access/logic.ts).
create table if not exists public.spot_windows (
  id bigint generated always as identity primary key,
  up boolean not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  constraint spot_windows_ordered check (ended_at >= started_at)
);

create index if not exists spot_windows_ended_at on public.spot_windows (ended_at desc);

alter table public.spot_windows enable row level security;

-- Everyone reads and subscribes; only the check route writes, with the service
-- role, which bypasses RLS.
drop policy if exists "spot_windows read" on public.spot_windows;
create policy "spot_windows read"
  on public.spot_windows for select
  using (true);

-- Postgres-changes subscriptions only fire for tables in this publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'spot_windows'
  ) then
    alter publication supabase_realtime add table public.spot_windows;
  end if;
end $$;

-- Scheduling a job under a name it already has replaces it.
select cron.schedule(
  'spot-access-check',
  '* * * * *',
  $job$
    select net.http_post(
      url := config.url,
      headers := jsonb_build_object('x-spot-secret', config.secret),
      timeout_milliseconds := 20000
    )
    from (
      select
        (select decrypted_secret from vault.decrypted_secrets where name = 'spot_check_url') as url,
        (select decrypted_secret from vault.decrypted_secrets where name = 'spot_check_secret') as secret
    ) as config
    where config.url is not null and config.secret is not null
  $job$
);
