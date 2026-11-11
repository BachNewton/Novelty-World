# Serve the tiles from the Oracle server

An idea, not a plan: the owner chose to leave the tiles on Supabase for now. Take it up if the Supabase free plan's egress quota is at risk again.

## Why

The tiles are the largest thing the site serves from Supabase, and the free plan allows 5 GB of egress a month, cache hits and misses each counted against their own 5 GB. In the billing cycle starting 4 Nov 2026, cached egress reached 3.88 GB in its first six days: about 250 MB a day of ordinary play and checking, plus a 2.1 GB day when a new tile version went live. At that rate a month is about 10 GB. An organization over quota gets a grace period, and after it Supabase refuses requests, which would break every project that uses it, not only this one.

The tiles also take most of the free plan's 1 GB of storage. Supabase bills storage as the average over the cycle, so two versions side by side during a rebuild push it over.

## The idea

Serve the published folder from Novelty World's Oracle machine (`infra/oracle/README.md`), which already runs Caddy in front of the relay on ports 80 and 443. Oracle's free tier includes 10 TB of outgoing data a month, so play can't run into a limit.

- Caddy serves a tiles directory as static files, with the same year-long, immutable cache headers and CORS for the site's origin.
- `render/tile-address.ts`'s `published()` points at the new host. Nothing else in the game needs to know.
- `pipeline/upload.py` (and the GitHub workflow's publish step) copies the folder to the machine instead of the bucket, and `--clear-old` deletes old versions there.
- The bucket is emptied once the new host is live, which leaves Supabase storage at the audiobooks alone.

## Open

- Oracle or Cloudflare R2, which Hosting in the project's `CLAUDE.md` names: R2 has no egress charge and 10 GB free, but it's one more account, where Oracle is a machine already run.
- How the GitHub workflow reaches the machine to publish: an SSH key as a repository secret, or the workflow keeps the folder as an artifact and the laptop publishes it.
- Whether the machine's disk and its single network link serve several players comfortably at once.
- Whether the audiobooks bucket moves too, though at their size they don't threaten the quota.
