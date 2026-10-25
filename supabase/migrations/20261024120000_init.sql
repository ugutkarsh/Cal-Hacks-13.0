-- Trailmap initial schema (Supabase / PostgreSQL)
-- Apply via Supabase SQL Editor or: supabase db push
-- PostGIS is NOT enabled in this migration. Places use latitude/longitude.
-- See supabase/README.md for an optional PostGIS upgrade path.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) > 0),
  avatar_url text,
  bio text,
  discoverable boolean not null default false,
  -- Approximate opt-in discovery pin only (NOT live GPS). Nullable unless discoverable.
  discovery_lat double precision,
  discovery_lng double precision,
  interests text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint profiles_discovery_coords_pair check (
    (discovery_lat is null and discovery_lng is null)
    or (discovery_lat is not null and discovery_lng is not null)
  ),
  constraint profiles_discovery_lat_range check (
    discovery_lat is null or (discovery_lat >= -90 and discovery_lat <= 90)
  ),
  constraint profiles_discovery_lng_range check (
    discovery_lng is null or (discovery_lng >= -180 and discovery_lng <= 180)
  ),
  constraint profiles_discoverable_requires_coords check (
    discoverable = false
    or (discovery_lat is not null and discovery_lng is not null)
  )
);

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  description text not null default '',
  category text not null check (
    category in (
      'hiking',
      'cycling',
      'running',
      'outdoor',
      'meetup',
      'climbing',
      'other'
    )
  ),
  latitude double precision not null check (latitude >= -90 and latitude <= 90),
  longitude double precision not null check (longitude >= -180 and longitude <= 180),
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  description text not null default '',
  category text not null check (
    category in (
      'hiking',
      'cycling',
      'running',
      'outdoor',
      'meetup',
      'climbing',
      'other'
    )
  ),
  place_id uuid references public.places (id) on delete set null,
  organizer_id uuid references public.profiles (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity integer check (capacity is null or capacity >= 0),
  image_url text,
  source_type text not null default 'community' check (
    source_type in ('community', 'apify', 'import', 'system')
  ),
  source_url text,
  -- Optional override when place_id is null
  latitude double precision check (
    latitude is null or (latitude >= -90 and latitude <= 90)
  ),
  longitude double precision check (
    longitude is null or (longitude >= -180 and longitude <= 180)
  ),
  difficulty_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_ends_after_starts check (
    ends_at is null or ends_at >= starts_at
  ),
  constraint activities_coords_pair check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null)
  ),
  constraint activities_has_location check (
    place_id is not null
    or (latitude is not null and longitude is not null)
  )
);

create table if not exists public.activity_registrations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'registered' check (
    status in ('registered', 'cancelled', 'waitlisted')
  ),
  created_at timestamptz not null default now(),
  constraint activity_registrations_unique_active unique (activity_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists places_category_idx on public.places (category);
create index if not exists places_lat_lng_idx on public.places (latitude, longitude);

create index if not exists activities_starts_at_idx on public.activities (starts_at);
create index if not exists activities_category_idx on public.activities (category);
create index if not exists activities_organizer_id_idx on public.activities (organizer_id);
create index if not exists activities_place_id_idx on public.activities (place_id);

create index if not exists activity_registrations_activity_id_idx
  on public.activity_registrations (activity_id);
create index if not exists activity_registrations_user_id_idx
  on public.activity_registrations (user_id);

create index if not exists profiles_discoverable_idx
  on public.profiles (discoverable)
  where discoverable = true;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists places_set_updated_at on public.places;
create trigger places_set_updated_at
  before update on public.places
  for each row execute function public.set_updated_at();

drop trigger if exists activities_set_updated_at on public.activities;
create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.activities enable row level security;
alter table public.activity_registrations enable row level security;

-- Profiles: public may read only discoverable profiles (limited columns via view-like policy).
-- Full row is readable for discoverable=true; clients must select only public fields.
drop policy if exists "profiles_select_discoverable_or_own" on public.profiles;
create policy "profiles_select_discoverable_or_own"
  on public.profiles
  for select
  to anon, authenticated
  using (discoverable = true or auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- Places: public read; authenticated create; update/delete only via service role for now
-- (no owner column in schema — keep writes authenticated-create, no arbitrary edit).
drop policy if exists "places_select_public" on public.places;
create policy "places_select_public"
  on public.places
  for select
  to anon, authenticated
  using (true);

drop policy if exists "places_insert_authenticated" on public.places;
create policy "places_insert_authenticated"
  on public.places
  for insert
  to authenticated
  with check (true);

-- Activities: public read all published rows (all rows are public in MVP).
drop policy if exists "activities_select_public" on public.activities;
create policy "activities_select_public"
  on public.activities
  for select
  to anon, authenticated
  using (true);

drop policy if exists "activities_insert_authenticated" on public.activities;
create policy "activities_insert_authenticated"
  on public.activities
  for insert
  to authenticated
  with check (
    organizer_id is null or organizer_id = auth.uid()
  );

drop policy if exists "activities_update_own" on public.activities;
create policy "activities_update_own"
  on public.activities
  for update
  to authenticated
  using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

drop policy if exists "activities_delete_own" on public.activities;
create policy "activities_delete_own"
  on public.activities
  for delete
  to authenticated
  using (organizer_id = auth.uid());

-- Registrations: users read own; create/cancel own only.
-- Note: unique (activity_id, user_id) prevents duplicate rows but does NOT
-- enforce capacity under concurrency. Capacity needs a transactional RPC or
-- trigger that locks the activity row and counts active registrations.
drop policy if exists "registrations_select_own" on public.activity_registrations;
create policy "registrations_select_own"
  on public.activity_registrations
  for select
  to authenticated
  using (user_id = auth.uid());

-- Allow anon/authenticated to count registrations for public attendee totals
-- without exposing user identities: use a security definer RPC instead of
-- opening select on the table. Public count function:
create or replace function public.activity_registration_counts(activity_ids uuid[])
returns table (activity_id uuid, registration_count bigint)
language sql
security definer
set search_path = public
as $$
  select r.activity_id, count(*)::bigint as registration_count
  from public.activity_registrations r
  where r.activity_id = any (activity_ids)
    and r.status = 'registered'
  group by r.activity_id;
$$;

revoke all on function public.activity_registration_counts(uuid[]) from public;
grant execute on function public.activity_registration_counts(uuid[]) to anon, authenticated;

drop policy if exists "registrations_insert_own" on public.activity_registrations;
create policy "registrations_insert_own"
  on public.activity_registrations
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "registrations_update_own" on public.activity_registrations;
create policy "registrations_update_own"
  on public.activity_registrations
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Optional seed note (not auto-inserted): use Dashboard or a seed script.
-- ---------------------------------------------------------------------------
