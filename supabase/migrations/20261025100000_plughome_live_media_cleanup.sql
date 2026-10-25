-- PLUG-HOME: keep sample hosts, sample media and sample sessions out of live data
--
-- Run after 20261024100000_plughome_schema.sql (Supabase dashboard -> SQL
-- Editor -> paste this file -> Run, or `supabase db push`). It is idempotent,
-- so running it again is safe.
--
-- 1. hosts.video_id was `not null default 'dog'`, so every real listing
--    inherited a Cloudinary sample clip. Only seeded demo rows keep sample
--    footage; a real listing shows what its owner uploads (media_public_id /
--    media_type) or an honest "no photos yet".
-- 2. The edge function no longer serves or auto-confirms the owner-less
--    sample hosts (DEMO_AUTO_CONFIRM is gone; Judge Mode is a local
--    simulation inside the app). Sample bookings still in flight are closed
--    so they can't block their driver's next real booking (one active booking
--    per driver); the function hides every sample booking from the app.
-- 3. The seeded sample hosts (h1-h6) are deleted. Their old bookings keep
--    host_name and lose host_id (on delete set null).
--
-- Deploy order: deploy the edge function first, then run this file. The
-- column change is safe in either order: it only relaxes the column, so an
-- older function that still sends video_id = 'dog' keeps working, and the new
-- function never returns video_id. There is deliberately no check constraint
-- tying video_id to demo rows, because it would reject inserts from an older
-- function that is still serving. If this ran before the new function was
-- live, run it once more afterwards to clear anything written in between.

alter table public.hosts
  alter column video_id drop default,
  alter column video_id drop not null;

update public.hosts
  set video_id = null
  where not demo and video_id is not null;

update public.bookings
  set status = 'cancelled'
  where demo_host
    and status in ('requested', 'accepted', 'start_meter', 'charging',
                   'end_meter', 'awaiting_pay', 'disputed');

delete from public.hosts
  where demo and owner_id is null;
