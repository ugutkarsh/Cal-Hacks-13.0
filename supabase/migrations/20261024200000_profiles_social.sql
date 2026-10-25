-- Extend profiles for editable social discovery fields + auth bootstrap.
-- Does not store home address, birth date, or live GPS.
-- Discovery pins remain opt-in approximate coordinates (rounded on write in app).

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists city text;

alter table public.profiles
  add column if not exists neighborhood text;

alter table public.profiles
  add column if not exists skill_level text;

alter table public.profiles
  add column if not exists availability_days text[] not null default '{}';

alter table public.profiles
  add column if not exists availability_start_hour integer;

alter table public.profiles
  add column if not exists availability_end_hour integer;

alter table public.profiles
  add column if not exists preferred_radius_km integer;

alter table public.profiles
  add column if not exists dm_policy text not null default 'discoverable_only';

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

comment on column public.profiles.city is
  'User-stated city for discovery context. Not a precise home address.';
comment on column public.profiles.neighborhood is
  'Optional neighborhood label only. Never a street address.';
comment on column public.profiles.discovery_lat is
  'Opt-in approximate discovery pin only. Not live GPS.';
comment on column public.profiles.dm_policy is
  'Messaging preference: everyone | discoverable_only | nobody.';

-- Constraints (drop/recreate for idempotent re-runs)
alter table public.profiles drop constraint if exists profiles_skill_level_check;
alter table public.profiles
  add constraint profiles_skill_level_check check (
    skill_level is null
    or skill_level in ('beginner', 'intermediate', 'advanced', 'any')
  );

alter table public.profiles drop constraint if exists profiles_availability_start_hour_check;
alter table public.profiles
  add constraint profiles_availability_start_hour_check check (
    availability_start_hour is null
    or (availability_start_hour >= 0 and availability_start_hour <= 23)
  );

alter table public.profiles drop constraint if exists profiles_availability_end_hour_check;
alter table public.profiles
  add constraint profiles_availability_end_hour_check check (
    availability_end_hour is null
    or (availability_end_hour >= 0 and availability_end_hour <= 23)
  );

alter table public.profiles drop constraint if exists profiles_preferred_radius_km_check;
alter table public.profiles
  add constraint profiles_preferred_radius_km_check check (
    preferred_radius_km is null
    or (preferred_radius_km >= 1 and preferred_radius_km <= 200)
  );

alter table public.profiles drop constraint if exists profiles_dm_policy_check;
alter table public.profiles
  add constraint profiles_dm_policy_check check (
    dm_policy in ('everyone', 'discoverable_only', 'nobody')
  );

alter table public.profiles drop constraint if exists profiles_city_len;
alter table public.profiles
  add constraint profiles_city_len check (
    city is null or char_length(trim(city)) between 1 and 80
  );

alter table public.profiles drop constraint if exists profiles_neighborhood_len;
alter table public.profiles
  add constraint profiles_neighborhood_len check (
    neighborhood is null or char_length(trim(neighborhood)) between 1 and 80
  );

alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles
  add constraint profiles_bio_len check (
    bio is null or char_length(bio) <= 500
  );

alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles
  add constraint profiles_display_name_len check (
    char_length(trim(display_name)) between 1 and 80
  );

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists profiles_city_idx
  on public.profiles (city)
  where city is not null;

create index if not exists profiles_interests_gin_idx
  on public.profiles using gin (interests);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_name text;
begin
  chosen_name := nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), '');
  if chosen_name is null then
    chosen_name := nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), '');
  end if;
  if chosen_name is null or char_length(chosen_name) = 0 then
    chosen_name := 'Trailmapper';
  end if;
  if char_length(chosen_name) > 80 then
    chosen_name := left(chosen_name, 80);
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, chosen_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Public discoverable projection (fuzzed coords; no dm_policy / private fields)
-- security_invoker so RLS on profiles still applies.
-- ---------------------------------------------------------------------------

create or replace view public.discoverable_profiles_public
with (security_invoker = true)
as
select
  p.id,
  p.display_name,
  p.avatar_url,
  p.bio,
  p.city,
  p.neighborhood,
  p.interests,
  p.skill_level,
  p.availability_days,
  p.availability_start_hour,
  p.availability_end_hour,
  p.preferred_radius_km,
  -- ~1km grid — approximate discovery pin only
  round(p.discovery_lat::numeric, 2)::double precision as discovery_lat,
  round(p.discovery_lng::numeric, 2)::double precision as discovery_lng,
  p.discoverable,
  p.created_at
from public.profiles p
where p.discoverable = true
  and p.discovery_lat is not null
  and p.discovery_lng is not null;

grant select on public.discoverable_profiles_public to anon, authenticated;
