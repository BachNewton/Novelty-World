-- Audiobook: the shelf's catalog (catalog.json), and every book's chapter audio
-- and art, in one public Storage bucket. Anyone can read a file by its public
-- URL; only the upload tool writes, with the service-role key, so the bucket
-- has no write policy.
insert into storage.buckets (id, name, public)
values ('audiobooks', 'audiobooks', true)
on conflict (id) do update set public = excluded.public;
