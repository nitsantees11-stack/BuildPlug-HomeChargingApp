-- PLUG-HOME: private Supabase Storage buckets for live media
--
-- Run after the earlier PLUG-HOME migrations (Supabase dashboard -> SQL
-- Editor -> paste this file -> Run, or `supabase db push`). It is idempotent.
-- The make-server-14a63397 edge function also creates these buckets on start
-- if they are missing, so this file only makes the setup explicit.
--
-- Used whenever the function has no CLOUDINARY_API_SECRET (or with
-- MEDIA_STORAGE=supabase):
--   make-14a63397-host-media    listing photos / videos   (50 MB, image+video)
--   make-14a63397-meter-photos  start / end meter proof   (10 MB, images)
--
-- Both buckets are private and there are deliberately no storage.objects
-- policies: the browser never reads or writes them with its own keys. The
-- function checks ownership, issues a single-use signed upload URL for one
-- exact path, verifies the object afterwards, and serves expiring signed URLs
-- only to the parties who may see the media. Objects are referenced as
-- "sb:<bucket>/<path>" in hosts.media_public_id / meter_readings.public_id /
-- uploads.public_id.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Supabase Storage is not enabled on this project; skipping';
    return;
  end if;

  insert into storage.buckets
    (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('make-14a63397-host-media', 'make-14a63397-host-media', false,
     52428800,
     array['image/jpeg', 'image/png', 'image/webp', 'image/heic',
           'image/heif', 'video/mp4', 'video/quicktime', 'video/webm']),
    ('make-14a63397-meter-photos', 'make-14a63397-meter-photos', false,
     10485760,
     array['image/jpeg', 'image/png', 'image/webp', 'image/heic',
           'image/heif'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end
$$;
