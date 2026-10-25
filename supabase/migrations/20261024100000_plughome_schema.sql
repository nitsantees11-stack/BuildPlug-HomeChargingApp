-- PLUG-HOME schema
--
-- Run once against the project's database: Supabase dashboard -> SQL Editor ->
-- paste this file -> Run (or `supabase db push` with the Supabase CLI). It is
-- idempotent, so running it again is safe.
--
-- Access model: every read and write goes through the make-server-14a63397
-- edge function using the service role. RLS is enabled with no policies and
-- table/function privileges are revoked from anon/authenticated, so the keys
-- shipped to the browser cannot read or change these tables directly.

-- ---------------------------------------------------------------------------
-- shared
-- ---------------------------------------------------------------------------
create or replace function public.plughome_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create or replace function public.plughome_status_label(s text)
returns text
language sql
immutable
set search_path = public
as $$
  select case s
    when 'requested' then 'waiting for the host'
    when 'accepted' then 'accepted'
    when 'start_meter' then 'at the start meter'
    when 'charging' then 'charging'
    when 'end_meter' then 'at the end meter'
    when 'awaiting_pay' then 'waiting for payment'
    when 'paid' then 'paid'
    when 'cancelled' then 'cancelled'
    when 'declined' then 'declined'
    when 'disputed' then 'disputed'
    else s
  end
$$;

-- ---------------------------------------------------------------------------
-- profiles: one per auth user
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'PLUG-HOME user'
    check (char_length(name) between 1 and 60),
  role text not null default 'driver' check (role in ('driver', 'host')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- hosts: chargers on the map (owner_id null = seeded demo host)
-- ---------------------------------------------------------------------------
create table if not exists public.hosts (
  id text primary key,
  owner_id uuid references auth.users (id) on delete cascade,
  owner_name text,
  owner_initials text not null default 'PH',
  demo boolean not null default false,
  name text not null check (char_length(name) between 2 and 60),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  locality text not null default '',
  socket text not null,
  kw numeric(4, 1) not null check (kw > 0),
  rate integer not null check (rate between 1 and 100),
  perks text[] not null default '{}',
  rating numeric(2, 1) not null default 5.0,
  reviews integer not null default 0 check (reviews >= 0),
  online boolean not null default true,
  video_id text not null default 'dog',
  media_public_id text,
  media_type text check (media_type in ('image', 'video')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (demo or owner_id is not null)
);
create index if not exists hosts_owner_idx on public.hosts (owner_id);
create index if not exists hosts_created_idx on public.hosts (created_at desc);

-- ---------------------------------------------------------------------------
-- bookings: the charging session state machine
-- requested -> accepted -> start_meter -> charging -> end_meter
--   -> awaiting_pay -> paid       (cancelled / declined / disputed on the way)
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id text primary key,
  host_id text references public.hosts (id) on delete set null,
  host_name text not null,
  host_owner_id uuid references auth.users (id) on delete set null,
  driver_id uuid not null references auth.users (id) on delete cascade,
  driver_name text not null,
  car text not null default 'EV',
  demo_host boolean not null default false,
  status text not null default 'requested' check (status in (
    'requested', 'accepted', 'start_meter', 'charging', 'end_meter',
    'awaiting_pay', 'paid', 'cancelled', 'declined', 'disputed'
  )),
  start_soc smallint not null check (start_soc between 0 and 99),
  target_soc smallint not null check (target_soc between 1 and 100),
  rate integer not null check (rate > 0),
  estimate_kwh numeric(6, 1) not null check (estimate_kwh >= 0),
  estimate_amount integer not null check (estimate_amount >= 0),
  start_kwh numeric(10, 1),
  end_kwh numeric(10, 1),
  kwh_used numeric(6, 1),
  amount integer check (amount >= 0),
  ref text unique,
  paid_at timestamptz,
  dispute_stage text check (dispute_stage in ('start', 'end')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_soc > start_soc),
  check (end_kwh is null or start_kwh is null or end_kwh >= start_kwh),
  check (status <> 'paid' or (amount is not null and paid_at is not null))
);
create index if not exists bookings_driver_idx
  on public.bookings (driver_id, created_at desc);
create index if not exists bookings_host_owner_idx
  on public.bookings (host_owner_id, created_at desc);
create index if not exists bookings_host_idx on public.bookings (host_id);
-- race-proof duplicate-booking guards: one active session per driver, and per
-- real (non-demo) socket
create unique index if not exists bookings_one_active_per_driver
  on public.bookings (driver_id)
  where status in ('requested', 'accepted', 'start_meter', 'charging',
                   'end_meter', 'awaiting_pay', 'disputed');
create unique index if not exists bookings_one_active_per_host
  on public.bookings (host_id)
  where not demo_host
    and status in ('requested', 'accepted', 'start_meter', 'charging',
                   'end_meter', 'awaiting_pay', 'disputed');

-- ---------------------------------------------------------------------------
-- meter_readings: photo proof + both parties' confirmed values per stage
-- ---------------------------------------------------------------------------
create table if not exists public.meter_readings (
  booking_id text not null references public.bookings (id) on delete cascade,
  stage text not null check (stage in ('start', 'end')),
  public_id text not null,
  ocr_kwh numeric(10, 1),
  driver_value numeric(10, 1) check (driver_value > 0),
  host_value numeric(10, 1) check (host_value > 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'disputed')),
  uploaded_by text check (uploaded_by in ('driver', 'host')),
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (booking_id, stage)
);

-- ---------------------------------------------------------------------------
-- uploads: signed Cloudinary upload tickets (single use, 24h)
-- ---------------------------------------------------------------------------
create table if not exists public.uploads (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('meter', 'host_media')),
  resource_type text not null check (resource_type in ('image', 'video')),
  public_id text not null unique,
  booking_id text references public.bookings (id) on delete cascade,
  stage text check (stage in ('start', 'end')),
  host_id text references public.hosts (id) on delete cascade,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (
    (purpose = 'meter' and booking_id is not null and stage is not null)
    or (purpose = 'host_media' and host_id is not null)
  )
);
create index if not exists uploads_user_idx on public.uploads (user_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.plughome_touch();
drop trigger if exists hosts_touch on public.hosts;
create trigger hosts_touch before update on public.hosts
  for each row execute function public.plughome_touch();
drop trigger if exists bookings_touch on public.bookings;
create trigger bookings_touch before update on public.bookings
  for each row execute function public.plughome_touch();
drop trigger if exists meter_readings_touch on public.meter_readings;
create trigger meter_readings_touch before update on public.meter_readings
  for each row execute function public.plughome_touch();

-- ---------------------------------------------------------------------------
-- booking actions (atomic: row lock + party + transition checks)
-- errors use SQLSTATE PHxxx; the edge function maps xxx to the HTTP status
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
      v_by := 'driver'; v_from := array['charging']; v_next := 'end_meter';
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
-- meter confirmation (atomic: both parties' values, kWh and bill)
-- ---------------------------------------------------------------------------
create or replace function public.plughome_confirm_reading(
  p_booking_id text,
  p_stage text,
  p_user uuid,
  p_value numeric,
  p_auto boolean,
  p_max_kwh numeric
)
returns void
language plpgsql
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  r public.meter_readings%rowtype;
  v numeric := round(p_value, 1);
  v_party text;
  -- computed up front: an IF condition ends at the first THEN, so it can't
  -- hold an inline CASE
  v_expect text := case p_stage when 'start' then 'start_meter'
                                else 'end_meter' end;
begin
  if p_stage is null or p_stage not in ('start', 'end') then
    raise exception using errcode = 'PH400', message = 'Unknown meter stage.';
  end if;
  if p_value is null or p_value <= 0 or p_value > 10000000 then
    raise exception using errcode = 'PH400',
      message = 'Enter the kWh number shown on the meter.';
  end if;

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
  if b.status <> v_expect then
    raise exception using errcode = 'PH409', message = format(
      'This booking is now %s — refreshing to the latest state.',
      public.plughome_status_label(b.status));
  end if;

  select * into r from public.meter_readings
    where booking_id = b.id and stage = p_stage
    for update;
  if not found then
    raise exception using errcode = 'PH409',
      message = 'Upload the meter photo first.';
  end if;

  if p_stage = 'end' then
    if b.start_kwh is null then
      raise exception using errcode = 'PH409',
        message = 'The start reading hasn''t been confirmed yet.';
    end if;
    if v < b.start_kwh then
      raise exception using errcode = 'PH409', message = format(
        'The end reading can''t be lower than the start reading (%s kWh).',
        b.start_kwh);
    end if;
    if v - b.start_kwh > p_max_kwh then
      raise exception using errcode = 'PH409',
        message = 'That''s far more energy than one charge can use — check the reading.';
    end if;
  end if;

  if v_party = 'driver' then
    if r.driver_value is not null then
      raise exception using errcode = 'PH409',
        message = 'You''ve already confirmed this reading.';
    end if;
    r.driver_value := v;
    -- seeded demo hosts have no human owner: the server confirms for them
    if b.demo_host and p_auto then
      r.host_value := v;
    end if;
  else
    if r.host_value is not null then
      raise exception using errcode = 'PH409',
        message = 'You''ve already confirmed this reading.';
    end if;
    r.host_value := v;
  end if;

  if r.driver_value is not null and r.host_value is not null then
    if r.driver_value = r.host_value then
      r.status := 'confirmed';
      if p_stage = 'start' then
        b.start_kwh := r.driver_value;
        b.status := 'charging';
      else
        b.end_kwh := r.driver_value;
        b.kwh_used := b.end_kwh - b.start_kwh;
        b.amount := round(b.kwh_used * b.rate);
        b.status := 'awaiting_pay';
      end if;
    else
      r.status := 'disputed';
      b.status := 'disputed';
      b.dispute_stage := p_stage;
    end if;
  end if;

  update public.meter_readings
    set driver_value = r.driver_value,
        host_value = r.host_value,
        status = r.status
    where booking_id = r.booking_id and stage = r.stage;
  update public.bookings
    set status = b.status,
        start_kwh = b.start_kwh,
        end_kwh = b.end_kwh,
        kwh_used = b.kwh_used,
        amount = b.amount,
        dispute_stage = b.dispute_stage
    where id = b.id;
end
$$;

-- ---------------------------------------------------------------------------
-- lock down: server (service_role) only
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.hosts enable row level security;
alter table public.bookings enable row level security;
alter table public.meter_readings enable row level security;
alter table public.uploads enable row level security;

revoke all on table public.profiles, public.hosts, public.bookings,
  public.meter_readings, public.uploads from anon, authenticated;
grant all on table public.profiles, public.hosts, public.bookings,
  public.meter_readings, public.uploads to service_role;

revoke all on function public.plughome_booking_action(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.plughome_confirm_reading(
  text, text, uuid, numeric, boolean, numeric) from public, anon, authenticated;
revoke all on function public.plughome_status_label(text)
  from public, anon, authenticated;
grant execute on function public.plughome_booking_action(text, uuid, text, text)
  to service_role;
grant execute on function public.plughome_confirm_reading(
  text, text, uuid, numeric, boolean, numeric) to service_role;
grant execute on function public.plughome_status_label(text) to service_role;

-- ---------------------------------------------------------------------------
-- no seed rows: live data only ever comes from real users. Judge Mode's
-- sample chargers live inside the app (src/demo.ts) and never touch this
-- database; 20261025100000_plughome_live_media_cleanup.sql removes the sample
-- hosts earlier versions of this file seeded.
-- ---------------------------------------------------------------------------
