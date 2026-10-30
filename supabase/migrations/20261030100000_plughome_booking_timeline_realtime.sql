-- PLUG-HOME: Ola/Uber-style trip timeline + database realtime
--
-- Run after the earlier plughome migrations (Supabase dashboard -> SQL
-- Editor -> paste this file -> Run, or `supabase db push`). Idempotent: safe
-- to run again.
--
-- What it adds
-- 1. public.booking_events — an append-only timeline for every booking
--    (requested, accepted, arrived, meter verified, charging, paid, ...).
--    Rows are written by triggers on bookings / meter_readings, so the
--    timeline is correct no matter which edge-function version is deployed.
-- 2. Row level security: a signed-in user can read only the events of
--    bookings they are the driver or the host of. Nothing else is exposed;
--    bookings, hosts and meter_readings stay service_role only.
-- 3. Realtime: booking_events is added to the supabase_realtime publication,
--    so the app gets a database push the instant any booking changes (in
--    addition to the edge function's broadcast).
-- 4. plughome_expire_stale_bookings(): auto-cancels requests the host never
--    answered and accepted bookings the driver never arrived for, so a
--    forgotten booking can't block the driver's next one forever.
-- 5. Role control: only the HOST can stop charging (finish_charging). The
--    original rule allowed only the driver, so the host's "Stop charging &
--    capture end meter" button was rejected with "Only the driver can do that."
-- 6. `avatars` storage bucket (public read) for profile photos, where each
--    signed-in user may write only inside their own `<user id>/` folder.

-- ---------------------------------------------------------------------------
-- 1. timeline table
-- ---------------------------------------------------------------------------
create table if not exists public.booking_events (
  id bigint generated always as identity primary key,
  booking_id text not null references public.bookings (id) on delete cascade,
  driver_id uuid,
  host_owner_id uuid,
  event text not null check (event in ('created', 'status', 'reading', 'expired')),
  from_status text,
  to_status text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists booking_events_booking_idx
  on public.booking_events (booking_id, created_at);
create index if not exists booking_events_driver_idx
  on public.booking_events (driver_id, created_at desc);
create index if not exists booking_events_host_idx
  on public.booking_events (host_owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. triggers
-- ---------------------------------------------------------------------------
create or replace function public.plughome_log_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.booking_events
      (booking_id, driver_id, host_owner_id, event, to_status, meta)
    values
      (new.id, new.driver_id, new.host_owner_id, 'created', new.status,
       jsonb_build_object('host_name', new.host_name,
                          'estimate_amount', new.estimate_amount));
  elsif new.status is distinct from old.status then
    insert into public.booking_events
      (booking_id, driver_id, host_owner_id, event, from_status, to_status, meta)
    values
      (new.id, new.driver_id, new.host_owner_id, 'status', old.status,
       new.status,
       jsonb_strip_nulls(jsonb_build_object(
         'amount', new.amount,
         'kwh_used', new.kwh_used,
         'ref', new.ref,
         'dispute_stage', new.dispute_stage)));
  end if;
  return new;
end
$$;

drop trigger if exists plughome_booking_events on public.bookings;
create trigger plughome_booking_events
  after insert or update of status on public.bookings
  for each row execute function public.plughome_log_booking_event();

create or replace function public.plughome_log_reading_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.public_id is not distinct from old.public_id then
    return new;
  end if;
  select * into b from public.bookings where id = new.booking_id;
  if not found then return new; end if;
  insert into public.booking_events
    (booking_id, driver_id, host_owner_id, event, to_status, meta)
  values
    (new.booking_id, b.driver_id, b.host_owner_id, 'reading', b.status,
     jsonb_strip_nulls(jsonb_build_object(
       'stage', new.stage,
       'reading_status', new.status,
       'uploaded_by', new.uploaded_by)));
  return new;
end
$$;

drop trigger if exists plughome_reading_events on public.meter_readings;
create trigger plughome_reading_events
  after insert or update of status, public_id on public.meter_readings
  for each row execute function public.plughome_log_reading_event();

-- backfill: one 'created' row per existing booking, plus 'paid'
insert into public.booking_events
  (booking_id, driver_id, host_owner_id, event, to_status, created_at)
select b.id, b.driver_id, b.host_owner_id, 'created', 'requested', b.created_at
from public.bookings b
where not exists (
  select 1 from public.booking_events e
  where e.booking_id = b.id and e.event = 'created');

insert into public.booking_events
  (booking_id, driver_id, host_owner_id, event, from_status, to_status, meta,
   created_at)
select b.id, b.driver_id, b.host_owner_id, 'status', 'awaiting_pay', 'paid',
       jsonb_strip_nulls(jsonb_build_object('amount', b.amount, 'ref', b.ref)),
       b.paid_at
from public.bookings b
where b.status = 'paid' and b.paid_at is not null
  and not exists (
    select 1 from public.booking_events e
    where e.booking_id = b.id and e.to_status = 'paid');

-- ---------------------------------------------------------------------------
-- 3. access: parties read their own timeline, nobody writes from the client
-- ---------------------------------------------------------------------------
alter table public.booking_events enable row level security;

revoke all on table public.booking_events from anon, authenticated;
grant select on table public.booking_events to authenticated;
grant all on table public.booking_events to service_role;

drop policy if exists "booking parties read events" on public.booking_events;
create policy "booking parties read events"
  on public.booking_events for select
  to authenticated
  using (auth.uid() = driver_id or auth.uid() = host_owner_id);

revoke all on function public.plughome_log_booking_event()
  from public, anon, authenticated;
revoke all on function public.plughome_log_reading_event()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. realtime publication
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'booking_events') then
    alter publication supabase_realtime add table public.booking_events;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. stale booking expiry
-- ---------------------------------------------------------------------------
-- requested > 30 min without a host answer  -> cancelled
-- accepted  > 3 h without the driver arriving -> cancelled
-- (meter / charging / payment stages are never touched: real energy or money
--  is involved there, so those need the two parties to finish them.)
create or replace function public.plughome_expire_stale_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with stale as (
    update public.bookings
      set status = 'cancelled', updated_at = now()
      where (status = 'requested' and updated_at < now() - interval '30 minutes')
         or (status = 'accepted' and updated_at < now() - interval '3 hours')
      returning id
  )
  select count(*) into n from stale;
  return n;
end
$$;

revoke all on function public.plughome_expire_stale_bookings()
  from public, anon, authenticated;
grant execute on function public.plughome_expire_stale_bookings()
  to service_role;

-- Optional: run the expiry every 5 minutes with pg_cron (Dashboard ->
-- Database -> Extensions -> enable pg_cron first), then uncomment:
-- select cron.schedule('plughome-expire-stale', '*/5 * * * *',
--   $$select public.plughome_expire_stale_bookings()$$);

-- ---------------------------------------------------------------------------
-- 6. role control: host stops charging
-- ---------------------------------------------------------------------------
create or replace function public.plughome_booking_action(
  p_booking_id text,
  p_user uuid,
  p_action text,
  p_ref text default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  v_party text;
  v_by text;
  v_from text[];
  v_next text;
  v_stage text;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception using errcode = 'PH404',
      message = 'That booking no longer exists.';
  end if;
  v_party := case
    when b.driver_id = p_user then 'driver'
    when b.host_owner_id = p_user then 'host'
  end;
  if v_party is null then
    raise exception using errcode = 'PH404',
      message = 'That booking no longer exists.';
  end if;

  case p_action
    when 'accept' then
      v_by := 'host'; v_from := array['requested']; v_next := 'accepted';
    when 'decline' then
      v_by := 'host'; v_from := array['requested']; v_next := 'declined';
    when 'cancel' then
      v_by := 'driver'; v_from := array['requested', 'accepted'];
      v_next := 'cancelled';
    when 'arrive' then
      v_by := 'driver'; v_from := array['accepted']; v_next := 'start_meter';
    when 'finish_charging' then
      -- the host owns the socket, so only the host stops the session
      v_by := 'host'; v_from := array['charging']; v_next := 'end_meter';
    when 'pay_demo' then
      v_by := 'driver'; v_from := array['awaiting_pay']; v_next := 'paid';
    when 'recheck' then
      v_by := 'any'; v_from := array['disputed'];
    else
      raise exception using errcode = 'PH400',
        message = 'Unknown booking action.';
  end case;

  if v_by <> 'any' and v_by <> v_party then
    raise exception using errcode = 'PH403', message = case v_by
      when 'host' then 'Only the host can do that.'
      else 'Only the driver can do that.'
    end;
  end if;
  if not (b.status = any (v_from)) then
    raise exception using errcode = 'PH409', message = format(
      'This booking is now %s — refreshing to the latest state.',
      public.plughome_status_label(b.status));
  end if;

  if p_action = 'recheck' then
    -- both parties re-enter the disputed reading; the photo stays as evidence
    v_stage := coalesce(b.dispute_stage, 'start');
    update public.meter_readings
      set driver_value = null, host_value = null, status = 'pending'
      where booking_id = b.id and stage = v_stage;
    update public.bookings
      set status = case v_stage when 'end' then 'end_meter'
                                else 'start_meter' end,
          dispute_stage = null
      where id = b.id;
  elsif p_action = 'pay_demo' then
    if b.amount is null then
      raise exception using errcode = 'PH409',
        message = 'The bill isn''t ready yet.';
    end if;
    update public.bookings
      set status = 'paid', ref = p_ref, paid_at = now()
      where id = b.id;
  else
    update public.bookings set status = v_next where id = b.id;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. profile photos: public `avatars` bucket, owner-only writes
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Supabase Storage is not enabled on this project; skipping';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 5242880,
          array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
  on conflict (id) do update
    set public = true,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "avatars public read" on storage.objects;
  create policy "avatars public read" on storage.objects
    for select using (bucket_id = 'avatars');

  drop policy if exists "avatars owner insert" on storage.objects;
  create policy "avatars owner insert" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'avatars'
                and (storage.foldername(name))[1] = auth.uid()::text);

  drop policy if exists "avatars owner update" on storage.objects;
  create policy "avatars owner update" on storage.objects
    for update to authenticated
    using (bucket_id = 'avatars'
           and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'avatars'
                and (storage.foldername(name))[1] = auth.uid()::text);

  drop policy if exists "avatars owner delete" on storage.objects;
  create policy "avatars owner delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'avatars'
           and (storage.foldername(name))[1] = auth.uid()::text);
end
$$;
